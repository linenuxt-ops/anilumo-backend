const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// 🚨 Headers to bypass the 403 (Hotlink protection)
const bypassHeaders = {
    "Referer": "https://www.miruro.cx/",
    "Origin": "https://www.miruro.cx",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

// ==========================================
// 1. LIVE TEST PLAYER (Open http://localhost:3000/ in browser)
// ==========================================
app.get('/', (req, res) => {
    // Paste your real extracted .m3u8 link here to test
    const testUrl = "https://calmgrove.crystal-61.top/m/YOUR_EXTRACTED_LINK_HERE.m3u8"; 
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(testUrl)}`;

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Video Proxy Test</title>
            <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
            <style>
                body { background: #111; color: white; font-family: sans-serif; text-align: center; margin-top: 50px; }
                video { width: 80%; max-width: 800px; border-radius: 8px; background: black; }
            </style>
        </head>
        <body>
            <h1>WebView / Browser Test Player</h1>
            <p>If the video plays here, your API works perfectly.</p>
            <video id="video" controls autoplay></video>
            <script>
                const video = document.getElementById('video');
                const videoSrc = "${proxyUrl}";

                if (Hls.isSupported()) {
                    const hls = new Hls();
                    hls.loadSource(videoSrc);
                    hls.attachMedia(video);
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = videoSrc;
                }
            </script>
        </body>
        </html>
    `);
});

// ==========================================
// 2. MAGIC PROXY (Handles CORS + Rewrites m3u8)
// ==========================================
app.get('/api/proxy', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).send("URL required");

    try {
        const response = await axios({
            method: 'GET',
            url: videoUrl,
            headers: bypassHeaders,
            responseType: 'text' // Get as text so we can rewrite if it's an m3u8
        });

        // If the server returns an m3u8 file, we need to rewrite its internal links!
        if (videoUrl.includes('.m3u8') || response.headers['content-type']?.includes('mpegurl')) {
            let m3u8Text = response.data;
            
            // Rewrite all http/https links inside the m3u8 to go through our proxy
            const baseUrl = new URL(videoUrl);
            m3u8Text = m3u8Text.split('\n').map(line => {
                line = line.trim();
                if (line && !line.startsWith('#')) {
                    // Handle relative and absolute URLs inside the m3u8
                    const absoluteUrl = new URL(line, baseUrl).href;
                    return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
                }
                return line;
            }).join('\n');

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            return res.send(m3u8Text);
        }

        // If it's a video chunk (.ts), we just send it back as a binary stream
        res.setHeader('Content-Type', response.headers['content-type']);
        res.send(response.data);

    } catch (error) {
        console.error("Proxy Error on:", videoUrl);
        res.status(500).send("Proxy failed: " + error.message);
    }
});

app.listen(PORT, () => console.log(`Server running. Open http://localhost:${PORT} to test!`));
