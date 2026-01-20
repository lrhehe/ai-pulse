const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { format } = require('date-fns');
const axios = require('axios');
const { fetchAllSources } = require('./fetchers');
const { generateHTML, generateShell } = require('./template');

// Function to generate AI Briefing for a specific category
async function generateCategoryBriefing(categoryName, items) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        console.warn('DEEPSEEK_API_KEY not found. Skipping Briefing.');
        return null;
    }

    if (!items || items.length === 0) return null;

    try {
        // Construct context from top 5 items
        let context = `Here are the top stories for ${categoryName}:\n\n`;
        items.slice(0, 5).forEach((item, i) => {
            context += `${i + 1}. ${item.title}: ${item.snippet || 'No details'}\n`;
        });

        const prompt = `
        You are an expert AI news analyst.
        Based on the following news items for **${categoryName}**, generate a concise summary.
        
        Guidelines:
        - Provide the summary in **both English and Chinese**.
        - Structure it as:
          ### 🇺🇸 English Summary
          (English content)
          
          ### 🇨🇳 中文摘要
          (Chinese content)
          
        - Focus on the key trends or most interesting updates in this specific category.
        - Use bolding for key terms.
        - Keep it under 200 words total.
        - Do not include links.
        - Start directly with the headers.
        
        News Items:
        ${context}
        `;

        console.log(`Generating Briefing for ${categoryName}...`);

        const response = await axios.post('https://api.deepseek.com/chat/completions', {
            model: "deepseek-reasoner",
            messages: [
                { role: "system", content: "You are a helpful assistant." },
                { role: "user", content: prompt }
            ],
            stream: false
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            }
        });

        return response.data.choices[0].message.content;

    } catch (error) {
        console.error(`Error generating briefing for ${categoryName}:`, error.message);
        return null;
    }
}

async function build() {
    try {
        console.log('Starting AI Pulse daily build...');

        // 1. Fetch Data
        const data = await fetchAllSources();

        // 2. Generate Briefings per Category
        data.briefings = {};

        const briefingPromises = [
            generateCategoryBriefing('Hacker News', data.hnStories).then(res => data.briefings.hn = res),
            generateCategoryBriefing('Hugging Face Papers', data.hfPapers).then(res => data.briefings.hfPapers = res),
            generateCategoryBriefing('Hugging Face Blog', data.hfBlog).then(res => data.briefings.hfBlog = res),
            generateCategoryBriefing('Product Hunt', data.productHunt).then(res => data.briefings.productHunt = res),
            generateCategoryBriefing('Reddit', data.reddit).then(res => data.briefings.reddit = res),
            generateCategoryBriefing('YouTube', data.youtube).then(res => data.briefings.youtube = res)
        ];

        await Promise.all(briefingPromises);

        // 3. Prepare Output Paths
        const distDir = path.join(__dirname, '../dist');
        if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir);
        }

        const today = new Date();
        const dailyFilename = `${format(today, 'yyyy-MM-dd')}.html`;
        const dailyPath = path.join(distDir, dailyFilename);
        const indexPath = path.join(distDir, 'index.html');

        // Add filename to data for template context
        data.filename = dailyFilename;

        // 4. Scan History (Server-side)
        const history = fs.readdirSync(distDir)
            .filter(file => file.match(/^\d{4}-\d{2}-\d{2}\.html$/))
            .sort()
            .reverse();

        // Add today if not already there
        if (!history.includes(dailyFilename)) {
            history.unshift(dailyFilename);
        }

        // Save History JSON (Backup)
        try {
            fs.writeFileSync(path.join(distDir, 'history.json'), JSON.stringify(history, null, 2));
        } catch (e) {
            console.error('Failed to save history.json:', e);
        }

        // 5. Generate Content HTML (Daily Report)
        console.log('Generating Daily Content HTML...');
        // Pass empty history, as individual pages don't need the nav selector anymore (Shell handles it)
        const contentHtml = generateHTML(data, []);
        fs.writeFileSync(dailyPath, contentHtml);
        console.log(`Saved daily content: ${dailyPath}`);

        // 6. Generate Shell HTML (Index)
        console.log('Generating App Shell...');
        // The shell gets the latest filename (today's) and the full history list
        const shellHtml = generateShell(dailyFilename, history);
        fs.writeFileSync(indexPath, shellHtml);
        console.log(`Updated App Shell (Index): ${indexPath}`);

        console.log('Build complete!');

    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

build();
