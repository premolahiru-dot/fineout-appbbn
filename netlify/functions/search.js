exports.handler = async function(event, context) {
    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed" })
        };
    }

    try {
        const body = JSON.parse(event.body);
        const action = body.action || "search"; // "search" | "get_config" | "generate_site"

        // 1. Firebase Config එක Frontend එකට ආරක්ෂිතව ලබාදීම
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

        const API_KEY = process.env.GEMINI_API_KEY;
        if (!API_KEY) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: "GEMINI_API_KEY is not configured in Netlify." })
            };
        }

        // 2. AI Website Builder Logic
        if (action === "generate_site") {
            const promptText = body.prompt;
            const sitePrompt = `You are FineAI Web Engine, a world-class frontend web developer.
Create a complete, modern, ultra-stylish, responsive single-page HTML website for this request: "${promptText}".
Include modern CSS (dark/glassmorphism design, responsive, cool fonts via CDN, animations, nice buttons).
Return ONLY the pure raw HTML code inside <!DOCTYPE html><html>...</html>. Do NOT include markdown backticks or explanations.`;

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

        // 3. Main Search Logic
        const query = body.query;
        const searchUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${API_KEY}`;

        const systemPrompt = `You are FineAI, the next-generation ultra-intelligent search engine.
User Query: "${query}".
Answer accurately, intelligently, and clearly in the SAME LANGUAGE as user (Sinhala if Sinhala, English if English).

Respond ONLY with raw valid JSON in this exact structure:
{
  "is_insult": false,
  "wiki_title": "Exact English Wikipedia entity name for this topic (e.g. 'Sigiriya', 'Colombo', 'James Webb Space Telescope', 'Albert Einstein')",
  "visual_prompt": "Clear 3-5 word descriptive English phrase for a photograph",
  "category": "Location/Science/History/Tech/General",
  "badge_text": "Short Badge Title (e.g. '📍 Sigiriya, Sri Lanka' or '🔭 Space Technology')",
  "answer": "Structured Markdown output with ## Main Title, concise summary, key points with bullet points, and important details formatted neatly."
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
            body: JSON.stringify({ error: error.message })
        };
    }
};
