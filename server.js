const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const JIKAN_API_URL = "https://api.jikan.moe/v4";
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// 1. SEARCH (Powered by Jikan)
// ==========================================
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Search query required" });

  try {
    await sleep(1000); // Delay to prevent rate limit
    const response = await axios.get(`${JIKAN_API_URL}/anime`, {
      params: { q: query, limit: 20, sfw: true }
    });
    
    const formatted = response.data.data.map((item) => ({
      id: item.mal_id,
      idMal: item.mal_id,
      title: { romaji: item.title, english: item.title_english || item.title },
      coverImage: { large: item.images.webp.large_image_url || item.images.jpg.large_image_url },
      averageScore: item.score ? Math.round(item.score * 10) : null,
      format: item.type,
      episodes: item.episodes || 0
    }));
    
    res.json(formatted);
  } catch (error) {
    console.error("Search Error:", error.message);
    res.status(500).json({ error: "Search failed", details: error.message });
  }
});

// ==========================================
// 2. TRENDING (Powered by Jikan)
// ==========================================
app.get('/api/trending', async (req, res) => {
  try {
    await sleep(1000); // Delay to prevent rate limit
    const response = await axios.get(`${JIKAN_API_URL}/top/anime`, {
      params: { filter: 'airing', limit: 20 }
    });
    
    const formatted = response.data.data.map((item) => ({
      id: item.mal_id,
      idMal: item.mal_id,
      title: { romaji: item.title, english: item.title_english || item.title },
      coverImage: { large: item.images.webp.large_image_url || item.images.jpg.large_image_url },
      averageScore: item.score ? Math.round(item.score * 10) : null,
      format: item.type,
      episodes: item.episodes || 0
    }));
    
    res.json(formatted);
  } catch (error) {
    console.error("Trending Error:", error.message);
    res.status(500).json({ error: "Trending failed", details: error.message });
  }
});

// ==========================================
// 3. DETAILS + EPISODES + CHARACTERS + RELATIONS
// ==========================================
app.get('/api/anime/:id', async (req, res) => {
  const malId = req.params.id;

  try {
    await sleep(1000); 
    // Fetch full details (includes characters and relations)
    const animeRes = await axios.get(`${JIKAN_API_URL}/anime/${malId}/full`);
    const anime = animeRes.data.data;

    let episodes = [];
    try {
      await sleep(800); // Small delay between calls
      const epRes = await axios.get(`${JIKAN_API_URL}/anime/${malId}/episodes`);
      if (epRes.data.data) {
        episodes = epRes.data.data.map((ep) => ({
          number: ep.mal_id,
          title: ep.title || `Episode ${ep.mal_id}`,
          thumbnail: "",
          description: "",
          available: true
        }));
      }
    } catch (e) {
      console.log("Episode list failed, using count fallback.");
    }

    // Fallback if episode list fails
    if (episodes.length === 0 && anime.episodes) {
      for (let i = 1; i <= anime.episodes; i++) {
        episodes.push({ number: i, title: `Episode ${i}`, thumbnail: "", description: "", available: true });
      }
    }

    const finalData = {
      id: anime.mal_id,
      idMal: anime.mal_id,
      title: { romaji: anime.title, english: anime.title_english || anime.title },
      coverImage: { 
        large: anime.images.webp.large_image_url || anime.images.jpg.large_image_url, 
        extraLarge: anime.images.webp.large_image_url || anime.images.jpg.large_image_url 
      },
      bannerImage: "", 
      description: anime.synopsis || "No description available.",
      averageScore: anime.score ? Math.round(anime.score * 10) : null,
      genres: anime.genres?.map((g) => g.name) || [],
      episodes: episodes,
      status: anime.status,
      format: anime.type,
      characters: anime.characters || [],
      relations: anime.relations || []
    };

    res.json(finalData);
  } catch (error) {
    console.error("Details Error:", error.message);
    res.status(500).json({ error: "Details failed", details: error.message });
  }
});

app.get('/', (req, res) => {
  res.send('AniLumoS Backend is running!');
});

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
