require('dotenv').config();
const fsNative = require('fs');
const path = require('path');
const axios = require('axios');
const { fetchAllSources } = require('./src/fetchers');
const { generateHTML, generateShell } = require('./src/template');

// Ensure dist exists
const DIST_DIR = path.join(__dirname, 'dist');
if (!fsNative.existsSync(DIST_DIR)) {
    fsNative.mkdirSync(DIST_DIR, { recursive: true });
}

async function generateBriefing(category, items) {
    if (!items || items.length === 0) return null;

    // DeepSeek API or Gemini? Plan says DeepSeek in text, Google in deps.
    // Key available: DEEPSEEK_API_KEY.
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        console.warn('Skipping briefing: No DEEPSEEK_API_KEY');
        return null;
    }

    const titles = items.slice(0, 10).map(i => `- ${i.title} (${i.source})`).join('\n');
    const prompt = `
You are an AI News Editor. Summarize the following top stories for the category "${category}". 
For each story (or cluster of stories), provide a structured briefing:

1. **Title** (Translated to Chinese if needed)
2. **Technical Significance** (What is the technical breakthrough?)
3. **Why it matters** (Impact on the field or industry)

Format as Markdown bullet points. 
- Use Chinese for the content.
- Be concise and insight-driven.
- Filter out low-quality or irrelevant items (Critique: Only include items with high technical value).

Category: ${category}
Stories:
${titles}

Output directly in Markdown.
`;

    try {
        const response = await axios.post('https://api.deepseek.com/chat/completions', {
            model: "deepseek-reasoner", // User specified this model
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

    // 1. Fetch Data
    const data = await fetchAllSources();

    // 2. Generate Briefings
    data.briefings = {};
    const categories = ['hn', 'hfPapers', 'hfBlog', 'productHunt', 'reddit', 'youtube', 'researchBlogs'];
    // Map data keys
    const dataKeys = {
        'hn': data.hnStories,
        'hfPapers': data.hfPapers,
        'hfBlog': data.hfBlog,
        'productHunt': data.productHunt,
        'reddit': data.reddit,
        'youtube': data.youtube,
        'researchBlogs': data.researchBlogs
    };

    console.log('Generating briefings (parallel)...');

    // Launch all briefing requests in parallel
    const briefingPromises = categories.map(async (cat) => {
        console.log(`> Requesting briefing for ${cat}...`);
        try {
            const briefing = await generateBriefing(cat, dataKeys[cat]);
            return { cat, briefing };
        } catch (e) {
            console.error(`Error generating briefing for ${cat}:`, e.message);
            return { cat, briefing: null };
        }
    });

    // Await all results
    const results = await Promise.all(briefingPromises);

    // Store results
    for (const res of results) {
        if (res.briefing) {
            data.briefings[res.cat] = res.briefing;
            console.log(`✓ Received briefing for ${res.cat}`);
        }
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

    // 4. Generate App Shell (index.html)
    // The shell points to the latest daily report
    const shellContent = generateShell(dailyFilename, historyFiles);
    fsNative.writeFileSync(path.join(DIST_DIR, 'index.html'), shellContent);
    console.log('Generated index.html');

    console.log('Build Complete.');
}

main().catch(console.error);
