// ================= 🛡️ BACKEND SERVER & APP ENGINE =================
const IP_COOLDOWN_MS = 3500;             
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; 
const MAX_REQUESTS_PER_WINDOW = 30;       
const MAX_INPUT_CHARS = 300;             
const MAX_OUTPUT_TOKENS = 750;           

const ipTracker = new Map();

exports.handler = async function(event, context) {
    const API_KEY = process.env.GEMINI_API_KEY;

    // 1. GET REQUEST: SERVE COMPLETE APP UI TO PREVIEW PANEL
    if (event.httpMethod === "GET") {
        return {
            statusCode: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
            body: FULL_APP_HTML
        };
    }

    // 2. POST REQUESTS (API, AI SEARCH & WEB STUDIO)
    if (event.httpMethod === "POST") {
        try {
            const body = JSON.parse(event.body || "{}");
            const action = body.action || "search";

            // Firebase Config Provider
            if (action === "get_config") {
                return {
                    statusCode: 200,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        apiKey: process.env.FIREBASE_API_KEY || "AIzaSyCz1K3qek2p7N_VmDDeLn4eowkQ6VeBi8o",
                        authDomain: process.env.FIREBASE_AUTH_DOMAIN || "new-2c44f.firebaseapp.com",
                        databaseURL: process.env.FIREBASE_DB_URL || "https://new-2c44f-default-rtdb.firebaseio.com",
                        projectId: process.env.FIREBASE_PROJECT_ID || "new-2c44f",
                        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "new-2c44f.firebasestorage.app",
                        messagingSenderId: "198112294220",
                        appId: "1:198112294220:web:d9aee5bd5c9d4f4a5e0be9"
                    })
                };
            }

            // Cooldown & Rate Limiter
            const clientIp = event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'unknown_ip';
            const now = Date.now();
            let userRecord = ipTracker.get(clientIp);

            if (!userRecord) {
                userRecord = { count: 0, windowStart: now, lastRequestTime: 0 };
                ipTracker.set(clientIp, userRecord);
            }

            if (userRecord.lastRequestTime && (now - userRecord.lastRequestTime) < IP_COOLDOWN_MS) {
                const waitSec = Math.ceil((IP_COOLDOWN_MS - (now - userRecord.lastRequestTime)) / 1000);
                return {
                    statusCode: 429,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ error: `⏳ Cooldown Active: Please wait ${waitSec}s!` })
                };
            }

            if (now - userRecord.windowStart > RATE_LIMIT_WINDOW_MS) {
                userRecord.count = 0;
                userRecord.windowStart = now;
            }

            if (userRecord.count >= MAX_REQUESTS_PER_WINDOW) {
                return {
                    statusCode: 429,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ error: `🛑 Usage limit reached. Try again in 15 mins.` })
                };
            }

            userRecord.count += 1;
            userRecord.lastRequestTime = now;

            if (!API_KEY) {
                return {
                    statusCode: 500,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ error: "GEMINI_API_KEY is missing in Netlify." })
                };
            }

            // AI Web Generator
            if (action === "generate_site") {
                const promptText = (body.prompt || "").slice(0, MAX_INPUT_CHARS);
                const sitePrompt = `You are FineAI Web Engine. Create a complete, stylish, modern single-page HTML website for: "${promptText}". Return ONLY the raw HTML code inside <!DOCTYPE html><html>...</html>.`;

                const siteUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${API_KEY}`;
                let res = await fetch(siteUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ role: "user", parts: [{ text: sitePrompt }] }],
                        generationConfig: { temperature: 0.3, maxOutputTokens: 2000 }
                    })
                });

                if (!res.ok) {
                    const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${API_KEY}`;
                    res = await fetch(fallbackUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            contents: [{ role: "user", parts: [{ text: sitePrompt }] }],
                            generationConfig: { temperature: 0.3, maxOutputTokens: 2000 }
                        })
                    });
                }

                const data = await res.json();
                let htmlCode = data.candidates[0].content.parts[0].text.replace(/```html/gi, '').replace(/```/gi, '').trim();

                return {
                    statusCode: 200,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ html: htmlCode })
                };
            }

            // AI Search Engine Logic
            const rawQuery = (body.query || "").slice(0, MAX_INPUT_CHARS);
            const searchUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${API_KEY}`;

            const systemPrompt = `You are FineAI Search Engine with Spotify Intelligence.
User Query: "${rawQuery}".

Respond ONLY with raw valid JSON in this exact structure:
{
  "is_insult": false,
  "is_music": true/false,
  "spotify_search": "Exact Song Name and Artist for Spotify",
  "wiki_title": "Exact English Wikipedia entity name for this topic",
  "visual_prompt": "Clear 3-5 word descriptive English phrase for a 4K photo",
  "category": "Music/Location/Science/History/Tech/General",
  "badge_text": "Short Badge Title",
  "answer": "Concise structured Markdown output in user's language with key points."
}`;

            let response = await fetch(searchUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: MAX_OUTPUT_TOKENS }
                })
            });

            if (!response.ok) {
                const fallbackURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${API_KEY}`;
                response = await fetch(fallbackURL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
                        generationConfig: { temperature: 0.2, maxOutputTokens: MAX_OUTPUT_TOKENS }
                    })
                });
            }

            const data = await response.json();
            let rawText = data.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/gi, '').trim();
            const parsedData = JSON.parse(rawText);

            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(parsedData)
            };

        } catch (error) {
            return {
                statusCode: 500,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: error.message })
            };
        }
    }
};

// ================= 3. EMBEDDED COMPLETE APPLICATION UI (HTML/CSS/JS) =================
const FULL_APP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fineout Engine • Powered by FineAI</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Noto+Sans+Sinhala:wght@400;600;700&display=swap" rel="stylesheet">
    <script src="https://www.gstatic.com/firebasejs/10.13.1/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.13.1/firebase-auth-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.13.1/firebase-database-compat.js"></script>
    <style>
        :root {
            --bg-base: #060913; --surface-card: rgba(18, 24, 39, 0.75); --surface-border: rgba(255, 255, 255, 0.08);
            --primary: #38bdf8; --spotify-green: #1db954; --accent-purple: #c084fc; --danger: #ef4444;
            --text-main: #f8fafc; --text-muted: #94a3b8; --text-dim: #64748b;
        }
        body.incognito-mode { --bg-base: #050508; --surface-card: rgba(20, 15, 28, 0.85); --primary: #c084fc; }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', 'Noto Sans Sinhala', system-ui, sans-serif; }
        body {
            background-color: var(--bg-base); color: var(--text-main); min-height: 100vh;
            display: flex; flex-direction: column; align-items: center; padding: 20px 16px 80px; position: relative; overflow-x: hidden;
        }
        .intro-splash-overlay, .incognito-video-overlay {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: #000; z-index: 999999;
            display: flex; justify-content: center; align-items: center; overflow: hidden; transition: opacity 0.7s ease;
        }
        .intro-video-player { width: 100vw; height: 100vh; object-fit: cover; }
        .ambient-glow-1 {
            position: fixed; top: -150px; left: 50%; transform: translateX(-50%); width: 700px; height: 400px;
            background: radial-gradient(circle, rgba(56, 189, 248, 0.12) 0%, transparent 70%); z-index: 0; pointer-events: none;
        }
        .top-navbar { width: 100%; max-width: 860px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; z-index: 10; }
        .auth-btn, .incognito-btn {
            background: rgba(30, 41, 59, 0.7); border: 1.5px solid var(--surface-border); color: var(--text-main);
            padding: 7px 14px; border-radius: 20px; font-size: 0.82rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;
        }
        .user-profile-badge {
            display: none; align-items: center; gap: 8px; background: rgba(30, 41, 59, 0.8); border: 1.5px solid rgba(56, 189, 248, 0.4);
            padding: 4px 10px 4px 6px; border-radius: 24px;
        }
        .user-avatar { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; border: 1px solid #38bdf8; }
        .user-name { font-size: 0.8rem; font-weight: 600; color: #f8fafc; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .signout-btn { background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 0.8rem; }
        .mode-switch-wrapper { display: flex; gap: 8px; margin-bottom: 16px; z-index: 5; flex-wrap: wrap; justify-content: center; }
        .mode-pill {
            padding: 7px 16px; border-radius: 20px; background: rgba(30, 41, 59, 0.5); border: 1px solid var(--surface-border);
            color: var(--text-muted); font-size: 0.82rem; font-weight: 700; cursor: pointer; transition: all 0.2s;
        }
        .mode-pill.active { background: linear-gradient(135deg, rgba(56, 189, 248, 0.25), rgba(29, 185, 84, 0.25)); border-color: var(--primary); color: #fff; }
        .mode-pill.music-active { background: linear-gradient(135deg, rgba(29, 185, 84, 0.3), rgba(16, 185, 129, 0.25)); border-color: var(--spotify-green); color: #fff; }
        .container { width: 100%; max-width: 860px; display: flex; flex-direction: column; align-items: center; position: relative; z-index: 1; }
        .brand-logo-img { width: 135px; height: 135px; object-fit: contain; margin-bottom: 12px; }
        .search-area-wrapper { width: 100%; margin-bottom: 18px; }
        .search-box {
            width: 100%; display: flex; align-items: center; background: var(--surface-card); backdrop-filter: blur(20px);
            border: 1.5px solid var(--surface-border); border-radius: 28px; padding: 6px 10px 6px 20px; box-shadow: 0 15px 40px rgba(0, 0, 0, 0.5);
        }
        .search-input { flex: 1; background: transparent; border: none; outline: none; color: #fff; font-size: 1rem; padding: 10px 0; }
        .search-btn { background: linear-gradient(135deg, #0284c7, #2563eb); color: #fff; border: none; padding: 10px 22px; border-radius: 22px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
        .web-studio-panel {
            width: 100%; display: none; flex-direction: column; gap: 14px; background: var(--surface-card);
            border: 1.5px solid rgba(56, 189, 248, 0.3); border-radius: 24px; padding: 24px; margin-bottom: 25px;
        }
        .domain-input-group {
            display: flex; align-items: center; background: rgba(15, 23, 42, 0.8); border: 1px solid var(--surface-border); border-radius: 16px; padding: 8px 16px; gap: 6px;
        }
        .domain-prefix { color: #38bdf8; font-weight: 700; }
        .domain-slug-input { flex: 1; background: transparent; border: none; outline: none; color: #fff; }
        .domain-suffix { color: #c084fc; font-weight: 700; }
        .studio-prompt-input { width: 100%; height: 90px; background: rgba(15, 23, 42, 0.8); border: 1px solid var(--surface-border); border-radius: 16px; padding: 12px; color: #fff; outline: none; resize: none; }
        .btn-generate-web { background: linear-gradient(135deg, #0284c7, #8b5cf6); color: #fff; border: none; padding: 12px; border-radius: 16px; font-weight: 700; cursor: pointer; }
        .spotify-embed-container { width: 100%; margin: 15px 0 10px; border-radius: 16px; overflow: hidden; border: 1.5px solid rgba(29, 185, 84, 0.4); background: #121212; }
        .spotify-iframe { width: 100%; height: 152px; border: none; border-radius: 14px; }
        .results-container { width: 100%; display: none; flex-direction: column; gap: 20px; }
        .result-card { background: var(--surface-card); backdrop-filter: blur(25px); border: 1px solid var(--surface-border); border-radius: 24px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
        .image-container { width: 100%; height: 320px; background: #0b1120; position: relative; overflow: hidden; display: flex; justify-content: center; align-items: center; }
        .result-image { width: 100%; height: 100%; object-fit: cover; }
        .badge-bar { position: absolute; bottom: 14px; left: 14px; display: flex; gap: 8px; }
        .info-badge { background: rgba(15, 23, 42, 0.88); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; padding: 5px 12px; border-radius: 12px; font-size: 0.8rem; font-weight: 700; }
        .info-badge.spotify-badge { border-color: rgba(29, 185, 84, 0.6); color: #1db954; }
        .result-body { padding: 25px; }
        .result-content { color: #e2e8f0; font-size: 1rem; line-height: 1.8; }
        .published-site-viewer { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 9999999; background: #000; display: none; }
        .viewer-close-bar { position: absolute; top: 12px; right: 16px; z-index: 10; background: rgba(15, 23, 42, 0.9); border: 1px solid var(--surface-border); color: #fff; padding: 6px 14px; border-radius: 20px; cursor: pointer; }
        .viewer-iframe { width: 100%; height: 100%; border: none; }
        .loading-shimmer { display: none; width: 100%; background: var(--surface-card); border-radius: 24px; padding: 24px; border: 1px solid var(--surface-border); }
        .shimmer-box { height: 200px; background: linear-gradient(90deg, #131d31 25%, #1e2e4f 50%, #131d31 75%); background-size: 200% 100%; animation: shimmer 1.3s infinite; border-radius: 16px; margin-bottom: 16px; }
        .shimmer-line { height: 14px; background: linear-gradient(90deg, #131d31 25%, #1e2e4f 50%, #131d31 75%); background-size: 200% 100%; animation: shimmer 1.3s infinite; border-radius: 8px; margin-bottom: 12px; }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .history-wrapper { width: 100%; display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
        .history-header { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: var(--text-dim); }
        .clear-btn { background: none; border: none; color: #f87171; cursor: pointer; font-size: 0.8rem; }
        .history-chips { display: flex; gap: 8px; flex-wrap: wrap; }
        .chip { background: var(--surface-card); color: var(--text-muted); border: 1px solid var(--surface-border); padding: 6px 12px; border-radius: 14px; font-size: 0.82rem; cursor: pointer; }
    </style>
</head>
<body>
<div class="intro-splash-overlay" id="introSplashOverlay"><video id="introVideo" class="intro-video-player" autoplay muted playsinline><source src="https://files.catbox.moe/vtdwyb.mp4" type="video/mp4"></video></div>
<div class="incognito-video-overlay" id="incognitoVideoOverlay" style="display:none; opacity:0;"><video id="incognitoVideo" class="intro-video-player" playsinline><source src="https://files.catbox.moe/bzh1kc.mp4" type="video/mp4"></video></div>
<div class="published-site-viewer" id="publishedSiteViewer"><button class="viewer-close-bar" onclick="closeSiteViewer()">✕ Back to FineAI</button><iframe id="siteIframe" class="viewer-iframe"></iframe></div>
<div class="ambient-glow-1"></div>

<div class="top-navbar">
    <div>
        <button id="googleSignInBtn" class="auth-btn" onclick="signInWithGoogle()"><span>🌐</span> <span>Sign In</span></button>
        <div id="userProfileBadge" class="user-profile-badge">
            <img id="userAvatar" class="user-avatar" src="" alt="User" /><span id="userName" class="user-name">User</span><button class="signout-btn" onclick="signOutUser()">✕</button>
        </div>
    </div>
    <div>
        <button class="incognito-btn" id="incognitoToggleBtn" onclick="toggleIncognito()"><span>🕶️</span> <span id="incognitoText">Incognito</span></button>
    </div>
</div>

<div class="mode-switch-wrapper">
    <div class="mode-pill active" id="searchModePill" onclick="switchMode('search')">⚡ AI Search</div>
    <div class="mode-pill" id="musicModePill" onclick="switchMode('music')">🎵 Spotify Music</div>
    <div class="mode-pill" id="studioModePill" onclick="switchMode('studio')">🌐 Web Studio (Fine.name.out)</div>
</div>

<div class="container">
    <div class="brand"><img id="brandLogo" src="https://files.catbox.moe/7y76th.png" alt="FineAI Logo" class="brand-logo-img" /></div>
    <div class="search-area-wrapper" id="searchArea">
        <div class="search-box">
            <input type="text" id="queryInput" class="search-input" placeholder="Ask or search anything in any language..." onkeydown="if(event.key === 'Enter') handleSearch()" />
            <button class="search-btn" id="mainSearchBtn" onclick="handleSearch()">Search ➔</button>
        </div>
    </div>
    <div class="web-studio-panel" id="webStudioPanel">
        <div class="domain-input-group"><span class="domain-prefix">Fine.</span><input type="text" id="siteSlugInput" class="domain-slug-input" placeholder="yourname" /><span class="domain-suffix">.out</span></div>
        <textarea id="sitePromptInput" class="studio-prompt-input" placeholder="Describe the website you want..."></textarea>
        <button class="btn-generate-web" onclick="generateAndPublishWeb()">🚀 Create & Publish Website</button>
    </div>
    <div class="history-wrapper" id="historyWrapper">
        <div class="history-header"><span id="historyHeaderTitle">🕒 Recent Searches</span><button class="clear-btn" onclick="clearHistory()">Clear History</button></div>
        <div class="history-chips" id="historyChips"></div>
    </div>
    <div class="loading-shimmer" id="loadingState"><div class="shimmer-box"></div><div class="shimmer-line"></div></div>
    <div class="results-container" id="resultsContainer">
        <div class="result-card">
            <div class="image-container"><img id="resultImage" class="result-image" alt="Preview" /><div class="badge-bar"><div id="badgeTag" class="info-badge">⚡ FineAI Verified</div></div></div>
            <div class="result-body">
                <div id="spotifyPlayerContainer" class="spotify-embed-container" style="display: none;"><iframe id="spotifyIframe" class="spotify-iframe" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe></div>
                <div class="result-content" id="resultContent"></div>
            </div>
        </div>
    </div>
</div>

<script>
    const BACKEND_API_URL = "/.netlify/functions/search";
    let rtdb = null, auth = null, currentUser = null, isIncognito = false, currentMode = "search";

    async function initFirebaseFromBackend() {
        try {
            const res = await fetch(BACKEND_API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get_config" }) });
            const config = await res.json();
            firebase.initializeApp(config);
            auth = firebase.auth();
            rtdb = firebase.database();
            auth.onAuthStateChanged(user => {
                currentUser = user;
                if (user) {
                    document.getElementById('googleSignInBtn').style.display = 'none';
                    document.getElementById('userProfileBadge').style.display = 'flex';
                    document.getElementById('userAvatar').src = user.photoURL || "https://files.catbox.moe/7y76th.png";
                    document.getElementById('userName').innerText = user.displayName ? user.displayName.split(" ")[0] : "User";
                    document.getElementById('historyHeaderTitle').innerText = "☁️ Cloud Synced Searches";
                } else {
                    document.getElementById('googleSignInBtn').style.display = 'flex';
                    document.getElementById('userProfileBadge').style.display = 'none';
                    document.getElementById('historyHeaderTitle').innerText = "🕒 Recent Searches";
                }
                loadHistory();
            });
            checkSharedSiteUrl();
        } catch (e) { console.error(e); }
    }

    function signInWithGoogle() { if (auth) auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
    function signOutUser() { if (auth) auth.signOut().then(loadHistory); }

    function switchMode(mode) {
        currentMode = mode;
        document.getElementById('searchModePill').className = 'mode-pill' + (mode === 'search' ? ' active' : '');
        document.getElementById('musicModePill').className = 'mode-pill' + (mode === 'music' ? ' music-active' : '');
        document.getElementById('studioModePill').className = 'mode-pill' + (mode === 'studio' ? ' active' : '');
        document.getElementById('searchArea').style.display = mode === 'studio' ? 'none' : 'block';
        document.getElementById('webStudioPanel').style.display = mode === 'studio' ? 'flex' : 'none';
        const qInput = document.getElementById('queryInput');
        const sBtn = document.getElementById('mainSearchBtn');
        if (mode === 'music') { qInput.placeholder = "🎵 Search any song, artist, or playlist on Spotify..."; sBtn.innerText = "Play 🎧"; }
        else { qInput.placeholder = "Ask or search anything in any language..."; sBtn.innerText = "Search ➔"; }
    }

    async function generateAndPublishWeb() {
        const rawSlug = document.getElementById('siteSlugInput').value.trim().toLowerCase();
        const prompt = document.getElementById('sitePromptInput').value.trim();
        if (!rawSlug || !prompt) return alert("Please fill slug and prompt!");
        const formattedDomain = "fine." + rawSlug.replace(/[^a-z0-9]/g, '') + ".out";
        document.getElementById('loadingState').style.display = 'block';
        try {
            const res = await fetch(BACKEND_API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate_site", prompt }) });
            const data = await res.json();
            if (rtdb) {
                await rtdb.ref("published_sites/" + formattedDomain.replace(/\\./g, '_')).set({ domain: formattedDomain, html: data.html, created_at: Date.now(), creator: currentUser ? currentUser.email : "Anonymous" });
            }
            const shareLink = window.location.origin + "/?site=" + formattedDomain;
            navigator.clipboard.writeText(shareLink);
            alert("🎉 Published!\\n\\n🔗 " + shareLink);
            openSiteViewerWithHtml(data.html);
        } catch (e) { alert(e.message); }
        finally { document.getElementById('loadingState').style.display = 'none'; }
    }

    function checkSharedSiteUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const siteDomain = urlParams.get('site');
        if (siteDomain && rtdb) {
            rtdb.ref("published_sites/" + siteDomain.replace(/\\./g, '_')).once('value', snap => {
                const val = snap.val();
                if (val && val.html) openSiteViewerWithHtml(val.html);
            });
        }
    }

    function openSiteViewerWithHtml(html) {
        document.getElementById('publishedSiteViewer').style.display = 'block';
        document.getElementById('siteIframe').srcdoc = html;
    }
    function closeSiteViewer() {
        document.getElementById('publishedSiteViewer').style.display = 'none';
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    const introVideo = document.getElementById('introVideo');
    introVideo.addEventListener('ended', () => { document.getElementById('introSplashOverlay').style.display = 'none'; });
    introVideo.addEventListener('error', () => { document.getElementById('introSplashOverlay').style.display = 'none'; });

    function toggleIncognito() {
        isIncognito = !isIncognito;
        document.body.classList.toggle('incognito-mode', isIncognito);
        document.getElementById('incognitoText').innerText = isIncognito ? "Exit" : "Incognito";
    }

    async function handleSearch() {
        const query = document.getElementById('queryInput').value.trim();
        if (!query) return;
        saveHistory(query);
        document.getElementById('resultsContainer').style.display = 'none';
        document.getElementById('loadingState').style.display = 'block';
        document.getElementById('spotifyPlayerContainer').style.display = 'none';
        try {
            const res = await fetch(BACKEND_API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
            const data = await res.json();
            if (res.status === 429) {
                throw new Error(data.error || "Cooldown active!");
            }
            if (data.is_music || currentMode === 'music' || data.spotify_search) {
                document.getElementById('spotifyIframe').src = "https://open.spotify.com/embed/search/" + encodeURIComponent(data.spotify_search || query) + "?utm_source=generator&theme=0";
                document.getElementById('spotifyPlayerContainer').style.display = 'block';
            }
            let imgUrl = "https://image.pollinations.ai/prompt/" + encodeURIComponent(data.visual_prompt || query) + "?width=900&height=450&nologo=true";
            try {
                const wikiRes = await fetch("https://en.wikipedia.org/w/api.php?action=query&titles=" + encodeURIComponent(data.wiki_title || query) + "&prop=pageimages&format=json&pithumbsize=1000&origin=*");
                const wikiJson = await wikiRes.json();
                const pages = wikiJson.query?.pages;
                if (pages && pages[Object.keys(pages)[0]]?.thumbnail?.source) imgUrl = pages[Object.keys(pages)[0]].thumbnail.source;
            } catch (e) {}
            document.getElementById('resultImage').src = imgUrl;
            document.getElementById('badgeTag').innerText = data.badge_text || "⚡ FineAI Verified";
            document.getElementById('resultContent').innerHTML = data.answer.replace(/\\n/g, '<br>');
            document.getElementById('resultsContainer').style.display = 'flex';
        } catch (e) {
            document.getElementById('resultContent').innerHTML = "<span style='color:#ef4444;font-weight:600;'>⚠️ " + e.message + "</span>";
            document.getElementById('resultsContainer').style.display = 'flex';
        } finally {
            document.getElementById('loadingState').style.display = 'none';
        }
    }

    function saveHistory(query) {
        if (isIncognito) return;
        if (currentUser && rtdb) rtdb.ref("users/" + currentUser.uid + "/history").push({ query, timestamp: Date.now() });
        else {
            let hist = JSON.parse(localStorage.getItem('fine_hist') || "[]");
            hist = [query, ...hist.filter(x => x !== query)].slice(0, 6);
            localStorage.setItem('fine_hist', JSON.stringify(hist));
            renderHistoryChips(hist);
        }
    }

    function loadHistory() {
        if (currentUser && rtdb) {
            rtdb.ref("users/" + currentUser.uid + "/history").limitToLast(6).on('value', snap => {
                const val = snap.val();
                renderHistoryChips(val ? [...new Set(Object.values(val).map(x => x.query).reverse())] : []);
            });
        } else {
            renderHistoryChips(JSON.parse(localStorage.getItem('fine_hist') || "[]"));
        }
    }

    function renderHistoryChips(items) {
        const wrap = document.getElementById('historyChips');
        wrap.innerHTML = items && items.length ? "" : "<span style='color:var(--text-dim);font-size:0.8rem;'>No searches yet</span>";
        (items || []).forEach(item => {
            const chip = document.createElement('div');
            chip.className = 'chip'; chip.innerText = "🔍 " + item;
            chip.onclick = () => { document.getElementById('queryInput').value = item; handleSearch(); };
            wrap.appendChild(chip);
        });
    }

    function clearHistory() {
        if (currentUser && rtdb) rtdb.ref("users/" + currentUser.uid + "/history").remove();
        else localStorage.removeItem('fine_hist');
        renderHistoryChips([]);
    }

    document.addEventListener('DOMContentLoaded', initFirebaseFromBackend);
</script>
</body>
</html>`;
