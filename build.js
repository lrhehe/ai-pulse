require('dotenv').config();
const fsNative = require('fs');
const path = require('path');
const axios = require('axios');
const { fetchSource, SOURCE_KEYS } = require('./src/fetchers');
const { generateHTML, generateShell } = require('./src/template');

// Ensure dist exists
const DIST_DIR = path.join(__dirname, 'dist');
if (!fsNative.existsSync(DIST_DIR)) {
    fsNative.mkdirSync(DIST_DIR, { recursive: true });
}

async function generateBriefing(category, items) {
    if (!items || items.length === 0) return null;

    // DeepSeek API
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        console.warn('Skipping briefing: No DEEPSEEK_API_KEY');
        return null;
    }

    const titles = items.slice(0, 10).map(i => `- ${i.title} (${i.source})`).join('\n');
    const prompt = `
You are an AI News Editor. Summarize the top 3-5 most important stories for the category "${category}" from the list below.
Cluster related stories together.

For each story/cluster, provide a briefing in this specific format:

### 🔹 [Title of the Story/Trend in Chinese]
**💡 Technical Significance**: [Concise explaination of the breakthrough or tech details in Chinese]
**🚀 Why it Matters**: [Impact on industry/research in Chinese]

---

**Output Rules:**
- ONLY output the Markdown content.
- Use the emojis as shown.
- Keep it professional but easy to scan.
- If stories are low quality, pick only the best 1 or 2.

Category: ${category}
Stories:
${titles}
`;

    try {
        const response = await axios.post('https://api.deepseek.com/chat/completions', {
            model: "deepseek-reasoner",
            messages: [
                { role: "system", content: "You are a helpful AI news assistant." },
                { role: "user", content: prompt }
            ],
            stream: false
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error(`Briefing generation failed for ${category}:`, error.response?.data || error.message);
        return null;
    }
}

async function main() {
    console.log('Starting AI Pulse Build...');

    const data = {
        timestamp: new Date().toISOString(),
        briefings: {}
    };

    console.log('Starting Parallel Pipeline (Fetch + Briefing)...');

    // Pipeline: Process sources with limited concurrency (2 at a time) to avoid network/API limits
    const CONCURRENCY_LIMIT = 3;
    const results = [];

    // Helper for chunking
    const chunkArray = (arr, size) =>
        arr.length > size
            ? [arr.slice(0, size), ...chunkArray(arr.slice(size), size)]
            : [arr];

    const batches = chunkArray(SOURCE_KEYS, CONCURRENCY_LIMIT);

    for (const batch of batches) {
        console.log(`Processing batch: ${batch.join(', ')}`);
        await Promise.all(batch.map(async (key) => {
            try {
                // 1. Fetch
                const items = await fetchSource(key);
                if (!items || items.length === 0) {
                    console.warn(`⚠️ No items found for ${key}. Skipping briefing.`);
                    return;
                }

                // 2. Map to data object
                if (key === 'hn') {
                    data.hnStories = items;
                } else {
                    data[key] = items;
                }

                // 3. Generate Briefing
                console.log(`> Generating briefing for ${key} (${items.length} items)...`);
                const briefing = await generateBriefing(key, items);
                if (briefing) {
                    data.briefings[key] = briefing;
                    console.log(`✓ Briefing created for ${key}`);
                } else {
                    console.warn(`⚠️ Briefing generation returned null for ${key}`);
                }
            } catch (e) {
                console.error(`Pipeline failed for ${key}:`, e.message);
            }
        }));
    }



    // 3. Generate Daily HTML
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dailyFilename = `${year}-${month}-${day}.html`;
    const dailyPath = path.join(DIST_DIR, dailyFilename);

    // Get History
    let historyFiles = fsNative.readdirSync(DIST_DIR).filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.html$/));
    // Sort descending
    historyFiles.sort().reverse();

    // Add today if not present (it will be created)
    if (!historyFiles.includes(dailyFilename)) {
        historyFiles.unshift(dailyFilename);
    }

    const htmlContent = generateHTML(data, historyFiles);
    fsNative.writeFileSync(dailyPath, htmlContent);
    console.log(`Generated ${dailyFilename}`);

    // Generate history.json (Source of truth for frontend)
    fsNative.writeFileSync(path.join(DIST_DIR, 'history.json'), JSON.stringify(historyFiles, null, 2));
    console.log('Generated history.json');

    // 4. Generate App Shell (index.html)
    // The shell points to the latest daily report
    const shellContent = generateShell(dailyFilename, historyFiles);
    fsNative.writeFileSync(path.join(DIST_DIR, 'index.html'), shellContent);
    console.log('Generated index.html');

    console.log('Build Complete.');
}

main().catch(console.error);
