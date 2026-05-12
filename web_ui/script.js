// ── Configuration ──
const API_BASE = "http://localhost:5000/api";

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
        console.warn(`RSS fetch failed for ${source.name}:`, e.message);
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


async function fetchAdminStats() {
    try {
        const resp = await fetch(`${API_BASE}/status`);
        const data = await resp.json();
        if (data.metrics && data.metrics.accuracy) {
            updateAdminDashboard(data.metrics);
        }
    } catch (err) {
        console.warn("Failed to fetch admin stats", err);
    }
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
        source: "OnlineKhabar", category: "अर्थ",
        link: "https://www.onlinekhabar.com",
        title: "नेपालको जीडीपी वृद्धि दर यस आर्थिक वर्ष ६% पुग्ने विश्व बैंकको प्रक्षेपण",
        description: "विश्व बैंकले नेपालको आर्थिक वृद्धि दर चालू आर्थिक वर्षमा ६ प्रतिशत पुग्ने प्रक्षेपण गरेको छ। आयात प्रतिबन्ध हटाइएको र पर्यटन क्षेत्रमा सुधार आएसँगै अर्थतन्त्रमा सकारात्मक संकेत देखिएको छ।"
    },
    {
        source: "Setopati", category: "मौसम",
        link: "https://www.setopati.com",
        title: "यस वर्ष मनसुन सामान्य रहने मौसम विभागको पूर्वानुमान",
        description: "जलविज्ञान तथा मौसम विज्ञान विभागले यस वर्षको मनसुन सामान्य रहने पूर्वानुमान गरेको छ। यसले देशभरका किसानहरूलाई राहत दिएको छ।"
    },
    {
        source: "Unknown Source", category: "संदिग्ध",
        link: "#",
        title: "नेपाल सरकार दिवालिया! विदेशी बैंकहरूले ऋण फिर्ता माग्दै — अर्थमन्त्री फरार",
        description: "SHOCKING: नेपालको राष्ट्रिय खजाना खाली भएको गोप्य दस्तावेज सार्वजनिक भयो। अर्थमन्त्री देश छाडेर फरार रहेको स्रोतले जनाएको छ।"
    }
];

// ── DOM ──
const loginPage    = document.getElementById('login-page');
const dashPage     = document.getElementById('dashboard-page');
const loginForm    = document.getElementById('login-form');
const portalRadios = document.getElementsByName('portal');
const portalTitle  = document.getElementById('portal-title');
const navAdmin     = document.getElementById('nav-admin');
const logoutBtn    = document.getElementById('logout-btn');
const displayUser  = document.getElementById('display-user');
const displayPortal= document.getElementById('display-portal');
const syncTime     = document.getElementById('sync-time');
const newsContainer= document.getElementById('news-container');
const scanHistory  = document.getElementById('scan-history');
const btnScan      = document.getElementById('btn-scan');
const scanText     = document.getElementById('scan-text');
const scanResultContainer = document.getElementById('scan-result-container');
const trendingContainer   = document.getElementById('trending-container');

// ── Init ──
function init() {
    updateSyncTime();
    updateNepaliDate();
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

// ── Login ──
if (loginForm) {
    loginForm.addEventListener('submit', e => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const portal   = document.querySelector('input[name="portal"]:checked').value;

        if (portal === 'admin' && username !== 'admin') {
            alert('🚫 अनधिकृत: यस पोर्टलका लागि Level-1 प्रशासक प्रमाणपत्र आवश्यक छ।');
            return;
        }

        state.isAuthenticated = true;
        state.isAdmin  = (portal === 'admin');
        state.username = username || 'अतिथि';

        if (displayUser)   displayUser.textContent   = state.username;
        if (displayPortal) displayPortal.textContent = state.isAdmin ? 'प्रशासक' : 'नागरिक पहुँच';
        if (navAdmin)      navAdmin.style.display    = state.isAdmin ? 'flex' : 'none';

        loginPage.classList.remove('active');
        dashPage.classList.add('active');
        if (state.isAdmin) fetchAdminStats();
    });
}

function doLogout() {
    state.isAuthenticated = false;
    state.isAdmin = false;
    dashPage.classList.remove('active');
    loginPage.classList.add('active');
}
if (logoutBtn) logoutBtn.addEventListener('click', doLogout);

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
                    <a href="${news.link}" target="_blank" class="view-src-link">स्रोत</a>
                </div>
                <h3>${news.title}</h3>
                <p>${news.description ? news.description.substring(0, 150) + '...' : ''}</p>
                <div class="card-actions">
                    <button class="verify-btn" onclick="verifyNews(${index}, this)">
                        <i class="fas fa-search"></i> सत्यापन गर्नुहोस्
                    </button>
                    <div id="verdict-res-${index}" style="width:100%;"></div>
                </div>
            `;
            newsContainer.appendChild(card);
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

    if (!isFake) reasons.push("✅ सन्तुलित भाषाशैली पाइयो");
    if (isFake && reasons.length === 0) reasons.push("🚨 भ्रामक सामग्रीको संकेत पाइयो");

    return {
        verdict: isFake ? "Uncredible" : "Credible",
        confidence: isFake ? Math.max(finalScore, 0.65) : Math.max(1 - finalScore - trueScore * 0.3, 0.6),
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
        res = await resp.json();
    } catch (err) {
        console.warn("Flask API unavailable, using client-side heuristic:", err.message);
        res = clientSideHeuristic(text);
        usedFallback = true;
    }

    const isFake = res.verdict === "Uncredible";
    const vClass = isFake ? "verdict-uncredible" : "verdict-credible";
    const icon = isFake ? "🚨" : "✅";
    const verdictNe = isFake ? "झूटा समाचार" : "विश्वसनीय";
    const confidence = Math.round((res.confidence || 0.5) * 100);
    const engineNote = usedFallback
        ? `<div style="font-size:.72rem;color:#999;margin-top:6px;">⚠️ Offline मोड — Heuristic विश्लेषण (AI मोडेलका लागि Flask सुरु गर्नुहोस्)</div>`
        : `<div style="font-size:.72rem;color:#16a34a;margin-top:6px;">🤖 AI ML मोडेल (TF-IDF + Logistic Regression)</div>`;

    container.innerHTML = `
        <div class="verdict-box ${vClass}" style="margin-top:10px;">
            <div class="verdict-title">${icon} ${verdictNe} — ${confidence}% निश्चितता</div>
            <div class="verdict-findings">
                <strong>विश्लेषण सारांश:</strong>
                <ul>${(res.reasons || []).map(r => `<li>${r}</li>`).join('')}</ul>
            </div>
            ${engineNote}
        </div>
    `;
    return res.verdict;
}


window.verifyNews = async function(index, btnEl) {
    const news = state.news[index];
    const resContainer = document.getElementById(`verdict-res-${index}`);
    
    btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> जाँच भइरहेको छ...';
    btnEl.disabled = true;
    
    const verdict = await handlePrediction(news.title + " " + (news.description || ""), resContainer);
    
    btnEl.innerHTML = verdict === "Uncredible" ? '🚨 संदिग्ध' : '✅ विश्वसनीय';
    addToHistory(news.title, verdict);
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

init();
renderHistory();
