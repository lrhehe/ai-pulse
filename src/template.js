const { formatDistanceToNow } = require('date-fns');
const marked = require('marked');

// 1. App Shell Generator (The Main Host Page)
function generateShell(latestDate, history) {
    // history is array of filenames: ['2026-01-16.html', '2026-01-15.html', ...]

    const historyOptions = history.map(file => {
        const dateLabel = file.replace('.html', '');
        return `<option value="${file}">${dateLabel}</option>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Pulse | Daily Digest</title>
    <style>
        :root {
            --bg-color: #0f172a;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --accent-primary: #8b5cf6;
            --accent-secondary: #06b6d4;
            --gradient: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
        }
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-primary);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden; /* Main page doesn't scroll, iframe does */
        }

        header {
            background: rgba(15, 23, 42, 0.95);
            border-bottom: 1px solid rgba(255,255,255,0.1);
            padding: 1rem 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
            z-index: 100;
        }

        .header-left { display: flex; align-items: center; gap: 1rem; }

        .logo {
            font-size: 1.5rem;
            font-weight: 800;
            background: var(--gradient);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .history-select {
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.2);
            color: var(--text-primary);
            padding: 0.25rem 0.5rem;
            border-radius: 0.25rem;
            font-size: 0.875rem;
            cursor: pointer;
        }

        .timestamp { font-size: 0.875rem; color: var(--text-secondary); }

        iframe {
            flex-grow: 1;
            border: none;
            width: 100%;
            height: 100%;
        }
    </style>
</head>
<body>
    <header>
        <div class="header-left">
            <div class="logo">AI Pulse <span style="font-size:0.8em; font-weight:400; opacity:0.7">Shell</span></div>
            <select id="history-nav" class="history-select">
                ${historyOptions}
            </select>
        </div>
        <div class="timestamp">Browsing Archive</div>
    </header>

    <iframe id="content-frame" src="${latestDate}" title="Daily Report"></iframe>

    <script>
        const select = document.getElementById('history-nav');
        const iframe = document.getElementById('content-frame');

        // Set initial validation
        // (Optional: ensure 'latestDate' is selected if compatible)
        
        select.addEventListener('change', (e) => {
            iframe.src = e.target.value;
        });
    </script>
</body>
</html>`;
}


// 2. Daily Report Generator (The Content Pages)
function generateHTML(data, history = []) {
    const formatDate = (dateStr) => {
        try {
            return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
        } catch (e) {
            return 'Recently';
        }
    };

    const renderCard = (item, index) => {
        const isHighValue = (item.importance > 85);
        const rankBadge = isHighValue ? '<span class="badge fire">🔥 Hot</span>' : '';

        return `
        <a href="${item.link}" target="_blank" class="card fade-in" style="animation-delay: ${index * 30}ms">
            <div class="card-header">
                <div class="card-source">${item.source} ${rankBadge}</div>
                <div class="card-score" title="Importance Score">${Math.round(item.importance)}</div>
            </div>
            
            <div class="content-block">
                <h3 class="card-title">${item.title}</h3>
                ${item.title_zh && item.title_zh !== item.title ? `<h4 class="card-title-zh">${item.title_zh}</h4>` : ''}
            </div>

            <div class="card-meta">${formatDate(item.date)}</div>
            
            ${(item.snippet || item.snippet_zh) ? `
            <div class="snippet-block">
                ${item.snippet ? `<div class="card-snippet">${item.snippet.slice(0, 300) + (item.snippet.length > 300 ? '...' : '')}</div>` : ''}
                ${item.snippet_zh ? `<div class="card-snippet-zh">${item.snippet_zh.slice(0, 300) + (item.snippet_zh.length > 300 ? '...' : '')}</div>` : ''}
            </div>` : ''}
        </a>
    `};

    const renderSection = (title, items, id, url = null, briefing = null) => {
        let contentHTML = '';
        if (!items || items.length === 0) {
            contentHTML = `<div class="empty-state">No stories found for ${title} today.</div>`;
        } else {
            const visibleItems = items.slice(0, 20);
            contentHTML = `
            <div class="grid">
                ${visibleItems.map((item, i) => renderCard(item, i)).join('')}
            </div>`;
        }

        const titleContent = url ? `<a href="${url}" target="_blank" class="section-link">${title}</a>` : title;
        const briefingContent = briefing ? `
            <div class="category-briefing">
                ${marked.parse(briefing)}
            </div>
        ` : '';

        return `
        <section>
            <h2 class="section-header">${titleContent}</h2>
            ${briefingContent}
            ${contentHTML}
        </section>
        `;
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Daily Report</title>
    <style>
        :root {
            --bg-color: #0f172a;
            --card-bg: #1e293b;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --text-tertiary: #64748b;
            --accent-primary: #8b5cf6;
            --accent-secondary: #06b6d4;
            --fire-color: #f59e0b;
            --gradient: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            --tab-active-bg: rgba(139, 92, 246, 0.2);
            --tab-hover-bg: rgba(255, 255, 255, 0.05);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-primary);
            line-height: 1.6;
            padding-bottom: 3rem;
            /* Scrollbar for iframe content */
            overflow-y: auto; 
        }

        /* HEADER HIDDEN LOGIC */
        /* By default header is shown (direct visit), hidden if embedded */
        body.embedded header {
            display: none !important;
        }

        header {
            background: rgba(15, 23, 42, 0.95);
            backdrop-filter: blur(10px);
            border-bottom: 1px solid rgba(255,255,255,0.1);
            padding: 1.5rem 2rem;
            position: sticky;
            top: 0;
            z-index: 100;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .header-left { display: flex; align-items: center; gap: 1rem; }

        .logo {
            font-size: 1.5rem;
            font-weight: 800;
            background: var(--gradient);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .timestamp { font-size: 0.875rem; color: var(--text-secondary); }

        /* Category Briefing */
        .category-briefing {
            background: rgba(139, 92, 246, 0.05); /* Lighter bg */
            border: 1px solid rgba(139, 92, 246, 0.2);
            border-radius: 0.75rem;
            padding: 1.5rem;
            margin-bottom: 2rem;
            /* border-left: 4px solid var(--accent-primary); Removed for cleaner look */
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        
        .category-briefing h3 { 
            color: var(--accent-secondary); 
            margin-top: 1.5rem; 
            margin-bottom: 0.75rem; 
            font-size: 1.15rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            border-bottom: 1px dashed rgba(255,255,255,0.1);
            padding-bottom: 0.5rem;
        }
        .category-briefing h3:first-child { margin-top: 0; }
        
        .category-briefing p { 
            color: var(--text-secondary); 
            margin-bottom: 0.75rem; 
            line-height: 1.7;
        }
        
        .category-briefing strong { 
            color: var(--text-primary); 
            font-weight: 600;
        }

        .category-briefing ul {
            padding-left: 1.5rem;
            margin-bottom: 1rem;
            color: var(--text-secondary);
        }
        
        .category-briefing li { margin-bottom: 0.5rem; }

        .category-briefing hr {
            border: 0;
            height: 1px;
            background: rgba(255,255,255,0.1);
            margin: 1.5rem 0;
        }

        .tab-nav {
            display: flex;
            overflow-x: auto;
            gap: 0.5rem;
            padding: 1rem 2rem;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            scrollbar-width: none;
            background: var(--bg-color); 
            /* Sticky tabs under the (potentially hidden) header */
            position: sticky;
            top: 0; 
            z-index: 90;
        }
        body:not(.embedded) .tab-nav {
             top: 80px; /* Offset if header is present */
        }

        .tab-nav::-webkit-scrollbar { display: none; }

        .tab-btn {
            background: transparent;
            border: none;
            color: var(--text-secondary);
            padding: 0.5rem 1rem;
            border-radius: 2rem;
            cursor: pointer;
            white-space: nowrap;
            font-weight: 600;
            font-size: 0.9rem;
            transition: all 0.2s;
            border: 1px solid transparent;
        }

        .tab-btn:hover {
            color: var(--text-primary);
            background: var(--tab-hover-bg);
        }

        .tab-btn.active {
            color: #fff;
            background: var(--tab-active-bg);
            border-color: var(--accent-primary);
        }

        main {
            max-width: 1200px;
            margin: 2rem auto;
            padding: 0 1rem;
        }

        .tab-content { display: none; animation: fadeIn 0.3s ease-out; }
        .tab-content.active { display: block; }
        
        .section-header { display: none; }

        .grid { 
            display: grid; 
            gap: 1.5rem; 
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
        }

        .card {
            background: var(--card-bg);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 0.75rem;
            padding: 1.25rem;
            text-decoration: none;
            color: inherit;
            transition: all 0.2s;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            position: relative;
            overflow: hidden;
        }

        .card:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px -5px rgba(0,0,0,0.3);
            border-color: rgba(139, 92, 246, 0.3);
            background: #233045;
        }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
        }

        .card-source {
            font-size: 0.75rem;
            font-weight: 600;
            color: var(--accent-secondary);
            text-transform: uppercase;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .card-score {
            font-size: 0.75rem;
            font-weight: 700;
            color: var(--text-secondary);
            background: rgba(255,255,255,0.05);
            padding: 0.1rem 0.4rem;
            border-radius: 0.25rem;
        }

        .content-block { display: flex; flex-direction: column; gap: 0.25rem; }

        .card-title { font-size: 1rem; font-weight: 600; line-height: 1.4; color: var(--text-primary); }
        .card-title-zh { font-size: 0.95rem; font-weight: 400; color: var(--text-secondary); line-height: 1.5; }

        .card-meta { font-size: 0.75rem; color: var(--text-tertiary); margin-top: -0.25rem; }

        .snippet-block { 
            background: rgba(0,0,0,0.2); 
            padding: 0.75rem; 
            border-radius: 0.5rem; 
            border-left: 2px solid var(--text-tertiary);
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        .card-snippet { font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5; }
        .card-snippet-zh { font-size: 0.85rem; color: var(--text-tertiary); line-height: 1.5; font-style: italic; }

        .badge {
            padding: 0.1rem 0.3rem;
            border-radius: 0.2rem;
            font-size: 0.65rem;
            color: #fff;
        }
        .badge.fire { background: var(--fire-color); }

        .empty-state {
            text-align: center;
            padding: 3rem;
            color: var(--text-secondary);
            background: rgba(255,255,255,0.02);
            border-radius: 1rem;
        }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.5s ease-out backwards; }

        @media (max-width: 768px) {
            main { grid-template-columns: 1fr; }
            .tab-nav { padding: 1rem 1rem; }
        }
    </style>
</head>
<body>
    <!-- Header is present but may be hidden via JS class if embedded -->
    <header>
        <div class="header-left">
            <div class="logo">AI Pulse <span style="font-size:0.8em; font-weight:400; opacity:0.7">Report</span></div>
        </div>
        <div class="timestamp">Generated: ${new Date(data.timestamp).toLocaleString()}</div>
    </header>

    <nav class="tab-nav">
        <button class="tab-btn active" onclick="openTab('tab-hn')">Hacker News</button>
        <button class="tab-btn" onclick="openTab('tab-github')">GitHub Trending</button>
        <button class="tab-btn" onclick="openTab('tab-hfPapers')">HF Papers</button>
        <button class="tab-btn" onclick="openTab('tab-hfBlog')">HF Blog</button>
        <button class="tab-btn" onclick="openTab('tab-productHunt')">Product Hunt</button>
        <button class="tab-btn" onclick="openTab('tab-researchBlogs')">Research Blogs</button>
        <button class="tab-btn" onclick="openTab('tab-reddit')">Reddit</button>
        <button class="tab-btn" onclick="openTab('tab-youtube')">YouTube</button>
    </nav>

    <main>
        <div id="tab-hn" class="tab-content active">
            ${renderSection('Hacker News', data.hnStories, 'hn', 'https://news.ycombinator.com', data.briefings?.hn)}
        </div>

        <div id="tab-github" class="tab-content">
            ${renderSection('GitHub Trending', data.github, 'github', 'https://github.com/trending', data.briefings?.github)}
        </div>

        <div id="tab-hfPapers" class="tab-content">
            ${renderSection('Hugging Face Daily Papers', data.hfPapers, 'hfPapers', 'https://huggingface.co/papers', data.briefings?.hfPapers)}
        </div>

        <div id="tab-hfBlog" class="tab-content">
            ${renderSection('Hugging Face Blog', data.hfBlog, 'hfBlog', 'https://huggingface.co/blog', data.briefings?.hfBlog)}
        </div>

        <div id="tab-productHunt" class="tab-content">
            ${renderSection('Product Hunt', data.productHunt, 'productHunt', 'https://www.producthunt.com/topics/artificial-intelligence', data.briefings?.productHunt)}
        </div>

         <div id="tab-researchBlogs" class="tab-content">
            ${renderSection('Industry Research Blogs', data.researchBlogs, 'researchBlogs', null, data.briefings?.researchBlogs)}
        </div>

        <div id="tab-reddit" class="tab-content">
            ${renderSection('Reddit', data.reddit, 'reddit', 'https://www.reddit.com', data.briefings?.reddit)}
        </div>

        <div id="tab-youtube" class="tab-content">
            ${renderSection('YouTube', data.youtube, 'youtube', 'https://www.youtube.com', data.briefings?.youtube)}
        </div>
    </main>

    <script>
        // Start Embedded Mode Check
        if (window.self !== window.top) {
            document.body.classList.add('embedded');
        }

        // Tab Logic
        function openTab(tabId) {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            const buttons = document.querySelectorAll('.tab-btn');
            buttons.forEach(btn => {
                if (btn.getAttribute('onclick').includes(tabId)) {
                    btn.classList.add('active');
                }
            });
            // Scroll to top when switching tabs
            window.scrollTo(0, 0);
        }
    </script>
</body>
</html>`;
}

module.exports = { generateHTML, generateShell };
