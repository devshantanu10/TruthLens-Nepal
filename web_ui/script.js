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
let availableSpeechVoices = [];
let voiceLoadAttempts = 0;

function isSpeechSupported() {
    return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

function getDefaultEnglishVoice(voices) {
    return voices.find(v => /en-|English/i.test(`${v.name} ${v.lang}`)) || voices[0] || null;
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
    ttsState.voice = ttsState.voice || getDefaultEnglishVoice(availableSpeechVoices);
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

    if (!availableSpeechVoices.length) {
        loadSpeechVoices();
    }

    speechUtterance = new SpeechSynthesisUtterance(normalized);
    speechUtterance.voice = ttsState.voice || getDefaultEnglishVoice(availableSpeechVoices) || null;
    speechUtterance.volume = 1;
    speechUtterance.rate = ttsState.rate;
    speechUtterance.pitch = ttsState.pitch;
    speechUtterance.lang = speechUtterance.voice?.lang || 'en-US';
    speechUtterance.onstart = () => updateTtsStatus('Playing via browser speech synthesis...');
    speechUtterance.onend = () => {
        updateTtsButtons();
        updateTtsStatus('Finished speaking.');
    };
    speechUtterance.onpause = () => updateTtsStatus('Speech paused.');
    speechUtterance.onresume = () => updateTtsStatus('Speech resumed.');
    speechUtterance.onerror = (err) => {
        console.error('Speech synthesis error', err);
        updateTtsStatus('Browser speech failed.');
        updateTtsButtons();
    };

    window.speechSynthesis.speak(speechUtterance);
    updateTtsButtons();
    updateTtsStatus('Queued browser speech synthesis...');
    return true;
}

async function speakSummary(text) {
    const normalized = String(text || '').trim();
    if (!normalized) {
        alert('सुनाउनको लागि कुनै सारांश उपलब्ध भएन।');
        return;
    }

    currentSpeechText = normalized;
    cancelSpeech();
    updateTtsStatus('Requesting backend TTS...');

    try {
        const blob = await fetchTtsAudio(normalized);
        releaseAudioUrl();
        ttsAudioUrl = URL.createObjectURL(blob);
        ttsAudio = new Audio(ttsAudioUrl);
        ttsAudio.volume = 1;
        ttsAudio.muted = false;
        ttsAudio.preload = 'auto';
        ttsAudio.crossOrigin = 'anonymous';
        ttsAudio.onended = () => {
            updateTtsButtons();
            updateTtsStatus('Finished backend audio.');
        };
        ttsAudio.onpause = () => updateTtsStatus('Backend audio paused.');
        ttsAudio.onplay = () => updateTtsStatus('Playing backend audio...');
        ttsAudio.onerror = (err) => {
            console.error('Audio playback error', err);
            updateTtsStatus('Backend audio failed.');
            updateTtsButtons();
        };
        await ttsAudio.play();
        updateTtsButtons();
        return;
    } catch (err) {
        console.warn('Backend TTS failed, trying browser speech fallback:', err);
    }

    if (isSpeechSupported()) {
        updateTtsStatus('Backend TTS failed. Trying browser speech synthesis...');
        const played = playNativeSpeech(normalized);
        if (played) return;
    }

    updateTtsStatus('Voice play failed.');
    alert('Voice play failed. कृपया ब्याकएण्ड चलाउनुहोस् वा ब्राउजरको आवाज सक्षम छ कि छैन जाँच्नुहोस्।');
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
            <div class="tts-model-note">Voice source: browser speech synthesis first, backend TTS if browser voice is unavailable.</div>
            <div id="tts-status" class="tts-status"></div>
            <div class="tts-control-row">
                <label for="tts-voice-select">Browser voice (fallback)</label>
                <select id="tts-voice-select"></select>
            </div>
            <div class="tts-control-row">
                <label for="tts-rate">Speed <span id="tts-rate-value">${ttsState.rate.toFixed(1)}x</span></label>
                <input id="tts-rate" type="range" min="0.5" max="2" step="0.1" value="${ttsState.rate}">
            </div>
            <div class="tts-control-row">
                <label for="tts-pitch">Pitch <span id="tts-pitch-value">${ttsState.pitch.toFixed(1)}</span></label>
                <input id="tts-pitch" type="range" min="0" max="2" step="0.1" value="${ttsState.pitch}">
            </div>
            <div class="tts-controls-row">
                <button id="tts-play" class="tts-btn" type="button">Play</button>
                <button id="tts-pause" class="tts-btn" type="button" disabled>Pause</button>
                <button id="tts-resume" class="tts-btn" type="button" disabled>Resume</button>
                <button id="tts-stop" class="tts-btn" type="button" disabled>Stop</button>
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
            return;
        } catch (err) {
            console.warn(`Backend status check failed for ${endpoint}`, err);
        }
    }

    statusEl.textContent = 'Backend unavailable, but voice should still work via browser speech synthesis.';
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
    
    // Fade-out current cards
    newsContainer.style.opacity = '0';
    newsContainer.style.transition = 'opacity 0.25s ease';
    
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
                    <span class="source-tag">${news.source}</span>
                </div>
                <h3><a href="#" class="news-title-link">${escapeHtml(news.title)}</a></h3>
                <p>${news.description ? news.description.substring(0, 150) + '...' : ''}</p>
                <div class="card-actions">
                    <button class="verify-btn" onclick="verifyNews(${index}, this)">
                        <i class="fas fa-search"></i> सत्यापन गर्नुहोस्
                    </button>
                    <button class="summary-btn" onclick="summarizeNews(${index}, this)">
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
        reasons.push("⚠️ पर्याप्त प्रमाण छैन — प्रमाणिकरण गर्न असमर्थ।");
    }

    return {
        verdict: "Not in Database to Authenticate",
        confidence: null,
        reasons,
        source: "client"
    };
}

// ── AI Prediction Handler ──
async function handlePrediction(text, container) {
    // Show loading state
    container.innerHTML = `<div style="padding:12px;color:#999;font-size:.85rem;display:flex;align-items:center;gap:8px;">
        <i class="fas fa-spinner fa-spin"></i> विश्लेषण गर्दै...
    </div>`;

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

    container.innerHTML = `
        <div class="verdict-box ${vClass}" style="margin-top:10px;">
            <div class="verdict-title">${icon} ${verdictNe} — ${confidenceText}</div>
            <div class="verdict-findings">
                <strong>विश्लेषण सारांश:</strong>
                <ul>${reasonsList.map(r => `<li>${r}</li>`).join('')}</ul>
            </div>
            ${engineNote}
        </div>
    `;
    return verdictRaw;
}


window.verifyNews = async function(index, btnEl) {
    const news = state.news[index];
    const resContainer = document.getElementById(`verdict-res-${index}`);
    
    btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> जाँच भइरहेको छ...';
    btnEl.disabled = true;
    
    const verdict = await handlePrediction(news.title + " " + (news.description || ""), resContainer);
    
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
    if (summaryResult.status === 'fulfilled') {
        try {
            const data = await summaryResult.value.json();
            summaryText = data.summary || '';
        } catch {
            summaryText = '';
        }
    }
    if (!summaryText) {
        summaryText = summarizeText(news.title + '. ' + description, 5);
    }
    currentSpeechText = summaryText;

    articleModalSummary.innerHTML = `
        <div class="article-summary-title">AI Summary</div>
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

function summarizeText(text, sentenceCount = 5) {
    const normalized = (text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return 'सारांश उपलब्ध छैन।';
    const sentences = normalized.match(/[^।.!?]+[।.!?]+/g) || [normalized];
    const selected = sentences.slice(0, sentenceCount).join(' ').trim();
    if (selected.length > 0) {
        return selected.length > 500 ? selected.slice(0, 500) + '...' : selected;
    }
    const words = normalized.split(' ');
    return words.slice(0, 70).join(' ') + (words.length > 70 ? '...' : '');
}

window.summarizeNews = function(index, btnEl) {
    const news = state.news[index];
    if (!news) return;
    const summaryContainer = document.getElementById(`summary-res-${index}`);
    if (!summaryContainer) return;

    btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> सारांश तयार गर्दै...';
    btnEl.disabled = true;

    const summaryText = summarizeText(news.title + '. ' + (news.description || ''));
    summaryContainer.innerHTML = `
        <div class="summary-card">
            <div class="summary-card-row">
                <strong>🤖 AI सारांश:</strong>
                <button class="tts-btn" type="button" onclick="speakSummary(${JSON.stringify(summaryText)})">
                    <i class="fas fa-volume-up"></i> सुन्नुहोस्
                </button>
            </div>
            <p>${summaryText}</p>
        </div>
    `;

    btnEl.innerHTML = '<i class="fas fa-lightbulb"></i> सारांश';
    btnEl.disabled = false;
};

// ── Forensic Scans ──
if (btnScan) {
    btnScan.addEventListener('click', async () => {
        const text = scanText.value.trim();
        if (text.length < 10) return alert('पाठ धेरै छोटो छ।');
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
        const url = document.getElementById('url-input').value;
        if (!url) return alert('URL राख्नुहोस्।');
        btnUrlScan.innerHTML = 'प्रक्रियामा...';
        btnUrlScan.disabled = true;
        
        try {
            const sResp = await fetch(`${API_BASE}/scrape`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url })
            });
            const sData = await sResp.json();
            
            // Create a temp div for URL scan results if needed, or use alert
            const tempDiv = document.createElement('div');
            const verdict = await handlePrediction(sData.title + " " + sData.text, tempDiv);
            alert(`सत्यापन नतिजा: ${verdict === "Uncredible" ? "झूटा समाचार" : "विश्वसनीय"}`);
            addToHistory(sData.title.substring(0, 30) + '...', verdict);
        } catch (e) {
            console.error(e);
            alert('URL विश्लेषण असफल भयो।');
        }
        btnUrlScan.innerHTML = 'विश्लेषण';
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

checkBackendStatus();
init();
renderHistory();
