exports.handler = async function(event, context) {
    // Only allow POST requests
    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed" })
        };
    }

    try {
        const { query } = JSON.parse(event.body);
        if (!query) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Query is required" })
            };
        }

        // Netlify Environment Variable එකෙන් API Key එක ලබාගැනීම
        const API_KEY = process.env.GEMINI_API_KEY;
        if (!API_KEY) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: "GEMINI_API_KEY is not configured in Netlify." })
            };
        }

        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

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

        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
                generationConfig: { temperature: 0.25, maxOutputTokens: 1200 }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: data.error?.message || "API Error" })
            };
        }

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
