const axios = require('axios');
const Parser = require('rss-parser');
const cheerio = require('cheerio');

const parser = new Parser();

const HN_KEYWORDS = ['AI', 'LLM', 'GPT', 'Deep Learning', 'Machine Learning', 'Transformer', 'Neural Network', 'OpenAI', 'Anthropic', 'Gemini', 'Llama', 'Mistral'];

const RSS_FEEDS = {
    hfPapers: [
        { name: 'Hugging Face Daily Papers', url: 'https://papers.takara.ai/api/feed', baseScore: 90 }
    ],
    hfBlog: [
        { name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', baseScore: 85 }
    ],
    productHunt: [
        { name: 'Product Hunt AI', url: 'https://www.producthunt.com/feed?category=ai', baseScore: 75 }
    ],
    reddit: [
        { name: 'r/LocalLLaMA', url: 'https://www.reddit.com/r/LocalLLaMA/top/.rss?t=day', baseScore: 80 },
        { name: 'r/ChatGPT', url: 'https://www.reddit.com/r/ChatGPT/top/.rss?t=day', baseScore: 70 }
    ],
    youtube: [
        { name: 'Two Minute Papers', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCbfYPyITQ-7l4upoX8nvctg', baseScore: 85 },
        { name: 'DeepMind', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCP7jMXSY2xbc3KCAE0MHQ-A', baseScore: 88 },
        { name: 'OpenAI', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCvJJ_dzjViJCoLf5uKUTwoA', baseScore: 95 }
    ],
    // New Category: Industry Research Blogs
    researchBlogs: [
        { name: 'OpenAI Blog', url: 'https://openai.com/blog/rss.xml', baseScore: 95 },
        { name: 'AWS Machine Learning', url: 'https://aws.amazon.com/blogs/machine-learning/feed/', baseScore: 90 },
        { name: 'Microsoft Research', url: 'https://www.microsoft.com/en-us/research/feed/', baseScore: 90 }
    ]
};

// Helper: Translate text to Chinese using DeepSeek
async function translateText(text) {
    if (!text) return '';

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return text;

    try {
        const response = await axios.post('https://api.deepseek.com/chat/completions', {
            model: "deepseek-chat",
            messages: [
                { role: "system", content: "You are a professional technical translator. Translate the following text to Simplified Chinese. Keep technical terms accurate (e.g., LLM, Transformer, Agent). Return ONLY the translated text, no explanations." },
                { role: "user", content: text }
            ],
            stream: false
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        return response.data.choices[0].message.content.trim();
    } catch (e) {
        // Fallback to original text on error
        return text;
    }
}

// Helper: Retry wrapper
async function fetchWithRetry(url, options = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await axios.get(url, { ...options, timeout: 10000 });
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(`Retrying ${url} (${i + 1}/${retries})...`);
            await new Promise(res => setTimeout(res, 1000 * (i + 1)));
        }
    }
}

// Helper: Scrape Meta Description
async function getLinkPreview(url) {
    try {
        const { data } = await axios.get(url, {
            timeout: 3000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36' }
        });
        const $ = cheerio.load(data);
        const metaDesc = $('meta[name="description"]').attr('content') ||
            $('meta[property="og:description"]').attr('content') ||
            '';
        return metaDesc.slice(0, 300);
    } catch (e) {
        return '';
    }
}

async function fetchHackerNews() {
    try {
        const { data: topStories } = await fetchWithRetry('https://hacker-news.firebaseio.com/v0/topstories.json');
        const limitedStories = topStories.slice(0, 100);

        const storyPromises = limitedStories.map(id =>
            fetchWithRetry(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(res => res.data)
        );

        const stories = await Promise.all(storyPromises);

        const relevantStories = stories
            .filter(story => story && story.title && HN_KEYWORDS.some(keyword => story.title.toLowerCase().includes(keyword.toLowerCase())))
            .slice(0, 20);

        const enriched = await Promise.all(relevantStories.map(async (story) => {
            const link = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
            let snippet = '';

            if (story.url) {
                snippet = await getLinkPreview(story.url);
            }

            return {
                title: story.title,
                title_zh: await translateText(story.title),
                link: link,
                source: 'Hacker News',
                date: new Date(story.time * 1000).toISOString(),
                score: story.score || 0,
                descendants: story.descendants || 0,
                // Importance score: Score + (Comments * 2)
                importance: Math.min((story.score || 0) + ((story.descendants || 0) * 2), 100),
                snippet: snippet,
                snippet_zh: await translateText(snippet)
            };
        }));

        return enriched;
    } catch (error) {
        console.error('Error fetching Hacker News:', error.message);
        return [];
    }
}

async function fetchRSS(feedUrl, sourceName, baseScore) {
    try {
        const { data: xmlData } = await fetchWithRetry(feedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
                'Accept': 'application/rss+xml, application/xml, text/xml; q=0.1'
            }
        });

        const feed = await parser.parseString(xmlData);
        // Filter by keywords if description or title contains AI terms
        // We reuse HN_KEYWORDS for general AI filtering if needed, or specific ones.
        // For now, let's use HN_KEYWORDS as a broad filter.
        const topItems = feed.items.filter(item => {
            const text = (item.title + ' ' + (item.contentSnippet || '')).toLowerCase();
            return HN_KEYWORDS.some(k => text.includes(k.toLowerCase()));
        }).slice(0, 20);

        const enrichedItems = await Promise.all(topItems.map(async (item, index) => {
            let cleanSnippet = '';

            if (item.content) {
                const $ = cheerio.load(item.content);
                cleanSnippet = $('p').first().text().trim();

                if (!cleanSnippet) {
                    cleanSnippet = $.text().replace(/Discussion\s*\|\s*Link/gi, '').trim();
                }
            }

            if (!cleanSnippet && item.contentSnippet) {
                cleanSnippet = item.contentSnippet.replace(/Discussion\s*\|\s*Link/gi, '').trim();
            }

            cleanSnippet = cleanSnippet.replace(/!\[.*?\]\(.*?\)/g, '');
            cleanSnippet = cleanSnippet.slice(0, 300).trim();

            return {
                title: item.title,
                title_zh: await translateText(item.title),
                link: item.link,
                source: sourceName,
                date: item.pubDate || item.isoDate,
                snippet: cleanSnippet,
                snippet_zh: await translateText(cleanSnippet),
                importance: Math.max(baseScore - (index * 3), 10)
            };
        }));

        return enrichedItems;
    } catch (error) {
        console.error(`Error fetching RSS ${sourceName}: ${error.message}`);
        return [];
    }
}

async function fetchAllSources() {
    console.log('Fetching Hacker News...');
    const hnStories = await fetchHackerNews();

    const fetchCategory = async (categoryKey) => {
        if (!RSS_FEEDS[categoryKey]) return [];
        const results = await Promise.all(
            RSS_FEEDS[categoryKey].map(feed => fetchRSS(feed.url, feed.name, feed.baseScore))
        );
        return results.flat();
    };

    console.log('Fetching HF Papers...');
    const hfPapers = await fetchCategory('hfPapers');

    console.log('Fetching HF Blog...');
    const hfBlog = await fetchCategory('hfBlog');

    console.log('Fetching Product Hunt...');
    const productHunt = await fetchCategory('productHunt');

    console.log('Fetching Reddit...');
    const reddit = await fetchCategory('reddit');

    console.log('Fetching YouTube...');
    const youtube = await fetchCategory('youtube');

    console.log('Fetching Research Blogs...');
    const researchBlogs = await fetchCategory('researchBlogs');

    return {
        timestamp: new Date().toISOString(),
        hnStories,
        hfPapers,
        hfBlog,
        productHunt,
        reddit,
        youtube,
        researchBlogs
    };
}

module.exports = { fetchAllSources };
