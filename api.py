# pyrefly: ignore [missing-import]
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import os
import json
import datetime
import logging
import io
import requests
# pyrefly: ignore [missing-import]
from gtts import gTTS
from src.detector import predict_authenticity, load_model
from src.fetcher import fetch_news, scrape_article_from_url
from src.transformer_detector import load_transformer_model, predict_with_transformer, is_transformer_available
from src.config import (
    APP_NAME,
    APP_VERSION,
    OPENAI_API_KEY,
    OPENAI_API_URL,
    OPENAI_MODEL,
    OPENAI_AUDIO_URL,
    OPENAI_AUDIO_MODEL,
    OPENAI_AUDIO_VOICE,
    GOOGLE_FACT_CHECK_API_KEY,
    GOOGLE_FACT_CHECK_API_URL,
)
from src.cache import (
    init_db,
    get_cached_prediction, set_cached_prediction,
    get_cached_summary, set_cached_summary
)

app = Flask(__name__, static_folder='web_ui', static_url_path='')
CORS(app)

@app.after_request
def add_private_network_headers(response):
    response.headers['Access-Control-Allow-Private-Network'] = 'true'
    return response

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialise SQLite cache (creates data/cache.db if it does not exist)
init_db()

# Load models globally (best-effort)
# 1. Try to load the fine-tuned Transformer model
transformer_loaded = load_transformer_model()
if transformer_loaded:
    logger.info("XLM-RoBERTa Transformer model loaded — using as primary detector")
else:
    logger.info("Transformer model not available — will use TF-IDF fallback")

# 2. Always load the TF-IDF fallback pipeline
try:
    pipeline = load_model()
    logger.info("TF-IDF pipeline loaded successfully")
except Exception as e:
    pipeline = None
    logger.exception("Failed to load TF-IDF model")

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/api/status', methods=['GET'])
def get_status():
    metrics = {}
    try:
        metrics_path = os.path.join('outputs', 'metrics.json')
        if os.path.exists(metrics_path):
            with open(metrics_path, 'r', encoding='utf-8') as f:
                metrics = json.load(f)
    except Exception:
        logger.exception("Unable to read metrics file")

    return jsonify({
        "app": APP_NAME,
        "version": APP_VERSION,
        "status": "online",
        "model_loaded": pipeline is not None,
        "metrics": metrics,
    })

@app.route('/api/news', methods=['GET'])
def get_news():
    # Accept refresh as a string (JS sends Date.now() which is too big for int)
    refresh = request.args.get('refresh', '0')
    try:
        news = fetch_news(str(refresh))
        return jsonify({
            "status": "success",
            "count": len(news),
            "results": news
        })
    except Exception as e:
        logger.exception("Error fetching news")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/predict', methods=['POST'])
def predict():
    data = request.get_json(silent=True) or {}
    text = data.get('text', '')
    if not text:
        return jsonify({"status": "error", "message": "No text provided"}), 400

    # ── 1. Cache lookup ─────────────────────────────────────────────────────────
    cached = get_cached_prediction(text)
    if cached:
        logger.info("Prediction served from cache")
        return jsonify({
            "verdict":         cached['verdict'],
            "confidence":      cached['confidence'],
            "reasons":         cached['reasons'],
            "heuristic_score": cached['heuristic_score'],
            "parties":         cached['parties'],
            "timestamp":       datetime.datetime.now().isoformat(),
            "cached":          True,
            "model_used":      cached.get('model_used', 'tfidf'),
        })

    # ── 2. Try Transformer model first ────────────────────────────────────────────
    model_used = 'tfidf'
    transformer_result = predict_with_transformer(text)

    if transformer_result is not None:
        verdict, prob_fake = transformer_result
        model_used = 'xlm-roberta'
        confidence = 1.0 - prob_fake if verdict == 'Credible' else prob_fake
        reasons = [
            f"🤖 XLM-RoBERTa Transformer analysis complete",
            f"{'✅ Classified as credible' if verdict == 'Credible' else '🚨 Classified as uncredible'} (confidence: {confidence:.1%})",
        ]
        h_score = 0.0
        parties = []
    else:
        # ── 3. Fallback to TF-IDF pipeline ─────────────────────────────────────────
        verdict, confidence, reasons, h_score, parties = predict_authenticity(
            text, pipeline, live_news=None
        )
        model_used = 'tfidf'

    # ── 4. Save to cache ─────────────────────────────────────────────────────────
    set_cached_prediction(
        text, verdict,
        float(confidence) if confidence is not None else None,
        reasons + [f'model_used:{model_used}'],  # embed in reasons list for cache retrieval
        float(h_score) if h_score else 0.0,
        parties
    )

    return jsonify({
        "verdict":         verdict,
        "confidence":      float(confidence) if confidence is not None else None,
        "reasons":         reasons,
        "heuristic_score": float(h_score) if h_score else 0.0,
        "parties":         parties,
        "timestamp":       datetime.datetime.now().isoformat(),
        "cached":          False,
        "model_used":      model_used,
    })

def _detect_factcheck_language(query: str) -> str:
    devanagari = sum(1 for ch in query if "\u0900" <= ch <= "\u097f")
    latin = sum(1 for ch in query if ch.isascii() and ch.isalpha())
    if devanagari > latin:
        return "ne"
    if latin > 0:
        return "en"
    return "ne"


def _factcheck_api_request(query: str, language_code: str | None) -> dict:
    params = {
        "key": GOOGLE_FACT_CHECK_API_KEY,
        "query": query,
        "pageSize": 10,
    }
    if language_code:
        params["languageCode"] = language_code

    label = language_code or "any"
    logger.info("Google Fact Check query=%r languageCode=%s", query, label)
    resp = requests.get(GOOGLE_FACT_CHECK_API_URL, params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json() if resp.content else {}

    if not isinstance(data, dict):
        data = {}
    if "claims" not in data or data["claims"] is None:
        data["claims"] = []
    return data


def _call_google_fact_check(query: str, language_code: str | None = None) -> dict:
    if not GOOGLE_FACT_CHECK_API_KEY:
        raise ValueError(
            "Google Fact Check API key is not configured. "
            "Set GOOGLE_FACT_CHECK_API_KEY or GOOGLE_API_KEY in your .env file."
        )

    detected = _detect_factcheck_language(query)
    strategies: list[str | None] = []
    if language_code:
        strategies.append(language_code)
    strategies.append(detected)
    if "en" not in strategies:
        strategies.append("en")
    if detected == "ne" and "ne" not in strategies:
        strategies.append("ne")
    strategies.append(None)

    seen: set[str] = set()
    unique_strategies: list[str | None] = []
    for lang in strategies:
        key = lang or "__any__"
        if key in seen:
            continue
        seen.add(key)
        unique_strategies.append(lang)

    strategies_tried: list[str] = []
    last_data: dict = {"claims": []}

    for lang in unique_strategies:
        label = lang or "any"
        strategies_tried.append(label)
        data = _factcheck_api_request(query, lang)
        if data.get("claims"):
            data["query_used_by_backend"] = query
            data["languageCode"] = label
            data["matched_language"] = label
            data["api_source"] = "google_fact_check_tools"
            data["fetched_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            data["search_strategies_tried"] = strategies_tried
            return data
        last_data = data

    last_data["query_used_by_backend"] = query
    last_data["languageCode"] = detected
    last_data["api_source"] = "google_fact_check_tools"
    last_data["fetched_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    last_data["search_strategies_tried"] = strategies_tried
    last_data["no_match_reason"] = (
        "Google Fact Check only indexes claims that independent fact-checkers have "
        "already reviewed. Most routine news headlines are not in this database."
    )
    return last_data


@app.route('/api/factcheck', methods=['GET', 'POST'])
def factcheck():
    if request.method == 'POST':
        payload = request.get_json(silent=True) or {}
        query = (payload.get('query') or '').strip()
        language_code = (payload.get('languageCode') or '').strip() or None
    else:
        query = (request.args.get('query') or '').strip()
        language_code = (request.args.get('languageCode') or '').strip() or None

    if not query:
        return jsonify({"status": "error", "message": "No query provided"}), 400

    try:
        return jsonify(_call_google_fact_check(query, language_code))
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else 502
        body = {}
        try:
            body = e.response.json() if e.response is not None else {}
        except Exception:
            body = {"raw": e.response.text[:500] if e.response is not None else ""}
        logger.exception("Google Fact Check API HTTP error for query=%r", query)
        return jsonify({
            "status": "error",
            "message": body.get("error", {}).get("message", str(e)),
            "query_used_by_backend": query,
            "claims": [],
            "google_error": body,
        }), status
    except Exception as e:
        logger.exception("Error calling Google Fact Check API for query=%r", query)
        return jsonify({
            "status": "error",
            "message": str(e),
            "query_used_by_backend": query,
            "claims": [],
        }), 500

@app.route('/api/scrape', methods=['GET', 'POST'])

def scrape():
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        url = data.get('url', '')
    else:
        url = request.args.get('url', '')

    if not url:
        return jsonify({"status": "error", "message": "No URL provided"}), 400

    try:
        title, text = scrape_article_from_url(url)
        return jsonify({"title": title, "text": text})
    except Exception as e:
        logger.exception("Error scraping URL: %s", url)
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/summary', methods=['POST'])
def summarize_news():
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    description = (data.get('description') or '').strip()
    source = (data.get('source') or '').strip()
    url = (data.get('url') or '').strip()

    if not title and not description:
        return jsonify({"status": "error", "message": "No title or description provided"}), 400

    # Use title + description as the cache key (URL/source can change without affecting content)
    cache_key = f"{title}\n{description}"

    # ── Cache lookup ──────────────────────────────────────────────────────────
    cached_summary = get_cached_summary(cache_key)
    if cached_summary:
        logger.info("Summary served from cache")
        return jsonify({"status": "success", "summary": cached_summary, "cached": True})
    # ─────────────────────────────────────────────────────────────────────────

    prompt = (
        "You are a senior Nepali news analyst and broadcaster. "
        "Given a news headline and preview text, write a comprehensive, detailed summary in Nepali. "
        "Your summary MUST be a long, well-structured paragraph of 10-15 sentences minimum. "
        "Cover ALL of the following aspects in depth:\n"
        "1. The core news event — what happened, who is involved, when and where\n"
        "2. Background and historical context — why this matters, what led to this\n"
        "3. Key details, statistics, quotes or data points from the article\n"
        "4. Impact and implications — how this affects the public, economy, or politics\n"
        "5. Expert opinions or official statements if applicable\n"
        "6. What might happen next — future outlook or next steps\n\n"
        "Write in a professional, informative broadcast journalism style. "
        "Use rich vocabulary and provide thorough analysis. Do NOT write a short summary. "
        "The summary should feel like a full news report, not a brief headline recap. "
        "If the preview text is in English, still answer in Nepali while preserving all meaning and details. "
        f"\nHeadline: {title}\n"
        f"Preview: {description}\n"
        f"Source: {source or 'Unknown'}\n"
        f"URL: {url or 'Unknown'}\n\n"
        "Return only the detailed summary text in Nepali."
    )

    if not OPENAI_API_KEY:
        return jsonify({"status": "error", "message": "OpenAI API key is not configured"}), 500

    try:
        resp = requests.post(
            OPENAI_API_URL,
            headers={
                'Authorization': f'Bearer {OPENAI_API_KEY}',
                'Content-Type': 'application/json'
            },
            json={
                'model': OPENAI_MODEL,
                'messages': [
                    {'role': 'system', 'content': 'You are an expert Nepali news analyst. You write comprehensive, long-form news summaries in Nepali with rich detail, context, background, impact analysis, and expert commentary. Never write short summaries. Always provide thorough, paragraph-length analysis.'},
                    {'role': 'user', 'content': prompt}
                ],
                'temperature': 0.4,
                'max_tokens': 900,
                'top_p': 1,
            },
            timeout=40
        )
        resp.raise_for_status()
        content = resp.json()
        summary = content.get('choices', [{}])[0].get('message', {}).get('content', '')
        if not summary:
            raise ValueError('Empty summary from LLM')

        summary = summary.strip()
        # Persist the AI summary so subsequent requests are instant
        set_cached_summary(cache_key, summary)
        return jsonify({"status": "success", "summary": summary, "cached": False})
    except Exception as e:
        logger.exception('LLM summary request failed')
        return jsonify({"status": "error", "message": "LLM failed or not configured"}), 500

@app.route('/api/tts', methods=['POST'])
def generate_tts():
    data = request.get_json(silent=True) or {}
    text = (data.get('text') or '').strip()
    if not text:
        return jsonify({"status": "error", "message": "No text provided"}), 400

    # Use OpenAI audio generation if configured
    if OPENAI_API_KEY and OPENAI_AUDIO_URL:
        try:
            resp = requests.post(
                OPENAI_AUDIO_URL,
                headers={
                    'Authorization': f'Bearer {OPENAI_API_KEY}',
                    'Content-Type': 'application/json',
                    'Accept': 'audio/mpeg'
                },
                json={
                    'model': OPENAI_AUDIO_MODEL,
                    'voice': OPENAI_AUDIO_VOICE,
                    'input': text,
                'format': 'mp3'
                },
                timeout=30
            )
            resp.raise_for_status()
            audio_bytes = io.BytesIO(resp.content)
            audio_bytes.seek(0)
            return send_file(
                audio_bytes,
                mimetype='audio/mpeg',
                as_attachment=False,
                download_name='tts-nepali.mp3'
            )
        except Exception as e:
            logger.warning('OpenAI audio generation failed: %s', e)

    # Fallback to gTTS (Nepali voice)
    try:
        # Cap text to avoid Google Translate API limits.
        # gTTS splits at sentence boundaries internally so 1800 chars is safe.
        safe_text = text[:1800]
        tts = gTTS(text=safe_text, lang='ne', slow=False)
        mp3_bytes = io.BytesIO()
        tts.write_to_fp(mp3_bytes)
        mp3_bytes.seek(0)
        return send_file(
            mp3_bytes,
            mimetype='audio/mpeg',
            as_attachment=False,
            download_name='tts-nepali.mp3'
        )
    except Exception as e:
        logger.exception("gTTS generation failed")
        return jsonify({"status": "error", "message": "Backend TTS not available: " + str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug_env = os.environ.get('FLASK_DEBUG', os.environ.get('DEBUG', ''))
    debug = str(debug_env).lower() in ('1', 'true', 'yes')
    logger.info("Starting TruthLens API on port %s (debug=%s)", port, debug)
    app.run(host='0.0.0.0', port=port, debug=debug)
