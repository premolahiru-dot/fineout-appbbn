// Server-Side Cooldown Memory (IP Tracking)
const IP_COOLDOWN_MS = 3500; // තත්පර 3.5 ක Cooldown කාලය
const ipRequestHistory = new Map();

exports.handler = async function(event, context) {
    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed" })
        };
    }

    try {
        const body = JSON.parse(event.body || "{}");
        const action = body.action || "search";

        // 1. Firebase Config Provider
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

        // ================= 🛡️ SERVER-SIDE IP COOLDOWN SYSTEM =================
        const clientIp = event.headers['x-nf-client-connection-ip'] || 
                         event.headers['client-ip'] || 
                         event.headers['x-forwarded-for'] || 
                         'unknown_ip';

        const currentTime = Date.now();
        const lastRequestTime = ipRequestHistory.get(clientIp);

        if (lastRequestTime && (currentTime - lastRequestTime) < IP_COOLDOWN_MS) {
            const remainingSeconds = Math.ceil((IP_COOLDOWN_MS - (currentTime - lastRequestTime)) / 1000);
            return {
                statusCode: 429,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    error: `⏳ Cooldown Active: Please wait ${remainingSeconds} second(s) before sending another request!` 
                })
            };
        }

        // Update IP Timestamp
        ipRequestHistory.set(clientIp, currentTime);

        // Memory cleanup (පැරණි records ස්වයංක්‍රීයව මකා දැමීම)
        if (ipRequestHistory.size > 1000) {
            for (let [ip, time] of ipRequestHistory) {
                if (currentTime - time > 60000) ipRequestHistory.delete(ip);
            }
        }
        // =====================================================================

        const API_KEY = process.env.GEMINI_API_KEY;
        if (!API_KEY) {
            return {
                statusCode: 500,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: "GEMINI_API_KEY is not configured in Netlify." })
            };
        }

        // 2. AI Website Builder
        if (action === "generate_site") {
            const promptText = body.prompt;
            const sitePrompt = `You are FineAI Web Engine. Create a complete, modern, responsive single-page HTML website for: "${promptText}". Return ONLY pure raw HTML code inside <!DOCTYPE html><html>...</html>.`;

            const siteUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${API_KEY}`;
            let res = await fetch(siteUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: sitePrompt }] }],
                    generationConfig: { temperature: 0.4, maxOutputTokens: 3000 }
                })
            });

            if (!res.ok) {
                const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${API_KEY}`;
                res = await fetch(fallbackUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ role: "user", parts: [{ text: sitePrompt }] }],
                        generationConfig: { temperature: 0.4, maxOutputTokens: 3000 }
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

        // 3. Search Engine with Spotify Intelligence
        const query = body.query;
        const searchUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${API_KEY}`;

        const systemPrompt = `You are FineAI, the next-generation search engine with built-in Spotify Music Intelligence.
User Query: "${query}".

Respond ONLY with raw valid JSON in this exact structure:
{
  "is_insult": false,
  "is_music": true/false,
  "spotify_search": "Exact Song Name and Artist for Spotify",
  "wiki_title": "Exact English Wikipedia entity name for this topic",
  "visual_prompt": "Clear 3-5 word descriptive English phrase for a 4K photo",
  "category": "Music/Location/Science/History/Tech/General",
  "badge_text": "Short Badge Title (e.g. '🎵 Spotify Music' or '📍 Location')",
  "answer": "Structured Markdown output in user's language with summary, track/topic details, facts, or lyrics neatly formatted."
}`;

        let response = await fetch(searchUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
                generationConfig: { temperature: 0.25, maxOutputTokens: 1200 }
            })
        });

        if (!response.ok) {
            const fallbackURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${API_KEY}`;
            response = await fetch(fallbackURL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
                    generationConfig: { temperature: 0.25, maxOutputTokens: 1200 }
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
};
