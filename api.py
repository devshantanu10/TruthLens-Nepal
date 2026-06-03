from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import os
import json
import datetime
import logging
import io
from gtts import gTTS
from src.detector import predict_authenticity, load_model
from src.fetcher import fetch_news, scrape_article_from_url
from src.config import APP_NAME, APP_VERSION

app = Flask(__name__, static_folder='web_ui', static_url_path='')
CORS(app)

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load model globally (best-effort)
try:
    pipeline = load_model()
    logger.info("Model loaded successfully")
except Exception as e:
    pipeline = None
    logger.exception("Failed to load model")

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
    
    # Pass live_news=None to skip live cross-reference (too slow for real-time)
    verdict, score, reasons, h_score, parties = predict_authenticity(text, pipeline, live_news=None)
    
    return jsonify({
        "verdict": verdict,
        "confidence": float(score) if score is not None else None,
        "reasons": reasons,
        "heuristic_score": float(h_score),
        "parties": parties,
        "timestamp": datetime.datetime.now().isoformat() 
    })

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

@app.route('/api/tts', methods=['POST'])
def generate_tts():
    data = request.get_json(silent=True) or {}
    text = (data.get('text') or '').strip()
    if not text:
        return jsonify({"status": "error", "message": "No text provided"}), 400

    try:
        tts = gTTS(text=text, lang='ne')
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
        logger.exception("TTS generation failed")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug_env = os.environ.get('FLASK_DEBUG', os.environ.get('DEBUG', ''))
    debug = str(debug_env).lower() in ('1', 'true', 'yes')
    logger.info("Starting TruthLens API on port %s (debug=%s)", port, debug)
    app.run(host='0.0.0.0', port=port, debug=debug)
