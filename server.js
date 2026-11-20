const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { chromium } = require('playwright'); // 🚨 Import Playwright

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

const bypassHeaders = {
    "Referer": "https://www.miruro.cx/",
    "Origin": "https://www.miruro.cx",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

// ==========================================
// 1. AUTO-EXTRACT & PLAY ROUTE
// ==========================================
app.get('/', async (req, res) => {
    // 🚨 The specific Miruro link you requested
    const targetUrl = "https://www.miruro.cx/watch/o8FU9Se7l1zWPEIo28kel7S1tthb6ldF/one-piece?ep=1155"; 
    
    let extractedM3u8 = null;

    try {
        console.log("Launching hidden browser to extract video from Miruro...");
        
        // Launch headless browser
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: bypassHeaders["User-Agent"]
        });
        const page = await context.newPage();

        // Listen for the m3u8 network request
        page.on('request', request => {
            const url = request.url();
            if (url.includes('.m3u8') && !extractedM3u8) {
                console.log("🎯 Found M3U8:", url);
                extractedM3u8 = url;
            }
        });

        // Go to the page and wait for network to settle
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
        
        // Wait an extra 3 seconds in case the player takes a moment to fire the request
        await page.waitForTimeout(3000);

        await browser.close();

    } catch (error) {
        console.error("Browser Error:", error.message);
    }

    // If extraction failed, show an error
    if (!extractedM3u8) {
        return res.status(500).send("Could not find the M3U8 link. Miruro might be blocking the headless browser, or the link is invalid.");
    }

    // Send the HTML with the newly found link
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(extractedM3u8)}`;

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Auto-Extracted Stream</title>
            <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
            <style>
                body { background: #111; color: white; font-family: sans-serif; text-align: center; margin-top: 50px; }
                video { width: 80%; max-width: 800px; border-radius: 8px; background: black; }
                .success { color: #4ade80; word-break: break-all; font-size: 12px; margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <h1>One Piece - Episode 1155</h1>
            <p class="success">Successfully Extracted: ${extractedM3u8.substring(0, 100)}...</p>
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
// 2. MAGIC PROXY (Handles CORS + Streams)
// ==========================================
app.get('/api/proxy', async (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).send("URL required");

    try {
        const isM3u8 = videoUrl.includes('.m3u8');
        
        const response = await axios({
            method: 'GET',
            url: videoUrl,
            headers: bypassHeaders,
            // 🚨 Read m3u8 as text, read .ts chunks as stream
            responseType: isM3u8 ? 'text' : 'stream' 
        });

        if (isM3u8) {
            let m3u8Text = response.data;
            const baseUrl = new URL(videoUrl);
            
            // Rewrite internal links to go through our proxy
            m3u8Text = m3u8Text.split('\n').map(line => {
                line = line.trim();
                if (line && !line.startsWith('#')) {
                    const absoluteUrl = new URL(line, baseUrl).href;
                    return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
                }
                return line;
            }).join('\n');

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            return res.send(m3u8Text);
        }

        // Pipe the video chunks
        res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp2t');
        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }
        response.data.pipe(res);

    } catch (error) {
        console.error("Proxy Error on:", videoUrl);
        res.status(500).send("Proxy failed: " + error.message);
    }
});

app.listen(PORT, () => console.log(`Server running. Open http://localhost:${PORT} to test!`));
