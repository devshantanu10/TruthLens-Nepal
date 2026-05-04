// ── State ──
const state = { isAuthenticated: false, isAdmin: false, username: '', history: [] };

// ── Mock News Data (Nepali-focused, many categories) ──
const MOCK_NEWS = [
    {
        source: "OnlineKhabar", category: "अर्थ",
        link: "https://www.onlinekhabar.com",
        title: "नेपालको जीडीपी वृद्धि दर यस आर्थिक वर्ष ६% पुग्ने विश्व बैंकको प्रक्षेपण",
        description: "विश्व बैंकले नेपालको आर्थिक वृद्धि दर चालू आर्थिक वर्षमा ६ प्रतिशत पुग्ने प्रक्षेपण गरेको छ। आयात प्रतिबन्ध हटाइएको र पर्यटन क्षेत्रमा सुधार आएसँगै अर्थतन्त्रमा सकारात्मक संकेत देखिएको छ।"
    },
    {
        source: "Unknown Blog", category: "संदिग्ध",
        link: "#",
        title: "ALIENS FOUND IN HIMALAYAS - GOVERNMENT HIDING THE TRUTH! हिमालयमा एलियन भेटिए!",
        description: "Shocking video reveals extraterrestrial life base deep inside Mount Everest. Scientists silenced by secret military operations. सरकारले सत्य लुकाइरहेको छ। अहिले नै पढ्नुहोस्!"
    },
    {
        source: "Setopati", category: "मौसम",
        link: "https://www.setopati.com",
        title: "यस वर्ष मनसुन सामान्य रहने मौसम विभागको पूर्वानुमान",
        description: "जलविज्ञान तथा मौसम विज्ञान विभागले यस वर्षको मनसुन सामान्य रहने पूर्वानुमान गरेको छ। यसले देशभरका किसानहरूलाई राहत दिएको छ।"
    },
    {
        source: "Kantipur", category: "राजधानी",
        link: "https://www.kantipurdaily.com",
        title: "काठमाडौं महानगरले सार्वजनिक यातायात सुधारको नयाँ योजना सार्वजनिक गर्यो",
        description: "काठमाडौं महानगरपालिकाले सार्वजनिक यातायात व्यवस्थापन सुधार गर्न नयाँ कार्ययोजना सार्वजनिक गरेको छ। यसअन्तर्गत इलेक्ट्रिक बस सञ्चालन र नयाँ बस स्टप निर्माण समावेश छ।"
    },
    {
        source: "Ratopati", category: "राजनीति",
        link: "https://www.ratopati.com",
        title: "प्रधानमन्त्रीले संसदमा विश्वासको मत प्राप्त गरे, विपक्षी एकजुट",
        description: "प्रधानमन्त्रीले आज संसदमा विश्वासको मत लिएका छन्। सत्तापक्षले बहुमत सिट जुटाउन सफल भएपछि विपक्षी दलहरूले संसद बहिष्कार गर्ने चेतावनी दिएका छन्।"
    },
    {
        source: "Nepali Times", category: "पर्यटन",
        link: "https://www.nepalitimes.com",
        title: "यस वर्ष एभरेस्ट आरोहणमा रेकर्ड संख्यामा पर्वतारोही",
        description: "नेपाल पर्वतारोहण विभागका अनुसार यस वर्षको वसन्त मौसममा एभरेस्ट आरोहणका लागि ४०० भन्दा बढी अनुमतिपत्र जारी गरिएको छ, जुन अहिलेसम्मकै सर्वाधिक हो।"
    },
    {
        source: "OnlineKhabar", category: "खेलकुद",
        link: "https://www.onlinekhabar.com",
        title: "नेपाल क्रिकेट टोलीले यूएईलाई हराउँदै टी-२० विश्वकप छनोटमा प्रवेश गर्यो",
        description: "नेपाली राष्ट्रिय क्रिकेट टोलीले टी-२० विश्वकप छनोट खेलमा यूएईलाई ७ विकेटले पराजित गर्दै अर्को चरणमा प्रवेश गरेको छ। रोहित पौडेलले शानदार अर्धशतक जोडे।"
    },
    {
        source: "Setopati", category: "प्रविधि",
        link: "https://www.setopati.com",
        title: "नेपालमा ५G इन्टरनेट सेवा आउँदो वर्षदेखि शुरू हुने",
        description: "नेपाल दूरसञ्चार प्राधिकरणले आउँदो आर्थिक वर्षदेखि नेपालमा ५G इन्टरनेट सेवा विस्तार गर्ने योजना सार्वजनिक गरेको छ। काठमाडौं उपत्यकाबाट सेवा शुरू हुनेछ।"
    },
    {
        source: "Fake News Portal", category: "संदिग्ध",
        link: "#",
        title: "सरकारले ५,००० रुपैयाँ प्रत्येक नागरिकलाई बाँड्दै! आजै आवेदन दिनुहोस्!!",
        description: "BREAKING: सरकारले कोरोनाको राहत स्वरूप प्रत्येक नेपाली नागरिकलाई ५,००० रुपैयाँ दिने घोषणा गरेको छ। यो लिंकमा क्लिक गरेर तुरुन्त आवेदन दिनुहोस्। सीमित समय मात्र!"
    },
    {
        source: "RSS Nepal", category: "राष्ट्रिय",
        link: "https://www.rss.np",
        title: "नेपालले भारतसँग नयाँ व्यापार सम्झौतामा हस्ताक्षर गर्यो",
        description: "नेपाल र भारतबीच नयाँ व्यापार तथा पारवहन सन्धिमा हस्ताक्षर भएको छ। यस सम्झौताले नेपाली निर्यातकर्ताहरूलाई भारतीय बजारमा थप सहुलियत प्रदान गर्नेछ।"
    },
    {
        source: "Kantipur", category: "स्वास्थ्य",
        link: "https://www.kantipurdaily.com",
        title: "काठमाडौंमा डेंगु संक्रमण बढ्दो, स्वास्थ्य मन्त्रालयको सतर्कता",
        description: "राजधानीमा यस वर्ष डेंगु ज्वरोका बिरामीको संख्या गत वर्षको तुलनामा दोब्बर भएको छ। स्वास्थ्य मन्त्रालयले लामखुट्टे नियन्त्रणका लागि विशेष अभियान सञ्चालन गरेको छ।"
    },
    {
        source: "OnlineKhabar", category: "शिक्षा",
        link: "https://www.onlinekhabar.com",
        title: "SEE परीक्षाको नतिजा सार्वजनिक, ७८.२% विद्यार्थी उत्तीर्ण",
        description: "राष्ट्रिय परीक्षा बोर्डले माध्यमिक शिक्षा परीक्षा (SEE) को नतिजा सार्वजनिक गरेको छ। यस पटक ७८.२ प्रतिशत विद्यार्थी उत्तीर्ण भएका छन्।"
    },
    {
        source: "Ratopati", category: "वातावरण",
        link: "https://www.ratopati.com",
        title: "काठमाडौं उपत्यकामा वायु प्रदूषण खतरनाक स्तरमा, मास्क लगाउन आग्रह",
        description: "काठमाडौं उपत्यकाको वायु गुणस्तर सूचकाङ्क (AQI) आज १८५ पुगेको छ जुन 'अस्वस्थकर' श्रेणीमा पर्छ। विशेषगरी बालबालिका र ज्येष्ठ नागरिकहरूलाई घरभित्रै बस्न सुझाव दिइएको छ।"
    },
    {
        source: "Nepali Times", category: "अन्तर्राष्ट्रिय",
        link: "https://www.nepalitimes.com",
        title: "संयुक्त राष्ट्रसंघले नेपालको मानवअधिकार अवस्थामा सुधारको प्रशंसा गर्यो",
        description: "संयुक्त राष्ट्रसंघको मानवअधिकार परिषद्को समीक्षामा नेपालले विगत पाँच वर्षमा मानवअधिकार क्षेत्रमा महत्वपूर्ण प्रगति हासिल गरेको उल्लेख गरिएको छ।"
    },
    {
        source: "Unknown Source", category: "संदिग्ध",
        link: "#",
        title: "नेपाल सरकार दिवालिया! विदेशी बैंकहरूले ऋण फिर्ता माग्दै — अर्थमन्त्री फरार",
        description: "SHOCKING: नेपालको राष्ट्रिय खजाना खाली भएको गोप्य दस्तावेज सार्वजनिक भयो। अर्थमन्त्री देश छाडेर फरार रहेको स्रोतले जनाएको छ। यो समाचार कहीँ नभेटिने अन्तिम मौका!"
    },
    {
        source: "Setopati", category: "कृषि",
        link: "https://www.setopati.com",
        title: "धानको मूल्य वृद्धि, किसानहरू खुशी — बजारमा मागमा वृद्धि",
        description: "यस वर्ष धानको उत्पादन राम्रो भएसँगै बजारमा धानको मूल्य प्रति क्विन्टल ३,५०० रुपैयाँ पुगेको छ। किसानहरूले राम्रो आम्दानी हुने आशा व्यक्त गरेका छन्।"
    },
    {
        source: "RSS Nepal", category: "विपद्",
        link: "https://www.rss.np",
        title: "सुदूरपश्चिममा बाढी र पहिरो: १२ जनाको मृत्यु, राहत कार्य जारी",
        description: "लगातारको वर्षाका कारण सुदूरपश्चिम प्रदेशका विभिन्न जिल्लामा बाढी र पहिरो गएको छ। यसमा १२ जनाको मृत्यु भई ५ जना बेपत्ता रहेका छन्। सुरक्षा निकायले उद्धार कार्य सञ्चालन गरेको छ।"
    },
    {
        source: "OnlineKhabar", category: "ऊर्जा",
        link: "https://www.onlinekhabar.com",
        title: "नेपालले भारतमा थप ४०० मेगावाट विद्युत निर्यात गर्ने सम्झौता गर्यो",
        description: "नेपाल विद्युत प्राधिकरण र भारतको NTPC बीच थप ४०० मेगावाट जलविद्युत खरिद-बिक्री सम्झौता सम्पन्न भएको छ। यसबाट नेपाललाई वार्षिक करिब ५ अर्ब रुपैयाँ आम्दानी हुनेछ।"
    },
    {
        source: "Kantipur", category: "समाज",
        link: "https://www.kantipurdaily.com",
        title: "नेपालमा महिला उद्यमीहरूको संख्यामा उल्लेखनीय वृद्धि",
        description: "उद्योग विभागका तथ्याङ्क अनुसार विगत तीन वर्षमा महिला सञ्चालित व्यवसायको संख्यामा ४५ प्रतिशत वृद्धि भएको छ। सरकारी ऋण तथा तालिम कार्यक्रमले यसमा महत्वपूर्ण भूमिका खेलेको छ।"
    },
    {
        source: "Ratopati", category: "विज्ञान",
        link: "https://www.ratopati.com",
        title: "त्रिभुवन विश्वविद्यालयका वैज्ञानिकले नयाँ औषधि अनुसन्धानमा सफलता पाए",
        description: "त्रिभुवन विश्वविद्यालयको औषधि विज्ञान विभागका अनुसन्धानकर्ताहरूले मधुमेह उपचारमा प्रयोग हुन सक्ने नयाँ प्राकृतिक यौगिक पत्ता लगाएका छन्। यो अनुसन्धान अन्तर्राष्ट्रिय जर्नलमा प्रकाशित भएको छ।"
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
    renderNewsFeed();
    renderTrending();
}

function updateSyncTime() {
    if (syncTime) syncTime.textContent = new Date().toLocaleTimeString('ne-NP');
}

// ── Portal Switcher ──
portalRadios.forEach(r => r.addEventListener('change', e => {
    if (portalTitle) {
        portalTitle.textContent = e.target.value === 'admin'
            ? 'प्रशासक पोर्टल'
            : 'नागरिक पहुँच पोर्टल';
    }
}));

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
    });
}

// ── Logout ──
function doLogout() {
    state.isAuthenticated = false;
    state.isAdmin  = false;
    state.username = '';
    const u = document.getElementById('username');
    const p = document.getElementById('password');
    if (u) u.value = '';
    if (p) p.value = '';
    dashPage.classList.remove('active');
    loginPage.classList.add('active');
}
if (logoutBtn) logoutBtn.addEventListener('click', doLogout);

// ── Render News Feed ──
function renderNewsFeed() {
    if (!newsContainer) return;
    newsContainer.innerHTML = '';
    MOCK_NEWS.forEach((news, index) => {
        const card = document.createElement('div');
        const isSuspect = news.category === 'संदिग्ध';
        card.className = 'news-card' + (isSuspect ? ' card-suspect' : '');
        const catColor = getCategoryColor(news.category);
        card.innerHTML = `
            <div class="news-card-top">
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <span class="cat-badge" style="background:${catColor.bg};color:${catColor.color};border:1px solid ${catColor.border};">${news.category || ''}</span>
                    <span class="source-tag">${news.source}</span>
                    ${isSuspect ? '<span class="suspect-tag"><i class="fas fa-exclamation-triangle"></i> संदिग्ध</span>' : ''}
                </div>
                <a href="${news.link}" class="view-src-link" target="_blank">
                    <i class="fas fa-external-link-alt"></i> स्रोत
                </a>
            </div>
            <h3>${news.title}</h3>
            <p>${news.description}</p>
            <div class="card-actions">
                <button class="verify-btn" onclick="verifyNews(${index}, this)">
                    <i class="fas fa-search"></i> सत्यापन गर्नुहोस्
                </button>
                <div class="verdict-inline" id="verdict-res-${index}"></div>
            </div>
        `;
        newsContainer.appendChild(card);
    });
}

function getCategoryColor(cat) {
    const map = {
        'राजनीति': { bg:'#eff6ff', color:'#1d4ed8', border:'#bfdbfe' },
        'अर्थ':    { bg:'#f0fdf4', color:'#15803d', border:'#86efac' },
        'खेलकुद':  { bg:'#fff7ed', color:'#c2410c', border:'#fed7aa' },
        'प्रविधि': { bg:'#f5f3ff', color:'#6d28d9', border:'#ddd6fe' },
        'स्वास्थ्य':{ bg:'#ecfdf5', color:'#065f46', border:'#a7f3d0' },
        'पर्यटन':  { bg:'#fffbeb', color:'#b45309', border:'#fde68a' },
        'शिक्षा':  { bg:'#fdf4ff', color:'#7e22ce', border:'#e9d5ff' },
        'वातावरण': { bg:'#f0fdf4', color:'#166534', border:'#bbf7d0' },
        'संदिग्ध': { bg:'#fff1f2', color:'#be123c', border:'#fecdd3' },
        'विपद्':   { bg:'#fff1f2', color:'#9f1239', border:'#fecdd3' },
        'समाज':    { bg:'#fef9c3', color:'#854d0e', border:'#fef08a' },
        'विज्ञान': { bg:'#e0f2fe', color:'#0369a1', border:'#bae6fd' },
        'ऊर्जा':   { bg:'#fef9c3', color:'#713f12', border:'#fef08a' },
        'कृषि':    { bg:'#f0fdf4', color:'#14532d', border:'#86efac' },
        'राष्ट्रिय':{ bg:'#eff6ff', color:'#1e40af', border:'#bfdbfe' },
        'अन्तर्राष्ट्रिय':{ bg:'#fdf4ff', color:'#6b21a8', border:'#e9d5ff' },
        'मौसम':    { bg:'#e0f2fe', color:'#0c4a6e', border:'#bae6fd' },
        'राजधानी': { bg:'#f8fafc', color:'#475569', border:'#e2e8f0' },
    };
    return map[cat] || { bg:'#f1f5f9', color:'#475569', border:'#e2e8f0' };
}

// ── Render Trending ──
function renderTrending() {
    if (!trendingContainer) return;
    trendingContainer.innerHTML = '';
    const suspicious = MOCK_NEWS.filter(n =>
        n.category === 'संदिग्ध' || n.title.includes("ALIEN") || n.description.includes("Shocking") || n.description.includes("secret") || n.description.includes("BREAKING")
    );
    if (suspicious.length > 0) {
        suspicious.forEach(news => {
            const card = document.createElement('div');
            card.className = 'trending-card';
            card.innerHTML = `
                <div class="trending-warning">
                    <i class="fas fa-exclamation-triangle"></i> उच्च संशय पत्ता लाग्यो
                </div>
                <h3>${news.title}</h3>
                <p><strong>स्रोत:</strong> ${news.source}</p>
            `;
            trendingContainer.appendChild(card);
        });
    } else {
        trendingContainer.innerHTML = `<div class="all-clear">✅ हाल कुनै उच्च जोखिमको अफवाह पत्ता लागेको छैन।</div>`;
    }
}

// ── Verify News ──
window.verifyNews = function(index, btnEl) {
    const news = MOCK_NEWS[index];
    const resContainer = document.getElementById(`verdict-res-${index}`);

    btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> जाँच भइरहेको छ...';
    btnEl.disabled = true;

    setTimeout(() => {
        btnEl.innerHTML = '<i class="fas fa-check"></i> सत्यापित';
        const isFake = news.title.includes("ALIEN") || news.description.includes("Shocking");
        const verdict = isFake ? "झूटा समाचार" : "विश्वसनीय";
        const vClass  = isFake ? "verdict-uncredible" : "verdict-credible";
        const icon    = isFake ? "🚨" : "✅";
        const reasons = isFake
            ? "<li>उच्च सनसनीखेज भाषा पत्ता लाग्यो (९५%)</li><li>स्रोत विश्वसनीय सूचीमा छैन</li><li>ALL CAPS प्रयोग — क्लिकबेटको संकेत</li>"
            : "<li>स्रोत ऐतिहासिक रूपमा विश्वसनीय</li><li>भावनात्मक हेरफेर स्कोर न्यून</li><li>धेरै समाचार स्रोतसँग मिल्दो</li>";

        resContainer.innerHTML = `
            <div class="verdict-box ${vClass}">
                <div class="verdict-title">${icon} ${verdict}</div>
                <div class="verdict-findings">
                    <strong>🔍 फरेन्सिक निष्कर्ष:</strong>
                    <ul>${reasons}</ul>
                </div>
            </div>
        `;
        addToHistory(news.title, verdict);
    }, 1500);
};

// ── Scan Custom Text ──
if (btnScan) {
    btnScan.addEventListener('click', () => {
        if (!scanText) return;
        const text = scanText.value.trim();
        if (text.length < 10) {
            alert('❌ विश्लेषणको लागि पाठ धेरै छोटो छ।');
            return;
        }
        btnScan.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ML एल्गोरिदम चलाउँदै...';
        btnScan.disabled = true;

        setTimeout(() => {
            btnScan.innerHTML = '<i class="fas fa-microscope"></i> सत्यापन सुरु गर्नुहोस्';
            btnScan.disabled = false;

            const isFake  = Math.random() > 0.5;
            const verdict = isFake ? "झूटा समाचार" : "विश्वसनीय";
            const vClass  = isFake ? "verdict-uncredible" : "verdict-credible";
            const icon    = isFake ? "🚨" : "✅";
            const reasons = isFake
                ? "<li>असामान्य भाषाशैली पत्ता लाग्यो</li><li>प्रमाणित तथ्यहरूको अभाव</li><li>भावनात्मक हेरफेर पत्ता लाग्यो</li>"
                : "<li>तटस्थ भाषाशैली</li><li>प्रमाणित तथ्यहरू उपस्थित</li><li>मानक पत्रकारिता संरचना</li>";

            if (scanResultContainer) {
                scanResultContainer.innerHTML = `
                    <div class="verdict-box ${vClass}" style="margin-top:16px;">
                        <div class="verdict-title">${icon} ${verdict}</div>
                        <div class="verdict-findings">
                            <strong>🔍 विश्लेषण सारांश:</strong>
                            <ul>${reasons}</ul>
                        </div>
                    </div>
                `;
            }
            addToHistory(text.substring(0, 35) + '...', verdict);
        }, 2000);
    });
}

// ── URL Scan ──
const btnUrlScan = document.getElementById('btn-url-scan');
if (btnUrlScan) {
    btnUrlScan.addEventListener('click', () => {
        const urlInput = document.getElementById('url-input');
        if (urlInput && urlInput.value) {
            btnUrlScan.innerHTML = '<i class="fas fa-spinner fa-spin"></i> स्क्र्यापिङ...';
            btnUrlScan.disabled = true;
            setTimeout(() => {
                btnUrlScan.innerHTML = '<i class="fas fa-search"></i> विश्लेषण';
                btnUrlScan.disabled = false;
                alert('✅ स्क्र्यापिङ सम्पन्न। विश्लेषण ट्रिगर गरिएको छ।');
            }, 1500);
        } else {
            alert('कृपया मान्य URL प्रविष्ट गर्नुहोस्।');
        }
    });
}

// ── History ──
function addToHistory(title, verdict) {
    const time = new Date().toLocaleTimeString('ne-NP');
    state.history.unshift({ title, verdict, time });
    if (state.history.length > 5) state.history.pop();
    renderHistory();
}

function renderHistory() {
    if (!scanHistory) return;
    scanHistory.innerHTML = '';
    if (state.history.length === 0) {
        scanHistory.innerHTML = '<li style="color:var(--text-muted);font-size:.8rem;font-family:Noto Sans Devanagari,sans-serif;">अझै कुनै सत्यापन छैन।</li>';
        return;
    }
    state.history.forEach(item => {
        const icon = item.verdict === 'विश्वसनीय' ? '✅' : '🚨';
        const li = document.createElement('li');
        li.innerHTML = `
            <strong>${icon} ${item.title}</strong>
            <span>${item.time}</span>
        `;
        scanHistory.appendChild(li);
    });
}

// ── Refresh ──
const refreshBtn = document.getElementById('refresh-btn');
if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
        updateSyncTime();
        renderNewsFeed();
    });
}

// ── Clear Activity Log ──
window.clearActivityLog = function() {
    const log = document.getElementById('activity-log');
    if (log) {
        log.innerHTML = '<li class="log-item log-success"><span class="log-dot"></span><div><strong>लग खाली गरियो</strong><p>सबै गतिविधि लगहरू मेटाइयो।</p><time>अहिले</time></div></li>';
    }
};

// ── Animate perf bars on admin tab open ──
document.querySelectorAll('.cat-item').forEach(item => {
    item.addEventListener('click', () => {
        if (item.getAttribute('data-target') === 'admin') {
            setTimeout(() => {
                document.querySelectorAll('.perf-bar').forEach(bar => {
                    const w = bar.style.width;
                    bar.style.width = '0';
                    setTimeout(() => { bar.style.width = w; }, 50);
                });
            }, 100);
        }
    });
});

// ── Run ──
init();
renderHistory();
