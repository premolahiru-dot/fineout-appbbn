// ================= 🛡️ MASTER BACKEND SERVER & RATE LIMITER =================
const IP_COOLDOWN_MS = 3500;             
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; 
const MAX_REQUESTS_PER_WINDOW = 30;       
const MAX_INPUT_CHARS = 300;             
const MAX_OUTPUT_TOKENS = 750;           
const APP_VERSION = "2.1.0";             

const ipTracker = new Map();

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

        // Auto-Update Version Checker
        if (action === "get_version") {
            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ version: APP_VERSION })
            };
        }

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

        // Server-Side Cooldown & Rate Limiter
        const clientIp = event.headers['x-nf-client-connection-ip'] || 
                         event.headers['client-ip'] || 
                         event.headers['x-forwarded-for'] || 
                         'unknown_ip';

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

        const API_KEY = process.env.GEMINI_API_KEY;
        if (!API_KEY) {
            return {
                statusCode: 500,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: "GEMINI_API_KEY is missing in Netlify." })
            };
        }

        // AI Web Studio Generator
        if (action === "generate_site") {
            const promptText = (body.prompt || "").slice(0, MAX_INPUT_CHARS);
            const sitePrompt = `You are FineAI Web Engine. Create a complete, modern, responsive single-page HTML website for: "${promptText}". Return ONLY the pure HTML code inside <!DOCTYPE html><html>...</html>.`;

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

        // AI Search Engine Logic with Spotify Intelligence
        const rawQuery = (body.query || "").slice(0, MAX_INPUT_CHARS);
        const searchUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${API_KEY}`;

        const systemPrompt = `You are FineAI, the next-generation search engine with built-in Spotify Music Intelligence.
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
};
