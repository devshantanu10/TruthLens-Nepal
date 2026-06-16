// ── Configuration ──
const API_BASE = (() => {
    try {
        const origin = window.location.origin;
        if (origin && /https?:\/\/(127\.0\.0\.1|localhost)(:5000)?$/i.test(origin)) {
            return `${origin}/api`;
        }
    } catch {
        // ignore invalid origin
    }
    return 'http://127.0.0.1:5000/api';
})();

async function fetchScrape(url) {
    const endpoints = [
        `${API_BASE}/scrape`,
        'http://127.0.0.1:5000/api/scrape',
        'http://localhost:5000/api/scrape'
    ];

    for (const endpoint of endpoints) {
        try {
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            if (!resp.ok) {
                const contentType = resp.headers.get('content-type') || '';
                const textBody = contentType.includes('application/json') ? await resp.json() : await resp.text();
                throw new Error(typeof textBody === 'string' ? textBody : textBody.message || `Status ${resp.status}`);
            }
            return await resp.json();
        } catch (err) {
            console.warn(`Scrape failed on ${endpoint}:`, err.message || err);
        }
    }
    throw new Error('Unable to reach backend scrape API. कृपया Flask चलाउनुहोस् र पेजलाई http://localhost:5000 बाट खोल्नुहोस्।');
}

function detectFactCheckLanguage(text) {
    const value = text || '';
    const devanagari = (value.match(/[\u0900-\u097F]/g) || []).length;
    const latin = (value.match(/[A-Za-z]/g) || []).length;
    if (devanagari > latin) return 'ne';
    if (latin > 0) return 'en';
    return 'ne';
}

function cleanFactCheckQuery(query) {
    let q = (query || '').replace(/\s+/g, ' ').trim();
    if (!q) return '';

    if (q.includes('|')) {
        q = q.split('|')[0].trim();
    }

    const dashMatch = q.match(/^(.+?)\s+[-–]\s+[^-–|]{1,48}$/);
    if (dashMatch) {
        const head = dashMatch[1].trim();
        if (head.split(/\s+/).length >= 4) {
            q = head;
        }
    }

    return q.replace(/\s*[-|]\s*\d{4}\s*$/, '').trim();
}

function normalizeFactCheckResponse(data, query) {
    const payload = (data && typeof data === 'object') ? { ...data } : {};
    if (!Array.isArray(payload.claims)) {
        payload.claims = [];
    }
    if (!payload.query_used_by_backend) {
        payload.query_used_by_backend = query;
    }
    if (!payload.languageCode) {
        payload.languageCode = detectFactCheckLanguage(query);
    }
    return payload;
}

const FACTCHECK_FALSE_RATINGS = [
    'false', 'fake', 'uncredible', 'incorrect', 'misleading', 'distorts',
    'भ्रामक', 'झूटो', 'गलत', 'अपुष्ट', 'कथित'
];
const FACTCHECK_TRUE_RATINGS = [
    'true', 'correct', 'credible', 'accurate', 'authentic', 'authenticated',
    'सत्य', 'वास्तविक', 'सहि', 'सही'
];

function getFactCheckRatingClass(rating) {
    const normalized = (rating || '').toLowerCase();
    if (FACTCHECK_FALSE_RATINGS.some((term) => normalized.includes(term))) {
        return 'factcheck-badge-false';
    }
    if (FACTCHECK_TRUE_RATINGS.some((term) => normalized.includes(term))) {
        return 'factcheck-badge-true';
    }
    return 'factcheck-badge-neutral';
}

function isGoogleFactCheckAuthenticated(fcData) {
    if (!fcData || !Array.isArray(fcData.claims) || fcData.claims.length === 0) {
        return false;
    }

    return fcData.claims.some((claim) =>
        (claim.claimReview || []).some((review) =>
            getFactCheckRatingClass(review.textualRating) === 'factcheck-badge-true'
        )
    );
}

function buildFactCheckQueries(query) {
    const cleaned = cleanFactCheckQuery(query);
    const normalized = cleaned || (query || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return [];

    const queries = [];
    const add = (value) => {
        const item = (value || '').replace(/\s+/g, ' ').trim();
        if (item && !queries.includes(item)) {
            queries.push(item);
        }
    };

    add(normalized);
    if (cleaned && cleaned !== normalized) {
        add(query.replace(/\s+/g, ' ').trim());
    }

    const words = normalized.split(/\s+/);
    if (words.length > 8) {
        add(words.slice(0, 8).join(' '));
    }
    if (words.length > 5) {
        add(words.slice(0, 5).join(' '));
    }

    const stopWords = new Set([
        'the', 'a', 'an', 'for', 'of', 'to', 'in', 'on', 'and', 'or', 'with', 'from', 'by',
        'at', 'least', 'has', 'have', 'been', 'said', 'that', 'recent', 'new', 'news',
        'र', 'को', 'मा', 'ले', 'गर्दै', 'भएको', 'हुने', 'छ', 'छन्', 'गरेको', 'भन्छ', 'भने'
    ]);
    const keywords = words.filter((word) => !stopWords.has(word.toLowerCase()));
    if (keywords.length >= 3) {
        add(keywords.slice(0, 6).join(' '));
        add(keywords.slice(0, 4).join(' '));
    }

    return queries;
}

async function fetchGoogleFactCheck(query) {
    if (!query) return null;

    const candidates = buildFactCheckQueries(query);
    let bestResult = null;

    for (const candidate of candidates) {
        const result = await executeFactCheckFetch(candidate);
        if (!result) continue;

        const normalized = normalizeFactCheckResponse(result, candidate);
        if (!bestResult) {
            bestResult = normalized;
        }

        if (normalized.claims.length > 0) {
            normalized.queries_tried = candidates;
            return normalized;
        }
    }

    if (bestResult) {
        bestResult.queries_tried = candidates;
    }
    return bestResult;
}

async function executeFactCheckFetch(query) {
    const body = JSON.stringify({ query });
    const postEndpoints = [
        `${API_BASE}/factcheck`,
        'http://127.0.0.1:5000/api/factcheck',
        'http://localhost:5000/api/factcheck'
    ];
    const getEndpoints = [
        `${API_BASE}/factcheck?query=${encodeURIComponent(query)}`,
        `http://127.0.0.1:5000/api/factcheck?query=${encodeURIComponent(query)}`,
        `http://localhost:5000/api/factcheck?query=${encodeURIComponent(query)}`
    ];

    for (const endpoint of postEndpoints) {
        try {
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body
            });
            const data = await resp.json();
            if (resp.ok) {
                return normalizeFactCheckResponse(data, query);
            }
            if (data && data.status === 'error') {
                return normalizeFactCheckResponse(data, query);
            }
        } catch (err) {
            console.warn(`Factcheck POST failed on ${endpoint}:`, err.message || err);
        }
    }

    for (const endpoint of getEndpoints) {
        try {
            const resp = await fetch(endpoint);
            const data = await resp.json();
            if (resp.ok) {
                return normalizeFactCheckResponse(data, query);
            }
            if (data && data.status === 'error') {
                return normalizeFactCheckResponse(data, query);
            }
        } catch (err) {
            console.warn(`Factcheck GET failed on ${endpoint}:`, err.message || err);
        }
    }

    return {
        status: 'error',
        message: 'Unable to reach backend fact-check API. Start Flask with python api.py and open the app from http://localhost:5000.',
        query_used_by_backend: query,
        claims: [],
        languageCode: detectFactCheckLanguage(query)
    };
}

let selectedTtsVoice = null;
const ttsState = {
    voice: null,
    rate: 1,
    pitch: 1,
};
let speechUtterance = null;
let ttsAudio = null;
let ttsAudioUrl = null;
let currentSpeechText = '';
let currentSpeechRequestId = 0;
let availableSpeechVoices = [];
let voiceLoadAttempts = 0;

function isSpeechSupported() {
    return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

// Prefer Nepali → Hindi → any available voice for Devanagari text
function getBestVoiceForNepali(voices) {
    return voices.find(v => /ne-NP|ne_NP/i.test(v.lang)) ||
           voices.find(v => /^ne/i.test(v.lang)) ||
           voices.find(v => /nepali/i.test(v.name)) ||
           voices.find(v => /^hi/i.test(v.lang)) ||
           voices.find(v => /hindi/i.test(v.name)) ||
           voices[0] || null;
}

function loadSpeechVoices() {
    if (!isSpeechSupported()) return;
    availableSpeechVoices = window.speechSynthesis.getVoices();
    if (!availableSpeechVoices.length && voiceLoadAttempts < 5) {
        voiceLoadAttempts += 1;
        setTimeout(loadSpeechVoices, 200);
        return;
    }
    if (!availableSpeechVoices.length) {
        console.warn('No speech voices available from browser.');
        return;
    }
    voiceLoadAttempts = 0;
    ttsState.voice = ttsState.voice || getBestVoiceForNepali(availableSpeechVoices);
    populateVoiceDropdown();
}

function populateVoiceDropdown() {
    const select = document.getElementById('tts-voice-select');
    if (!select) return;
    select.innerHTML = availableSpeechVoices.map(voice => {
        const selected = ttsState.voice && voice.name === ttsState.voice.name ? ' selected' : '';
        return `<option value="${escapeHtml(voice.name)}"${selected}>${escapeHtml(voice.name)} (${escapeHtml(voice.lang)})</option>`;
    }).join('');
}

function updateTtsStatus(message) {
    const status = document.getElementById('tts-status');
    if (!status) return;
    status.textContent = message || '';
}

function updateTtsControlLabels() {
    const rateLabel = document.getElementById('tts-rate-value');
    const pitchLabel = document.getElementById('tts-pitch-value');
    if (rateLabel) rateLabel.textContent = `${ttsState.rate.toFixed(1)}x`;
    if (pitchLabel) pitchLabel.textContent = `${ttsState.pitch.toFixed(1)}`;
}

function updateTtsButtons() {
    const playButton = document.getElementById('tts-play');
    const pauseButton = document.getElementById('tts-pause');
    const resumeButton = document.getElementById('tts-resume');
    const stopButton = document.getElementById('tts-stop');
    if (!playButton || !pauseButton || !resumeButton || !stopButton) return;

    const { audioPlaying, audioPaused } = getAudioState();
    const speechPlaying = isSpeechSupported() && window.speechSynthesis.speaking;
    const speechPaused = isSpeechSupported() && window.speechSynthesis.paused;
    const playing = audioPlaying || speechPlaying;
    const paused = audioPaused || speechPaused;

    playButton.disabled = !currentSpeechText || playing;
    pauseButton.disabled = !playing || paused;
    resumeButton.disabled = !paused;
    stopButton.disabled = !playing && !paused;
}

function releaseAudioUrl() {
    if (ttsAudioUrl) {
        URL.revokeObjectURL(ttsAudioUrl);
        ttsAudioUrl = null;
    }
}

function cancelSpeech() {
    if (isSpeechSupported()) {
        window.speechSynthesis.cancel();
    }
    if (ttsAudio) {
        ttsAudio.pause();
        ttsAudio.currentTime = 0;
    }
    speechUtterance = null;
    updateTtsButtons();
}

function getAudioState() {
    const audioPlaying = ttsAudio && !ttsAudio.paused && !ttsAudio.ended;
    const audioPaused = ttsAudio && ttsAudio.paused && ttsAudio.currentTime > 0 && !ttsAudio.ended;
    return { audioPlaying, audioPaused };
}

async function fetchTtsAudio(text) {
    const endpoints = [
        `${API_BASE}/tts`,
        'http://127.0.0.1:5000/api/tts',
        'http://localhost:5000/api/tts'
    ];

    for (const endpoint of endpoints) {
        try {
            const resp = await fetch(endpoint, {
                method: 'POST',
                mode: 'cors',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            if (!resp.ok) {
                const contentType = resp.headers.get('content-type') || '';
                const body = contentType.includes('application/json') ? await resp.json() : await resp.text();
                throw new Error(typeof body === 'string' ? body : body.message || `Status ${resp.status}`);
            }
            return await resp.blob();
        } catch (err) {
            console.warn(`TTS fetch failed from ${endpoint}:`, err.message || err);
        }
    }
    throw new Error('Unable to fetch TTS audio from backend.');
}

function playNativeSpeech(text) {
    const normalized = String(text || '').trim();
    if (!normalized) return false;
    if (!isSpeechSupported()) return false;

    // Cancel any queued utterances first (Chrome bug: stale queue blocks new speech)
    window.speechSynthesis.cancel();

    if (!availableSpeechVoices.length) {
        loadSpeechVoices();
    }

    // Pick best voice for Nepali Devanagari text
    const bestVoice = ttsState.voice || getBestVoiceForNepali(availableSpeechVoices) || null;

    speechUtterance = new SpeechSynthesisUtterance(normalized);
    speechUtterance.voice = bestVoice;
    speechUtterance.volume = 1;
    speechUtterance.rate = ttsState.rate;
    speechUtterance.pitch = ttsState.pitch;
    // Always set lang to ne-NP so the engine pronounces Devanagari correctly
    // If no Nepali voice exists, ne-NP still signals correct phoneme tables
    speechUtterance.lang = bestVoice?.lang || 'ne-NP';

    speechUtterance.onstart = () => updateTtsStatus('🔊 आवाज चालु छ...');
    speechUtterance.onend = () => {
        updateTtsButtons();
        updateTtsStatus('✅ आवाज समाप्त भयो।');
    };
    speechUtterance.onpause = () => updateTtsStatus('⏸ आवाज रोकिएको।');
    speechUtterance.onresume = () => updateTtsStatus('▶ आवाज जारी छ...');
    speechUtterance.onerror = (err) => {
        console.error('Speech synthesis error', err);
        updateTtsStatus('❌ ब्राउजर आवाज असफल भयो।');
        updateTtsButtons();
    };

    // Chrome workaround: delay speak by one tick to avoid silent failure
    setTimeout(() => window.speechSynthesis.speak(speechUtterance), 50);
    updateTtsButtons();
    updateTtsStatus('🔄 आवाज तयार गर्दै...');
    return true;
}

// ── Strip HTML tags so TTS never reads raw markup ──
function stripHtml(text) {
    return String(text || '')
        .replace(/<[^>]+>/g, ' ')   // remove all HTML tags
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
        .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '') // strip emojis
        .replace(/\s{2,}/g, ' ')    // collapse multiple spaces
        .trim();
}

// Returns true only when the backend has confirmed it is reachable
function isBackendOnline() {
    const statusEl = document.getElementById('backend-status');
    // The element gets class 'online' added by checkBackendStatus() on success.
    // It may be display:none but still class='offline' when backend is unreachable.
    return statusEl ? statusEl.classList.contains('online') : false;
}

async function speakSummary(text) {
    // Always strip HTML before speaking — summaryText may contain <strong> etc.
    const normalized = stripHtml(text);
    if (!normalized) {
        alert('सुनाउनको लागि कुनै सारांश उपलब्ध भएन।');
        return;
    }

    currentSpeechText = normalized;
    currentSpeechRequestId++;
    const reqId = currentSpeechRequestId;

    cancelSpeech();

    // Unlock audio context synchronously during the user click event.
    // This prevents NotAllowedError if the backend fetch takes >1 second.
    if (!ttsAudio) {
        ttsAudio = new Audio();
    }
    ttsAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'; // silent wav
    ttsAudio.play().catch(() => {});

    if (isBackendOnline()) {
        // ── Path A: Backend online → use gTTS Nepali mp3 (best quality) ──
        try {
            updateTtsStatus('🔄 Nepali आवाज तयार गर्दै...');
            const blob = await fetchTtsAudio(normalized);
            if (reqId !== currentSpeechRequestId) return; // superseded

            releaseAudioUrl();
            ttsAudioUrl = URL.createObjectURL(blob);
            
            ttsAudio.src = ttsAudioUrl;
            ttsAudio.volume = 1;
            ttsAudio.muted = false;
            ttsAudio.preload = 'auto';
            ttsAudio.onended  = () => { updateTtsButtons(); updateTtsStatus('✅ आवाज समाप्त।'); };
            ttsAudio.onpause  = () => updateTtsStatus('⏸ आवाज रोकिएको।');
            ttsAudio.onplay   = () => updateTtsStatus('🔊 Nepali आवाज चालु छ...');
            ttsAudio.onerror  = (e) => {
                console.error('Audio playback error', e);
                updateTtsStatus('❌ अडियो असफल — ब्राउजर आवाज प्रयास गर्दै...');
                updateTtsButtons();
                // Fallback to browser TTS if audio element fails
                playNativeSpeech(normalized);
            };
            await ttsAudio.play();
            updateTtsButtons();
            return;
        } catch (err) {
            console.warn('Backend TTS failed, falling back to browser speech:', err.message);
            updateTtsStatus('⚠️ Backend TTS असफल — ब्राउजर आवाज प्रयास गर्दै...');
        }
    } else {
        updateTtsStatus('⚠️ Backend अनलाइन छैन — बैकअप आवाज प्रयोग गर्दै...');
    }

    // ── Path B: Unofficial Google TTS API (Frontend fallback) ──
    try {
        const chunks = [];
        const words = normalized.split(' ');
        let current = '';
        for (const w of words) {
            if (current.length + w.length > 180) {
                chunks.push(current);
                current = w + ' ';
            } else {
                current += w + ' ';
            }
        }
        if (current) chunks.push(current);

        if (chunks.length > 0) {
            let chunkIndex = 0;
            const playNextChunk = () => {
                if (chunkIndex >= chunks.length) {
                    updateTtsButtons();
                    updateTtsStatus('✅ आवाज समाप्त।');
                    return;
                }
                const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunks[chunkIndex].trim())}&tl=ne&client=tw-ob`;
                ttsAudio.src = url;
                ttsAudio.onended = () => { chunkIndex++; playNextChunk(); };
                ttsAudio.onerror = () => {
                    console.warn('Google TTS chunk failed, falling back to native');
                    playNativeSpeech(normalized);
                };
                ttsAudio.play().catch(() => playNativeSpeech(normalized));
                updateTtsStatus(`🔊 Nepali आवाज चालु छ... (${chunkIndex+1}/${chunks.length})`);
            };
            playNextChunk();
            updateTtsButtons();
            return;
        }
    } catch (e) {
        console.warn('Frontend Google TTS fallback failed:', e);
    }

    // ── Path C: Browser speech synthesis (final fallback) ──
    if (isSpeechSupported()) {
        const started = playNativeSpeech(normalized);
        if (started) return;
    }

    updateTtsStatus('❌ आवाज चलाउन असफल।');
    alert('आवाज सुविधा उपलब्ध भएन।\nकृपया Flask backend चलाउनुहोस्: python api.py');
    updateTtsButtons();
}


function pauseSpeech() {
    const { audioPlaying } = getAudioState();
    if (audioPlaying) {
        ttsAudio.pause();
        updateTtsStatus('Backend audio paused.');
        updateTtsButtons();
        return;
    }
    if (!isSpeechSupported() || !window.speechSynthesis.speaking) return;
    if (!window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        updateTtsStatus('Browser speech paused.');
    }
    updateTtsButtons();
}

function resumeSpeech() {
    const { audioPaused } = getAudioState();
    if (audioPaused) {
        ttsAudio.play();
        updateTtsStatus('Resuming backend audio...');
        updateTtsButtons();
        return;
    }
    if (!isSpeechSupported() || !window.speechSynthesis.paused) return;
    window.speechSynthesis.resume();
    updateTtsStatus('Resuming browser speech...');
    updateTtsButtons();
}

function stopSpeech() {
    cancelSpeech();
    if (ttsAudio) {
        ttsAudio.pause();
        ttsAudio.currentTime = 0;
    }
    updateTtsStatus('Stopped voice playback.');
    updateTtsButtons();
}

function bindTtsControlEvents() {
    const select = document.getElementById('tts-voice-select');
    const rateInput = document.getElementById('tts-rate');
    const pitchInput = document.getElementById('tts-pitch');
    const playButton = document.getElementById('tts-play');
    const pauseButton = document.getElementById('tts-pause');
    const resumeButton = document.getElementById('tts-resume');
    const stopButton = document.getElementById('tts-stop');

    if (select) {
        populateVoiceDropdown();
        select.addEventListener('change', () => {
            const selected = availableSpeechVoices.find(v => v.name === select.value);
            if (selected) {
                ttsState.voice = selected;
                stopSpeech();
            }
        });
    }
    if (rateInput) {
        rateInput.addEventListener('input', () => {
            ttsState.rate = Number(rateInput.value);
            updateTtsControlLabels();
            stopSpeech();
        });
    }
    if (pitchInput) {
        pitchInput.addEventListener('input', () => {
            ttsState.pitch = Number(pitchInput.value);
            updateTtsControlLabels();
            stopSpeech();
        });
    }
    if (playButton) {
        playButton.addEventListener('click', () => speakSummary(currentSpeechText));
    }
    if (pauseButton) {
        pauseButton.addEventListener('click', pauseSpeech);
    }
    if (resumeButton) {
        resumeButton.addEventListener('click', resumeSpeech);
    }
    if (stopButton) {
        stopButton.addEventListener('click', stopSpeech);
    }

    updateTtsControlLabels();
    updateTtsButtons();
}

function getTtsControlsHtml() {
    return `
        <div class="tts-controls">
            <div class="tts-model-note">🎙️ आवाज स्रोत: Backend चलेको छ भने Nepali gTTS आवाज — अन्यथा ब्राउजर आवाज।</div>
            <div id="tts-status" class="tts-status"></div>
            <div class="tts-control-row">
                <label for="tts-voice-select">ब्राउजर आवाज (fallback)</label>
                <select id="tts-voice-select"></select>
            </div>
            <div class="tts-control-row">
                <label for="tts-rate">गति <span id="tts-rate-value">${ttsState.rate.toFixed(1)}x</span></label>
                <input id="tts-rate" type="range" min="0.5" max="2" step="0.1" value="${ttsState.rate}">
            </div>
            <div class="tts-control-row">
                <label for="tts-pitch">पिच <span id="tts-pitch-value">${ttsState.pitch.toFixed(1)}</span></label>
                <input id="tts-pitch" type="range" min="0" max="2" step="0.1" value="${ttsState.pitch}">
            </div>
            <div class="tts-controls-row">
                <button id="tts-play" class="tts-btn" type="button">▶ बजाउनुहोस्</button>
                <button id="tts-pause" class="tts-btn" type="button" disabled>⏸ रोक्नुहोस्</button>
                <button id="tts-resume" class="tts-btn" type="button" disabled>▶ जारी</button>
                <button id="tts-stop" class="tts-btn" type="button" disabled>⏹ बन्द</button>
            </div>
        </div>
    `;
}

function setupSpeechSynthesis() {
    if (!isSpeechSupported()) return;
    loadSpeechVoices();
    window.speechSynthesis.onvoiceschanged = loadSpeechVoices;
}

// ── State ──
const state = { 
    isAuthenticated: false, 
    isAdmin: false, 
    username: '', 
    history: [],
    news: [],          // Current page slice shown in feed
    newsPool: [],      // Full pool of all fetched articles
    facebookPosts: [], // List of Facebook posts
    feedPage: 0,       // Current page index in the pool
    feedPageSize: 10,  // Articles shown per page
    categories: ["General", "Politics", "Business", "Sports", "International", "Global"]
};

// ── Live RSS Sources (fetched directly in the browser via rss2json proxy) ──
const RSS_SOURCES = [
    { name: "OnlineKhabar",      url: "https://www.onlinekhabar.com/feed",            category: "General" },
    { name: "OnlineKhabar",      url: "https://www.onlinekhabar.com/content/politics/feed", category: "Politics" },
    { name: "Setopati",          url: "https://www.setopati.com/feed",                category: "General" },
    { name: "Ratopati",          url: "https://www.ratopati.com/feed",                category: "Politics" },
    { name: "Nagarik News",      url: "https://nagariknews.nagariknetwork.com/rss/1.xml", category: "General" },
    { name: "BBC Nepali",        url: "https://www.bbc.com/nepali/index.xml",         category: "International" },
    { name: "MyRepublica",       url: "https://myrepublica.nagariknetwork.com/rss/1.xml", category: "Business" },
    { name: "The Himalayan Times", url: "https://thehimalayantimes.com/feed",         category: "General" },
    { name: "Annapurna Post",    url: "https://annapurnapost.com/rss",                category: "General" },
    { name: "Khabarhub",         url: "https://english.khabarhub.com/feed",           category: "Politics" },
];

const RSS2JSON_API = "https://api.rss2json.com/v1/api.json?rss_url=";

// Fetch a single RSS source via rss2json
async function fetchRSSSource(source) {
    try {
        // Note: &count= requires a paid key on rss2json — free tier returns latest articles by default
        const resp = await fetch(`${RSS2JSON_API}${encodeURIComponent(source.url)}`, { cache: "no-store" });
        const data = await resp.json();
        if (data.status === "ok" && data.items) {
            return data.items.map(item => ({
                title:       item.title || "",
                link:        item.link || "#",
                description: (item.description || item.content || "")
                                .replace(/<[^>]+>/g, "")   // strip HTML tags
                                .substring(0, 180),
                source:      source.name,
                category:    source.category,
                pubDate:     item.pubDate || ""
            }));
        }
    } catch (e) {
        console.warn(`RSS fetch failed for ${source.name}:`, e?.message || e);
    }
    return [];
}

// ── Fetch News (browser-direct, no Flask needed) ──
async function fetchLiveNews(isManualRefresh = false) {
    const refreshBtnIcon = document.querySelector('#refresh-btn i');
    if (refreshBtnIcon) refreshBtnIcon.classList.add('fa-spin');

    try {
        // On manual refresh: rotate which sources we fetch from, to show variety
        // Pick 4 sources in round-robin order based on feedPage
        const offset = isManualRefresh ? state.feedPage : 0;
        const sources = [
            RSS_SOURCES[(offset + 0) % RSS_SOURCES.length],
            RSS_SOURCES[(offset + 1) % RSS_SOURCES.length],
            RSS_SOURCES[(offset + 2) % RSS_SOURCES.length],
            RSS_SOURCES[(offset + 3) % RSS_SOURCES.length],
        ];

        console.log(`Fetching from: ${sources.map(s => s.name).join(', ')}...`);

        // Fetch all 4 sources in parallel
        const results = await Promise.all(sources.map(fetchRSSSource));
        const freshArticles = results.flat();

        if (freshArticles.length > 0) {
            // Deduplicate by title
            const seen = new Set();
            const unique = freshArticles.filter(a => {
                const key = a.title.trim().toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            // Shuffle for variety
            for (let i = unique.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [unique[i], unique[j]] = [unique[j], unique[i]];
            }

            // Add to pool (keep max 100 articles, newest first)
            if (isManualRefresh && state.newsPool.length > 0) {
                // Prepend new articles, avoid duplicates with existing pool
                const existingTitles = new Set(state.newsPool.map(a => a.title.trim().toLowerCase()));
                const newOnly = unique.filter(a => !existingTitles.has(a.title.trim().toLowerCase()));
                state.newsPool = [...newOnly, ...state.newsPool].slice(0, 100);
            } else {
                state.newsPool = unique;
            }

            if (isManualRefresh) {
                state.feedPage = (state.feedPage + 1) % RSS_SOURCES.length;
                // Show the freshly fetched articles at top
                state.news = state.newsPool.slice(0, state.feedPageSize);
            } else {
                state.feedPage = 0;
                state.news = state.newsPool.slice(0, state.feedPageSize);
            }

            renderNewsFeed(isManualRefresh);
            renderTrending();
            updateSyncTime();
            console.log(`✅ Loaded ${state.news.length} articles. Pool: ${state.newsPool.length}`);
            if (refreshBtnIcon) refreshBtnIcon.classList.remove('fa-spin');
            return;
        }
    } catch (err) {
        console.warn("Direct RSS fetch failed:", err);
    }

    // Final fallback to mock data only if everything fails
    if (state.newsPool.length === 0) {
        state.newsPool = MOCK_NEWS_FALLBACK;
        state.news = MOCK_NEWS_FALLBACK;
        renderNewsFeed(false);
        renderTrending();
    }
    if (refreshBtnIcon) refreshBtnIcon.classList.remove('fa-spin');
}


const BACKEND_STATUS_ENDPOINTS = [
    `${API_BASE}/status`,
    'http://127.0.0.1:5000/api/status',
    'http://localhost:5000/api/status'
];

async function fetchAdminStats() {
    for (const endpoint of BACKEND_STATUS_ENDPOINTS) {
        try {
            const resp = await fetch(endpoint);
            if (!resp.ok) continue;
            const data = await resp.json();
            if (data.metrics && data.metrics.accuracy) {
                updateAdminDashboard(data.metrics);
            }
            return;
        } catch (err) {
            console.warn(`Failed to fetch admin stats from ${endpoint}`, err);
        }
    }
}

async function checkBackendStatus() {
    const statusEl = document.getElementById('backend-status');
    if (!statusEl) return;

    for (const endpoint of BACKEND_STATUS_ENDPOINTS) {
        try {
            const resp = await fetch(endpoint, { cache: 'no-store' });
            if (!resp.ok) throw new Error(`Status ${resp.status}`);
            const data = await resp.json();
            statusEl.textContent = `Backend connected: ${data.app} ${data.version}`;
            statusEl.classList.remove('offline');
            statusEl.classList.add('online');
            statusEl.style.display = 'block';
            return;
        } catch (err) {
            console.warn(`Backend status check failed for ${endpoint}`, err);
        }
    }

    // As requested, hide the 'backend not connected' line completely
    statusEl.style.display = 'none';
    statusEl.classList.remove('online');
    statusEl.classList.add('offline');
}

function updateAdminDashboard(m) {
    const kpiAccuracy = document.querySelector('.kpi-gold .kpi-val');
    if (kpiAccuracy) kpiAccuracy.textContent = (m.accuracy * 100).toFixed(1) + '%';

    const bars = {
        'शुद्धता (Accuracy)': m.accuracy,
        'Precision': m.avg_precision || (m.report?.FAKE?.precision),
        'Recall': m.report?.FAKE?.recall,
        'F1 Score': m.report?.FAKE?.['f1-score']
    };

    document.querySelectorAll('.perf-row').forEach(row => {
        const label = row.querySelector('.perf-lbl').textContent;
        const val = bars[label];
        if (val !== undefined) {
            row.querySelector('.perf-bar').style.width = (val * 100) + '%';
            row.querySelector('.perf-pct').textContent = (val * 100).toFixed(1) + '%';
        }
    });
}

// ── Updated Mock Data (Fallback) ──
const MOCK_NEWS_FALLBACK = [
    {
        source: "OnlineKhabar", 
        category: "अर्थ",
        link: "https://www.onlinekhabar.com",
        title: "नेपालको जीडीपी वृद्धि दर यस आर्थिक वर्ष ६% पुग्ने विश्व बैंकको प्रक्षेपण",
        description: "विश्व बैंकले नेपालको आर्थिक वृद्धि दर चालू आर्थिक वर्षमा ६ प्रतिशत रहने प्रक्षेपण गरेको छ।"
    },
    {
        source: "Setopati", 
        category: "मौसम",
        link: "https://www.setopati.com",
        title: "यस वर्ष मनसुन सामान्य रहने मौसम विभागको पूर्वानुमान",
        description: "जलविज्ञान तथा मौसम विज्ञान विभागले यस वर्षको मनसुन सामान्य रहने पूर्वानुमान गरेको छ।"
    },
    {
        source: "Unknown Source", 
        category: "संदिग्ध",
        link: "#",
        title: "नेपाल सरकार दिवालिया! विदेशी बैंकहरूले ऋण फिर्ता माग्दै",
        description: "SHOCKING: नेपालको राष्ट्रिय खजाना खाली भएको गोप्य दस्तावेज सार्वजनिक भयो।"
    }
];

// ── DOM ──
const dashPage     = document.getElementById('dashboard-page');
const navAdmin     = document.getElementById('nav-admin');
const displayUser  = document.getElementById('display-user');
const displayPortal= document.getElementById('display-portal');
const syncTime     = document.getElementById('sync-time');
const newsContainer= document.getElementById('news-container');
const scanHistory  = document.getElementById('scan-history');
const btnScan      = document.getElementById('btn-scan');
const scanText     = document.getElementById('scan-text');
const scanResultContainer = document.getElementById('scan-result-container');
const trendingContainer   = document.getElementById('trending-container');
const articleModal        = document.getElementById('article-modal');
const articleModalClose   = document.getElementById('article-modal-close');
const articleModalTitle   = document.getElementById('article-modal-title');
const articleModalSource  = document.getElementById('article-modal-source');
const articleModalDate    = document.getElementById('article-modal-date');
const articleModalSummary = document.getElementById('article-modal-summary');
const articleModalContent = document.getElementById('article-modal-content');

if (articleModalClose) {
    articleModalClose.addEventListener('click', () => window.closeArticleModal());
}
if (articleModal) {
    articleModal.addEventListener('click', e => {
        if (e.target === articleModal) window.closeArticleModal();
    });
}

// ── Init ──
function init() {
    updateSyncTime();
    updateNepaliDate();

    setupSpeechSynthesis();
    fetchLiveNews();

    // Seed and render Facebook feed
    state.facebookPosts = [...MOCK_FACEBOOK_POSTS];
    renderFacebookFeed();
    setupFacebookImport();

    if (state.isAdmin) fetchAdminStats();

    setInterval(updateSyncTime, 1000);
    setInterval(updateNepaliDate, 60000);
    setInterval(fetchLiveNews, 300000);
}

function updateSyncTime() {
    const timeStr = new Date().toLocaleTimeString('ne-NP');
    if (syncTime) syncTime.textContent = timeStr;
}

function updateNepaliDate() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('ne-NP', options);
    document.querySelectorAll('.nepali-date').forEach(el => el.textContent = dateStr);
}

// ── Render Functions ──
function renderNewsFeed(isManualRefresh = false) {
    if (!newsContainer) return;
    
    // Show skeleton while loading
    newsContainer.innerHTML = `
        <div class="news-card skeleton-card"></div>
        <div class="news-card skeleton-card"></div>
        <div class="news-card skeleton-card"></div>
    `;
    newsContainer.style.opacity = '1';
    
    setTimeout(() => {
        newsContainer.innerHTML = '';
        
        // Show page indicator
        const totalPages = Math.ceil(state.newsPool.length / state.feedPageSize) || 1;
        const pageInfo = document.createElement('div');
        pageInfo.style.cssText = 'font-size:.78rem;color:#999;margin-bottom:12px;display:flex;align-items:center;gap:8px;';
        pageInfo.innerHTML = `
            <span>समाचार ${state.feedPage * state.feedPageSize + 1}–${Math.min((state.feedPage + 1) * state.feedPageSize, state.newsPool.length)} / ${state.newsPool.length}</span>
            ${isManualRefresh ? '<span style="background:#C8102E;color:#fff;border-radius:20px;padding:2px 10px;font-weight:700;font-size:.7rem;">🔄 नया समाचार</span>' : ''}
        `;
        newsContainer.appendChild(pageInfo);
        
        state.news.forEach((news, index) => {
            const card = document.createElement('div');
            const isSuspect = news.category === 'संदिग्ध' || news.category === 'misinformation';
            card.className = 'news-card animate-fade-in' + (isSuspect ? ' card-suspect' : '');
            const catColor = getCategoryColor(news.category);
            card.innerHTML = `
                <div class="news-card-top">
                    <span class="cat-badge" style="background:${catColor.bg};color:${catColor.color};">${news.category || 'General'}</span>
                </div>
                <h3><a href="#" class="news-title-link">${escapeHtml(news.title)}</a></h3>
                <p>${news.description ? news.description.substring(0, 150) + '...' : ''}</p>
                <div class="card-actions">
                    <button type="button" class="verify-btn" onclick="verifyNews(${index}, this)">
                        <i class="fas fa-search"></i> सत्यापन गर्नुहोस्
                    </button>
                    <button type="button" class="summary-btn" onclick="summarizeNews(${index}, this)">
                        <i class="fas fa-lightbulb"></i> सारांश
                    </button>
                    <div id="verdict-res-${index}" style="width:100%;"></div>
                </div>
                <div id="summary-res-${index}" class="summary-result"></div>
            `;
            newsContainer.appendChild(card);
            const headlineLink = card.querySelector('.news-title-link');
            if (headlineLink) {
                headlineLink.addEventListener('click', event => {
                    event.preventDefault();
                    openSummaryModal(index);
                });
            }
        });
        
        // Fade-in new cards
        newsContainer.style.opacity = '1';
    }, 250);
}

function getCategoryColor(cat) {
    const map = { 
        'अर्थ': {bg:'#f0fdf4', color:'#15803d'}, 
        'मौसम': {bg:'#f0f9ff', color:'#0369a1'}, 
        'स्वास्थ्य': {bg:'#fef2f2', color:'#b91c1c'}, 
        'संदिग्ध': {bg:'#fff7ed', color:'#c2410c'},
        'misinformation': {bg:'#fff1f2', color:'#b91c1c'}
    };
    return map[cat] || {bg:'#f1f5f9', color:'#475569'};
}

function renderTrending() {
    if (!trendingContainer) return;
    trendingContainer.innerHTML = '';
    const suspicious = state.news.filter(n => n.category === 'संदिग्ध' || n.category === 'misinformation');
    if (suspicious.length === 0) {
        trendingContainer.innerHTML = '<div class="all-clear">✅ कुनै तत्काल संदिग्ध खबर छैन।</div>';
        return;
    }
    suspicious.forEach(news => {
        const div = document.createElement('div');
        div.className = 'trending-card';
        div.innerHTML = `<h4>⚠️ संदिग्ध: ${news.title}</h4><p>${news.source}</p>`;
        trendingContainer.appendChild(div);
    });
}

// ── Client-side heuristic engine (works without Flask) ──
const FAKE_PATTERNS = [
    // Nepali clickbait/sensationalism triggers
    /भर्खरै/i, /बिष्फोटक/i, /खुलासा/i, /आश्चर्यजनक/i, /ब्रेकिङ/i,
    /दुखद समाचार/i, /यस्तो खबर/i, /अमेरिकाबाट आयो/i, /सबैले सेयर/i,
    /कसैले नदेखोस/i, /सच्चाई लुकाइ/i, /सरकारले लुकाउँदै/i,
    /निश्चित भयो/i, /पक्का भयो/i, /खुल्यो रहस्य/i, /चौंकाउने/i,
    /गोप्य दस्तावेज/i, /षड्यन्त्र/i,
    // English sensationalism
    /BREAKING/i, /SHOCKING/i, /EXCLUSIVE/i, /VIRAL/i, /SECRET/i,
    /GOVERNMENT HIDING/i, /THEY DON'T WANT YOU/i,
    /you won't believe/i, /scientists silenced/i
];
const TRUE_PATTERNS = [
    /मन्त्रालयले/i, /सरकारले/i, /प्रधानमन्त्री/i, /संसद/i, /अदालत/i,
    /विभागले/i, /बैंकले/i, /प्रतिशत/i, /किलोमिटर/i, /रिपोर्ट/i,
    /अनुसार/i, /अध्ययन/i, /तथ्याङ्क/i, /बजेट/i, /नीति/i
];

function clientSideHeuristic(text) {
    let fakeScore = 0;
    let trueScore = 0;
    const reasons = [];

    // Check fake patterns
    for (const p of FAKE_PATTERNS) {
        if (p.test(text)) {
            fakeScore += 0.25;
            reasons.push(`📢 संदिग्ध भाषा पाइयो: "${text.match(p)[0]}"`);
            break; // One match is enough to flag
        }
    }
    // Multiple fake patterns compound
    let matchCount = FAKE_PATTERNS.filter(p => p.test(text)).length;
    fakeScore = Math.min(matchCount * 0.2, 0.9);

    // Check true patterns  
    for (const p of TRUE_PATTERNS) {
        if (p.test(text)) trueScore += 0.15;
    }
    trueScore = Math.min(trueScore, 0.6);

    // ALL CAPS check (sensationalism)
    const capsRatio = (text.match(/[A-Z]/g) || []).length / Math.max(text.length, 1);
    if (capsRatio > 0.25) {
        fakeScore += 0.2;
        reasons.push("📢 अत्यधिक CAPS — sensationalism संकेत");
    }

    // Exclamation marks
    const exclamations = (text.match(/!/g) || []).length;
    if (exclamations >= 2) {
        fakeScore += 0.15;
        reasons.push(`📢 ${exclamations} विस्मयादिबोधक चिह्न — clickbait संकेत`);
    }

    const finalScore = Math.min(fakeScore, 1.0);
    const isFake = finalScore >= 0.35 || (fakeScore > trueScore + 0.1);
    const hasTrustedSignal = trueScore >= 0.3;

    if (isFake) {
        if (reasons.length === 0) reasons.push("🚨 भ्रामक सामग्रीको संकेत पाइयो");
        return {
            verdict: "Uncredible",
            confidence: Math.max(finalScore, 0.65),
            reasons,
            source: "client"
        };
    }

    if (hasTrustedSignal) {
        if (reasons.length === 0) reasons.push("✅ सन्तुलित भाषाशैली पाइयो");
        return {
            verdict: "Credible",
            confidence: Math.max(1 - finalScore - trueScore * 0.3, 0.6),
            reasons,
            source: "client"
        };
    }

    // No strong signal to verify the text as true or false.
    if (reasons.length === 0) {
        reasons.push("✅ सामान्य भाषाशैली — स्पष्ट भ्रामक संकेत भेटिएन (Heuristic)");
    }

    return {
        verdict: "Credible",
        confidence: 0.55,
        reasons,
        source: "client"
    };
}

// ── AI Prediction Handler ──
async function handlePrediction(text, container, titleForFactCheck = null) {
    // Show loading state
    container.innerHTML = `<div style="padding:12px;color:#999;font-size:.85rem;display:flex;align-items:center;gap:8px;">
        <i class="fas fa-spinner fa-spin"></i> विश्लेषण गर्दै...
    </div>`;

    // Fetch Google Fact Check and ML prediction in parallel
    const factCheckQuery = titleForFactCheck || text;
    const factCheckPromise = fetchGoogleFactCheck(factCheckQuery);

    let res = null;
    let usedFallback = false;

    // Try Flask ML API first
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
        const resp = await fetch(`${API_BASE}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!resp.ok) {
            throw new Error(`API returned ${resp.status}`);
        }

        res = await resp.json();
        if (!res || res.status === 'error' || !res.verdict) {
            throw new Error(res?.message || 'Invalid API response');
        }
    } catch (err) {
        console.warn("Flask API unavailable or invalid response, using client-side heuristic:", err.message);
        res = clientSideHeuristic(text);
        usedFallback = true;
    }

    const verdictRaw = (res && res.verdict) ? res.verdict : 'Not in Database to Authenticate';
    const verdictKey = verdictRaw.toLowerCase();
    const isFake = verdictKey.includes('uncredible') || verdictKey.includes('fake') || verdictKey.includes('false');
    const isCredible = verdictKey.includes('credible') || verdictKey.includes('true');
    const isUnknown = !isFake && !isCredible;

    const vClass = isFake ? 'verdict-uncredible' : (isUnknown ? 'verdict-neutral' : 'verdict-credible');
    const icon = isFake ? '🚨' : (isUnknown ? '⚠️' : '✅');
    const verdictNe = isFake ? 'झूटा समाचार' : (isUnknown ? 'प्रमाणीकरण उपलब्ध छैन' : 'विश्वसनीय');
    const confidenceValue = (typeof res.confidence === 'number') ? res.confidence : null;
    const confidenceText = confidenceValue !== null
        ? `${Math.round(confidenceValue * 100)}% निश्चितता`
        : 'पक्का भन्न सकिएन';
    const engineNote = usedFallback
        ? `<div style="font-size:.72rem;color:#999;margin-top:6px;">⚠️ Heuristic fallback प्रयोग गरियो — Flask चलाउनुहोस् AI prediction का लागि</div>`
        : `<div style="font-size:.72rem;color:#16a34a;margin-top:6px;">🤖 AI ML मोडेल प्रयोग भयो</div>`;

    const reasonsList = (res.reasons || []).length > 0 ? res.reasons : ['⚠️ पर्याप्त जानकारी उपलब्ध भएन।'];

    // Wait for Fact Check result
    let fcHtml = '';
    try {
        const fcData = await factCheckPromise;
        if (fcData) {
            const apiError = fcData.status === 'error';
            const hasClaims = Array.isArray(fcData.claims) && fcData.claims.length > 0;
            const queryUsed = fcData.query_used_by_backend || factCheckQuery;
            const queriesTried = Array.isArray(fcData.queries_tried) && fcData.queries_tried.length > 0
                ? fcData.queries_tried
                : [queryUsed];
            let claimsListHtml = '';
            let totalReviews = 0;

            if (hasClaims) {
                claimsListHtml = fcData.claims.map(claim => {
                    return (claim.claimReview || []).map(review => {
                        totalReviews++;
                        const badgeClass = getFactCheckRatingClass(review.textualRating);

                        const publisherName = review.publisher ? review.publisher.name : 'Unknown Publisher';
                        const reviewUrl = review.url || '#';

                        return `
                            <div class="factcheck-card">
                                <div class="factcheck-claim-text">दाबी: "${escapeHtml(claim.text)}"</div>
                                <div class="factcheck-meta-row">
                                    ${claim.claimant ? `<span><strong>दाबीकर्ता:</strong> ${escapeHtml(claim.claimant)}</span>` : ''}
                                    <span><strong>सत्यापन:</strong> <span class="factcheck-badge ${badgeClass}">${escapeHtml(review.textualRating || 'Unknown')}</span></span>
                                    <span><strong>प्रकाशक:</strong> <a href="${escapeHtml(reviewUrl)}" target="_blank" class="factcheck-source-link">${escapeHtml(publisherName)} <i class="fas fa-external-link-alt" style="font-size:0.65rem;"></i></a></span>
                                </div>
                            </div>
                        `;
                    }).join('');
                }).join('');
            }

            if (apiError) {
                claimsListHtml = `
                    <div class="factcheck-no-results">
                        <i class="fas fa-exclamation-triangle"></i> Google Fact Check त्रुटि: ${escapeHtml(fcData.message || 'अज्ञात त्रुटि')}
                    </div>
                `;
            } else if (totalReviews === 0) {
                claimsListHtml = `
                    <div class="factcheck-empty-db">
                        <i class="fas fa-circle-check"></i>
                        <div>
                            <strong>Google Fact Check सफलतापूर्वक खोजियो</strong>
                            <p>यो विशेष दाबीको लागि कुनै प्रकाशित fact-check फेला परेन। यो नयाँ वा स्थानीय समाचारका लागि सामान्य हो — Google ले मात्र पहिले नै जाँच गरिएका दाबीहरू मात्र देखाउँछ, सबै समाचार होइन।</p>
                        </div>
                    </div>
                `;
            }

            const googleAuthenticated = !apiError && isGoogleFactCheckAuthenticated(fcData);
            const authenticatedHtml = googleAuthenticated
                ? `<div class="factcheck-authenticated">
                        <i class="fas fa-circle-check"></i> Fact checked by Google Fact Check — authenticated
                   </div>`
                : '';

            fcHtml = `
                <div class="factcheck-section">
                    <div class="factcheck-title">
                        <i class="fas fa-shield-halved"></i> Google Fact Check नतिजा
                    </div>
                    ${authenticatedHtml}
                    <div class="factcheck-query-meta">
                        <span><strong>पठाइएको क्वेरी:</strong> ${escapeHtml(queryUsed)}</span>
                        ${fcData.languageCode ? `<span><strong>मिलान भाषा:</strong> ${escapeHtml(fcData.matched_language || fcData.languageCode)}</span>` : ''}
                        ${Array.isArray(fcData.search_strategies_tried) && fcData.search_strategies_tried.length > 0
                            ? `<span><strong>खोज रणनीति:</strong> ${escapeHtml(fcData.search_strategies_tried.join(', '))}</span>`
                            : ''}
                        ${queriesTried.length > 1 ? `<span><strong>प्रयास गरिएका क्वेरी:</strong> ${escapeHtml(queriesTried.join(' | '))}</span>` : ''}
                    </div>
                    <div class="factcheck-card-list">
                        ${claimsListHtml}
                    </div>
                </div>
            `;
        } else {
            fcHtml = `
                <div class="factcheck-section">
                    <div class="factcheck-title">
                        <i class="fas fa-shield-halved"></i> Google Fact Check नतिजा
                    </div>
                    <div class="factcheck-no-results">
                        <i class="fas fa-exclamation-triangle"></i> Google Fact Check API सँग सम्पर्क हुन सकेन।
                    </div>
                </div>
            `;
        }
    } catch (fcErr) {
        console.error("Fact check resolving error:", fcErr);
        fcHtml = `
            <div class="factcheck-section">
                <div class="factcheck-title">
                    <i class="fas fa-shield-halved"></i> Google Fact Check नतिजा
                </div>
                <div class="factcheck-no-results">
                    <i class="fas fa-exclamation-triangle"></i> Google Fact Check त्रुटि: ${escapeHtml(fcErr.message || fcErr)}
                </div>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="verdict-box ${vClass}" style="margin-top:10px;">
            <div class="verdict-title">${icon} ${verdictNe} — ${confidenceText}</div>
            <div class="verdict-findings">
                <strong>विश्लेषण सारांश:</strong>
                <ul>${reasonsList.map(r => `<li>${r}</li>`).join('')}</ul>
            </div>
            ${engineNote}
            ${fcHtml}
        </div>
    `;
    return verdictRaw;
}


window.verifyNews = async function(index, btnEl) {
    const news = state.news[index];
    const resContainer = document.getElementById(`verdict-res-${index}`);
    
    btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> जाँच भइरहेको छ...';
    btnEl.disabled = true;
    
    const verdict = await handlePrediction(news.title + " " + (news.description || ""), resContainer, news.title);
    
    btnEl.innerHTML = verdict === "Uncredible" ? '🚨 संदिग्ध' : '✅ विश्वसनीय';
    btnEl.disabled = false;
    addToHistory(news.title, verdict);
};

window.openSummaryModal = async function(index) {
    if (!articleModal) return;

    const news = state.news[index] || {};
    const titleText = news.title || 'समाचार सारांश';
    const description = news.description || 'समाचारको छोटो विवरण उपलब्ध भएन।';
    const sourceHost = news.link ? (() => {
        try { return new URL(news.link).hostname; } catch { return 'source'; }
    })() : 'source';

    articleModal.classList.add('active');
    articleModal.setAttribute('aria-hidden', 'false');
    articleModalTitle.textContent = titleText;
    articleModalSource.textContent = `Source: ${sourceHost}`;
    articleModalDate.textContent = '';
    articleModalSummary.innerHTML = `
        <div class="article-summary-title">AI Summary</div>
        <div class="article-summary-text">Loading summary...</div>
    `;
    articleModalContent.innerHTML = `
        <div class="article-summary-title">Source article</div>
        <div class="article-summary-text">Loading the source text from the backend...</div>
    `;
    articleModal.classList.remove('summary-only');

    const summaryPromise = fetch(`${API_BASE}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: news.title,
            description: description,
            source: news.source,
            url: news.link
        })
    });

    const scrapePromise = fetchScrape(news.link);

    const [summaryResult, scrapeResult] = await Promise.allSettled([summaryPromise, scrapePromise]);

    let summaryText = '';
    let modalAiFailed = false;
    if (summaryResult.status === 'fulfilled') {
        try {
            const resp = summaryResult.value;
            if (resp.ok) {
                const data = await resp.json();
                summaryText = (data && data.summary) || '';
            }
        } catch (e) {
            console.warn('Modal summary JSON parse failed:', e);
        }
    }
    if (!summaryText) {
        modalAiFailed = true;
        // summarizeText returns plain text — safe for escapeHtml and TTS
        summaryText = summarizeText(news.title + '. ' + description, 10);
    }
    // Set speech text from plain-text summary (stripHtml applied inside speakSummary)
    currentSpeechText = summaryText;

    const modalAiNote = modalAiFailed
        ? `<div style="font-size:.75rem;color:#b45309;margin:4px 0 8px;">⚠️ AI सारांश अनुपलब्ध — स्वचालित विश्लेषण प्रयोग गरियो</div>`
        : `<div style="font-size:.75rem;color:#16a34a;margin:4px 0 8px;">🤖 AI द्वारा उत्पन्न सारांश</div>`;

    articleModalSummary.innerHTML = `
        <div class="article-summary-title">AI Summary</div>
        ${modalAiNote}
        <div class="article-summary-text">${escapeHtml(summaryText)}</div>
        ${getTtsControlsHtml()}
    `;
    bindTtsControlEvents();

    if (scrapeResult.status === 'fulfilled') {
        const fullText = (scrapeResult.value.text || '').trim();
        if (fullText) {
            articleModalContent.innerHTML = `
                <div class="article-summary-title">Source article</div>
                <div class="article-summary-text">${formatArticleText(fullText)}</div>
            `;
        } else {
            articleModalContent.innerHTML = `
                <div class="article-summary-title">Source article</div>
                <div class="article-summary-text">${escapeHtml(description)}</div>
                <div style="margin-top:12px;color:#b91c1c;font-size:.85rem;">Source text was empty.</div>
            `;
        }
    } else {
        articleModalContent.innerHTML = `
            <div class="article-summary-title">Source article</div>
            <div class="article-summary-text">${escapeHtml(description)}</div>
            <div style="margin-top:12px;color:#b91c1c;font-size:.85rem;">Unable to fetch the source article from the backend.</div>
        `;
    }
};

window.closeArticleModal = function() {
    if (!articleModal) return;
    articleModal.classList.remove('active');
    articleModal.classList.remove('summary-only');
    articleModal.setAttribute('aria-hidden', 'true');
};

function formatArticleText(text) {
    const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 20);
    if (!paragraphs.length) {
        return `<p>${escapeHtml(text)}</p>`;
    }
    return paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function summarizeText(text, sentenceCount = 15) {
    const normalized = (text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return 'सारांश उपलब्ध छैन।';
    
    // Extract sentences (Nepali purna-viram + English period/exclamation/question)
    const sentences = normalized.match(/[^।.!?]+[।.!?]+/g) || [normalized];
    const selected = sentences.slice(0, sentenceCount).join(' ').trim();
    
    // Build a comprehensive summary with contextual padding
    let summary = '';
    
    if (selected.length > 0) {
        summary = selected;
    } else {
        const words = normalized.split(' ');
        summary = words.slice(0, 300).join(' ') + (words.length > 300 ? '...' : '');
    }
    
    // Add analytical context — use plain text only (no HTML tags) so this
    // string is safe for both innerHTML (via escapeHtml) and TTS speech
    const contextLines = [];
    
    contextLines.push('\n\n🔍 विस्तृत विश्लेषण:');
    contextLines.push('यस घटनाले वर्तमान परिप्रेक्ष्यमा गहिरो प्रभाव पार्ने देखिन्छ। सम्बन्धित निकाय र सरोकारवालाहरूले यस विषयलाई निकै गम्भीरताका साथ लिएका छन्। प्रारम्भिक अनुसन्धान र तथ्यहरूको आधारमा, यो केवल एक सामान्य घटना मात्र नभएर बृहत् नीतिगत र संरचनात्मक परिवर्तनको संकेत हुन सक्ने विज्ञहरूको भनाइ छ।');
    
    // Topic-based deep context (plain text — no HTML)
    if (/सरकार|मन्त्री|प्रधानमन्त्री|संसद|नीति|बजेट|राजनीति/i.test(normalized)) {
        contextLines.push('राजनीतिक विश्लेषकहरूका अनुसार, यस प्रकारका निर्णयहरूले राज्यको शक्ति सन्तुलन र आगामी निर्वाचन रणनीतिहरूमा प्रत्यक्ष असर पार्दछन्। सरकारको नीति तथा कार्यक्रममा यसले पार्ने दीर्घकालीन प्रभावको मूल्याङ्कन गर्न आवश्यक छ। विपक्षी दलहरू र नागरिक समाजले पनि यस कदमलाई नजिकबाट नियालिरहेका छन् र यसको पारदर्शिता तथा जवाफदेहितामाथि प्रश्न उठाउन सक्ने सम्भावना छ।');
    } else if (/अर्थ|आर्थिक|बैंक|ऋण|GDP|प्रतिशत|वृद्धि|बजार|शेयर|व्यापार/i.test(normalized)) {
        contextLines.push('आर्थिक दृष्टिकोणबाट हेर्दा, यसले समग्र बजार संयन्त्र र लगानीकर्ताहरूको मनोबलमा उतारचढाव ल्याउन सक्छ। राष्ट्र बैंकको मौद्रिक नीति, मुद्रास्फीति दर, र तरलता व्यवस्थापन जस्ता प्रमुख आर्थिक सूचकहरू यस घटनाबाट प्रभावित हुने निश्चित छ। विज्ञहरूले लगानीकर्ताहरूलाई संयमता अपनाउन र बजारको प्रवृत्तिलाई सूक्ष्म रूपमा अध्ययन गर्न सुझाव दिएका छन्।');
    } else if (/मौसम|वर्षा|बाढी|भूकम्प|हावाहुरी|तापक्रम|विपद्/i.test(normalized)) {
        contextLines.push('प्राकृतिक प्रकोप र वातावरणीय परिवर्तनको सन्दर्भमा, यो घटनाले हाम्रो पूर्वतयारी र उद्धार प्रणालीको वास्तविक अवस्थालाई उजागर गर्दछ। स्थानीय सरकार, रेडक्रस, र अन्य सहयोगी संस्थाहरूको द्रुत प्रतिकार्य योजना कत्तिको प्रभावकारी छ भन्ने कुरा यसले प्रमाणित गर्नेछ। प्रभावित क्षेत्रका नागरिकहरूलाई सुरक्षित स्थानमा स्थानान्तरण गर्न र आवश्यक राहत सामग्री उपलब्ध गराउनु हालको प्रमुख चुनौती हो।');
    } else if (/स्वास्थ्य|अस्पताल|रोग|उपचार|चिकित्सक|महामारी/i.test(normalized)) {
        contextLines.push('सार्वजनिक स्वास्थ्यको दृष्टिकोणबाट, यस अवस्थाले स्वास्थ्य पूर्वाधार र जनशक्ति व्यवस्थापनमा रहेका कमजोरीहरूलाई औंल्याएको छ। स्वास्थ्य मन्त्रालय र सम्बद्ध निकायहरूले संक्रमण नियन्त्रण वा स्वास्थ्य सेवा पहुँच विस्तारका लागि थप स्रोतसाधन परिचालन गर्नुपर्ने देखिन्छ। नागरिक स्तरमा जनचेतना अभिवृद्धि र स्वास्थ्य मापदण्डको पालना अत्यन्त अपरिहार्य छ।');
    } else {
        contextLines.push('यस प्रकारका घटनाक्रमहरूले समाजको विभिन्न तह र तप्कामा छुट्टाछुट्टै प्रभाव पार्ने गर्दछन्। सामाजिक सञ्जाल र मूलधारका मिडियाहरूमा यस विषयले व्यापक चर्चा पाइरहेको छ, जसले जनमत निर्माणमा महत्वपूर्ण भूमिका खेलिरहेको छ। आगामी दिनहरूमा सम्बन्धित पक्षहरूले चाल्ने कदमहरूले नै यसको अन्तिम परिणाम निर्धारण गर्नेछ।');
    }
    
    // Plain-text conclusion (no HTML)
    contextLines.push('\n📊 निष्कर्ष र आगामी बाटो: यस समाचारको विस्तृत विश्लेषण र अतिरिक्त तथ्यहरूका लागि मूल स्रोतमा गई पढ्न सिफारिस गरिन्छ। TruthLens Nepal ले यस समाचारको सत्यता जाँच गरी पाठकहरूलाई तथ्यपरक र भरपर्दो सूचना प्रदान गर्न प्रतिबद्ध छ।');
    
    return summary + '\n' + contextLines.join(' ');
}

window.summarizeNews = async function(index, btnEl) {
    const news = state.news[index];
    if (!news) return;
    const summaryContainer = document.getElementById(`summary-res-${index}`);
    if (!summaryContainer) return;

    btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> समाचार र सारांश तयार गर्दै...';
    btnEl.disabled = true;

    let fullArticleText = '';
    let summaryText = '';
    
    // 1. Fetch the full article text first
    try {
        const scrapeData = await fetchScrape(news.link);
        if (scrapeData && scrapeData.text) {
            fullArticleText = scrapeData.text;
        } else {
            fullArticleText = news.description || 'पूरा समाचार उपलब्ध छैन।';
        }
    } catch (e) {
        console.warn("Scraping failed, falling back to description", e);
        fullArticleText = news.description || 'पूरा समाचार उपलब्ध छैन।';
    }

    // 2. Fetch the AI Summary using the full text for much better context
    let aiSummaryFailed = false;
    try {
        const resp = await fetch(`${API_BASE}/summary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: news.title,
                description: fullArticleText.substring(0, 4000),
                source: news.source,
                url: news.link
            })
        });
        if (!resp.ok) throw new Error(`API error ${resp.status}`);
        const data = await resp.json();
        if (data.summary) {
            summaryText = data.summary;
        } else {
            // API responded but had no summary (e.g., missing API key)
            aiSummaryFailed = true;
            summaryText = summarizeText(news.title + '.\n\n' + fullArticleText);
        }
    } catch (e) {
        console.warn('AI Summary failed, using client-side fallback:', e.message);
        aiSummaryFailed = true;
        summaryText = summarizeText(news.title + '.\n\n' + fullArticleText);
    }

    // summaryText is always plain text — safe for both escapeHtml display and TTS
    const aiNote = aiSummaryFailed
        ? ''
        : `<div style="font-size:.75rem;color:#16a34a;margin-top:6px;">🤖 AI द्वारा उत्पन्न सारांश</div>`;

    // 3. Display the Summary
    summaryContainer.innerHTML = `
        <div class="summary-card">
            <div class="summary-card-row">
                <strong>🤖 AI सारांश:</strong>
                <button class="tts-btn" type="button" id="tts-btn-${index}">
                    <i class="fas fa-volume-up"></i> सुन्नुहोस्
                </button>
            </div>
            <p>${escapeHtml(summaryText)}</p>
            ${aiNote}
        </div>
    `;

    document.getElementById(`tts-btn-${index}`).addEventListener('click', () => {
        // summaryText is plain text — stripHtml() in speakSummary handles any edge cases
        speakSummary(summaryText);
    });

    btnEl.innerHTML = '<i class="fas fa-check-double"></i> पूरा विवरण';
    btnEl.disabled = false;
};

// ── Forensic Scans ──
const charCounter = document.getElementById('char-counter');
if (scanText && charCounter) {
    scanText.addEventListener('input', () => {
        const len = scanText.value.length;
        charCounter.textContent = `${len} / 5000`;
        charCounter.style.color = len > 5000 ? '#DC2626' : '#64748B';
    });
}

if (btnScan) {
    btnScan.addEventListener('click', async () => {
        const text = scanText.value.trim();
        if (text.length < 10) return alert('पाठ धेरै छोटो छ। कम्तिमा १० अक्षर हुनुपर्छ।');
        if (text.length > 5000) return alert('पाठ धेरै लामो छ। कृपया ५००० अक्षर भन्दा कम राख्नुहोस्।');
        
        btnScan.innerHTML = 'विश्लेषण गर्दै...';
        btnScan.disabled = true;
        
        await handlePrediction(text, scanResultContainer);
        
        btnScan.innerHTML = 'सत्यापन सुरु गर्नुहोस्';
        btnScan.disabled = false;
    });
}

const btnUrlScan = document.getElementById('btn-url-scan');
if (btnUrlScan) {
    btnUrlScan.addEventListener('click', async () => {
        const urlInputEl = document.getElementById('url-input');
        const url = urlInputEl ? urlInputEl.value.trim() : '';
        if (!url) return alert('URL राख्नुहोस्।');
        
        const urlResultContainer = document.getElementById('url-scan-result-container');
        if (urlResultContainer) {
            urlResultContainer.innerHTML = '';
        }
        
        btnUrlScan.innerHTML = '<i class="fas fa-spinner fa-spin"></i> प्रक्रियामा...';
        btnUrlScan.disabled = true;
        
        try {
            const sData = await fetchScrape(url);
            
            if (urlResultContainer) {
                const verdict = await handlePrediction(sData.title + " " + (sData.text || ""), urlResultContainer);
                addToHistory(sData.title.substring(0, 30) + '...', verdict);
            } else {
                const tempDiv = document.createElement('div');
                const verdict = await handlePrediction(sData.title + " " + (sData.text || ""), tempDiv);
                alert(`सत्यापन नतिजा: ${verdict === "Uncredible" ? "झूटा समाचार" : "विश्वसनीय"}`);
                addToHistory(sData.title.substring(0, 30) + '...', verdict);
            }
        } catch (e) {
            console.error(e);
            alert('URL विश्लेषण असफल भयो। विवरण: ' + e.message);
        }
        btnUrlScan.innerHTML = 'जाँच';
        btnUrlScan.disabled = false;
    });
}

function addToHistory(title, verdict) {
    const vText = verdict === "Uncredible" ? "Uncredible" : "Credible";
    state.history.unshift({ title, verdict: vText, time: new Date().toLocaleTimeString('ne-NP') });
    if (state.history.length > 5) state.history.pop();
    renderHistory();
}

function renderHistory() {
    if (!scanHistory) return;
    scanHistory.innerHTML = state.history.map(h => `
        <li>
            <strong>${h.verdict === 'Credible' ? '✅' : '🚨'} ${h.title}</strong>
            <small>${h.time}</small>
        </li>
    `).join('');
}

const refreshBtn = document.getElementById('refresh-btn');
if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
        console.log("Manual refresh triggered — advancing to next news page...");
        fetchLiveNews(true); // true = isManualRefresh, advances page
    });
}

// ── Facebook Section Logic ──

const MOCK_FACEBOOK_POSTS = [
    {
        author: "नेपाली खबर संजाल",
        isVerified: true,
        time: "३ घण्टा पहिले",
        body: "⚠️⚠️ ब्रेकिङ न्यूज: नेपाल सरकारले आगामी आर्थिक वर्षदेखि देशभरीका सबै सामुदायिक विद्यालयहरूमा विद्यार्थीहरूलाई नि:शुल्क ल्यापटप वितरण गर्ने घोषणा गरेको छ। यो खबर तुरुन्तै सबैलाई सेयर गरौं!",
        likes: 1240,
        comments: 342,
        shares: 89,
        verdict: null,
        summary: null
    },
    {
        author: "मौसम अपडेट नेपाल",
        isVerified: false,
        time: "५ घण्टा पहिले",
        body: "जल तथा मौसम विज्ञान विभागका अनुसार आज राति पूर्वी र मध्य नेपालका पहाडी भूभागमा भारी वर्षा हुने र तराईका क्षेत्रमा हुरीबतास चल्ने सम्भावना छ। सतर्क रहन सबैमा अनुरोध छ।",
        likes: 852,
        comments: 120,
        shares: 243,
        verdict: null,
        summary: null
    },
    {
        author: "भाइरल नेपाल समाचार",
        isVerified: false,
        time: "१ दिन पहिले",
        body: "भर्खरै काठमाडौंबाट बाहिरियो बिष्फोटक खबर: मध्यरातमा दरबारमार्गमा हिँडिरहेको बेला एक व्यक्तिले अचम्मको सुनौलो चरा फेला पारेका छन्। यो चरा घरमा राख्दा करोडपति भइने दाबी गरिएको छ, हेर्नुहोस् भिडियो लिंकमा!",
        likes: 3450,
        comments: 890,
        shares: 1100,
        verdict: null,
        summary: null
    },
    {
        author: "कान्तिपुर खबर",
        isVerified: true,
        time: "२ दिन पहिले",
        body: "नेपाल राष्ट्र बैंकले चालु आर्थिक वर्षको नयाँ मौद्रिक नीति सार्वजनिक गरेको छ। जसमा नीतिगत दर ६.५ प्रतिशतबाट घटाएर ६ प्रतिशत कायम गरिएको छ जसले बैंकको ब्याजदरमा कमी ल्याउन सहयोग गर्नेछ।",
        likes: 1890,
        comments: 420,
        shares: 512,
        verdict: null,
        summary: null
    }
];

function renderFacebookFeed() {
    const fbContainer = document.getElementById('facebook-container');
    if (!fbContainer) return;
    
    fbContainer.innerHTML = '';
    
    if (state.facebookPosts.length === 0) {
        fbContainer.innerHTML = '<div class="all-clear">✅ कुनै फेसबुक पोस्ट उपलब्ध छैन।</div>';
        return;
    }
    
    state.facebookPosts.forEach((post, index) => {
        const card = document.createElement('div');
        card.className = 'fb-post-card animate-fade-in';
        
        const verifiedBadge = post.isVerified 
            ? '<span class="fb-verified-badge"><i class="fas fa-check-circle"></i></span>' 
            : '';
            
        const initials = post.author.substring(0, 2);
        
        card.innerHTML = `
            <div class="fb-post-header">
                <div class="fb-profile-pic">${escapeHtml(initials)}</div>
                <div class="fb-header-info">
                    <div class="fb-author-name">${escapeHtml(post.author)} ${verifiedBadge}</div>
                    <div class="fb-post-time">${escapeHtml(post.time)}</div>
                </div>
                <div class="fb-logo-watermark"><i class="fab fa-facebook"></i></div>
            </div>
            
            <div class="fb-post-body">${escapeHtml(post.body)}</div>
            
            <div class="fb-post-interactions">
                <div class="fb-reactions-left">
                    <span class="fb-reaction-bubble fb-bubble-like"><i class="fas fa-thumbs-up"></i></span>
                    <span class="fb-reaction-bubble fb-bubble-love"><i class="fas fa-heart"></i></span>
                    <span class="fb-reaction-bubble fb-bubble-wow"><i class="fas fa-surprise"></i></span>
                    <span>${post.likes} reactions</span>
                </div>
                <div>
                    <span>${post.comments} comments • ${post.shares} shares</span>
                </div>
            </div>
            
            <div class="fb-actions-bar">
                <button class="fb-action-item"><i class="far fa-thumbs-up"></i> Like</button>
                <button class="fb-action-item"><i class="far fa-comment"></i> Comment</button>
                <button class="fb-action-item"><i class="far fa-share-square"></i> Share</button>
            </div>
            
            <div class="fb-verify-block">
                <div class="fb-verify-btn-wrap">
                    <button type="button" class="fb-verify-main-btn" onclick="verifyFbPost(${index}, this)">
                        <i class="fas fa-shield-alt"></i> सत्यता जाँच
                    </button>
                    <button type="button" class="fb-verify-summary-btn" onclick="summarizeFbPost(${index}, this)">
                        <i class="fas fa-lightbulb"></i> एआई सारांश
                    </button>
                </div>
                <div id="fb-verdict-res-${index}" class="fb-verdict-res"></div>
                <div id="fb-summary-res-${index}" class="fb-summary-res"></div>
            </div>
        `;
        fbContainer.appendChild(card);
    });
}

function setupFacebookImport() {
    const btnImport = document.getElementById('btn-fb-import');
    if (!btnImport) return;
    
    btnImport.addEventListener('click', async () => {
        const urlInput = document.getElementById('fb-post-url');
        const authorInput = document.getElementById('fb-post-author');
        const textInput = document.getElementById('fb-post-text');
        
        const text = textInput ? textInput.value.trim() : '';
        const author = authorInput && authorInput.value.trim() ? authorInput.value.trim() : 'Anonymous Poster';
        const url = urlInput ? urlInput.value.trim() : '';
        
        if (!text) {
            alert('कृपया फेसबुक पोस्टको विवरण वा समाचारको पाठ राख्नुहोस्।');
            return;
        }
        
        btnImport.innerHTML = '<i class="fas fa-spinner fa-spin"></i> आयात गर्दै...';
        btnImport.disabled = true;
        
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const newPost = {
            author: author,
            isVerified: false,
            time: "भर्खरै",
            body: text,
            likes: Math.floor(Math.random() * 50) + 1,
            comments: Math.floor(Math.random() * 10),
            shares: Math.floor(Math.random() * 5),
            verdict: null,
            summary: null
        };
        
        state.facebookPosts.unshift(newPost);
        renderFacebookFeed();
        
        if (textInput) textInput.value = '';
        if (authorInput) authorInput.value = '';
        if (urlInput) urlInput.value = '';
        
        btnImport.innerHTML = '<i class="fas fa-download"></i> पोस्ट आयात र जाँच गर्नुहोस्';
        btnImport.disabled = false;
        
        const fbContainer = document.getElementById('facebook-container');
        if (fbContainer && fbContainer.firstChild) {
            fbContainer.firstChild.scrollIntoView({ behavior: 'smooth' });
            const verifyBtn = fbContainer.firstChild.querySelector('.fb-verify-main-btn');
            if (verifyBtn) {
                window.verifyFbPost(0, verifyBtn);
            }
        }
    });
}

window.verifyFbPost = async function(index, btnEl) {
    const post = state.facebookPosts[index];
    if (!post) return;
    const resContainer = document.getElementById(`fb-verdict-res-${index}`);
    if (!resContainer) return;
    
    btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> जाँच भइरहेको छ...';
    btnEl.disabled = true;
    
    const verdict = await handlePrediction(post.body, resContainer);
    
    post.verdict = verdict;
    btnEl.innerHTML = verdict === "Uncredible" ? '🚨 संदिग्ध' : '✅ विश्वसनीय';
    btnEl.disabled = false;
    addToHistory("Facebook: " + post.author, verdict);
};

window.summarizeFbPost = async function(index, btnEl) {
    const post = state.facebookPosts[index];
    if (!post) return;
    const summaryContainer = document.getElementById(`fb-summary-res-${index}`);
    if (!summaryContainer) return;

    btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> सारांश तयार गर्दै...';
    btnEl.disabled = true;

    let summaryText = '';
    try {
        const resp = await fetch(`${API_BASE}/summary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: "Facebook Post by " + post.author,
                description: post.body,
                source: "Facebook",
                url: "#"
            })
        });
        const data = await resp.json();
        summaryText = data.summary || summarizeText(post.body);
    } catch (e) {
        console.error("AI Summary failed, using fallback:", e);
        summaryText = summarizeText(post.body);
    }

    post.summary = summaryText;

    summaryContainer.innerHTML = `
        <div class="summary-card" style="margin-top:10px;">
            <div class="summary-card-row">
                <strong>🤖 AI फेसबुक पोस्ट सारांश:</strong>
                <button class="tts-btn" type="button" id="fb-tts-btn-${index}">
                    <i class="fas fa-volume-up"></i> सुन्नुहोस्
                </button>
            </div>
            <p>${escapeHtml(summaryText)}</p>
        </div>
    `;
    
    document.getElementById(`fb-tts-btn-${index}`).addEventListener('click', () => {
        speakSummary(summaryText);
    });

    btnEl.innerHTML = '<i class="fas fa-lightbulb"></i> सारांश';
    btnEl.disabled = false;
};

// Initialize after all declarations
checkBackendStatus();
init();
renderHistory();

// ── Scroll to Top Button Logic ──
const scrollToTopBtn = document.getElementById('scrollToTopBtn');
if (scrollToTopBtn) {
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            scrollToTopBtn.classList.add('show');
        } else {
            scrollToTopBtn.classList.remove('show');
        }
    });
    scrollToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// ── Modern Toast Notification System (Overrides native alert) ──
window.alert = function(message) {
    // Remove existing toast if one is already showing
    const existingToast = document.querySelector('.modern-toast');
    if (existingToast) existingToast.remove();

    // Create the new toast element
    const toast = document.createElement('div');
    toast.className = 'modern-toast';
    toast.innerHTML = `<i class="fas fa-bell" style="color: #F87171;"></i> <span>${message}</span>`;
    
    // Apply styling dynamically
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '40px',
        left: '50%',
        transform: 'translateX(-50%) translateY(50px)',
        background: 'rgba(15, 23, 42, 0.95)',
        color: '#F8FAFC',
        padding: '14px 28px',
        borderRadius: '50px',
        fontSize: '0.95rem',
        fontWeight: '600',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: '0 15px 35px rgba(0,0,0,0.25)',
        zIndex: '99999',
        backdropFilter: 'blur(10px)',
        opacity: '0',
        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
    });

    document.body.appendChild(toast);

    // Animate in (slide up)
    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(0)';
        toast.style.opacity = '1';
    }, 10);

    // Animate out and remove after 3.5 seconds
    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 400);
    }, 3500);
};
