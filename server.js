const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ==========================================
// HELPERS & CACHE
// ==========================================
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const cache = {
  trending: { data: null, timestamp: 0 },
  search: {},
  details: {},
};

const CACHE_TTL = 5 * 60 * 1000; 

const formatAniListData = (data) => {
  return data.map((item) => ({
    id: item.id,
    idMal: item.idMal,
    title: { romaji: item.title.romaji, english: item.title.english || item.title.romaji },
    coverImage: { large: item.coverImage.large },
    averageScore: item.averageScore,
    format: item.format,
    episodes: item.episodes || 0
  }));
};

// ==========================================
// 1. SEARCH (Powered by AniList)
// ==========================================
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Search query required" });

  const cached = cache.search[query];
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log(`[Cache Hit] Search: ${query}`);
    return res.json(cached.data);
  }

  const graphqlQuery = `
    query ($search: String) {
      Page(page: 1, perPage: 20) {
        media(search: $search, type: ANIME) {
          id
          idMal
          title { romaji english }
          coverImage { large }
          averageScore
          format
          episodes
        }
      }
    }
  `;

  try {
    await sleep(2000); 
    const response = await axios.post("https://graphql.anilist.co", {
      query: graphqlQuery,
      variables: { search: query },
    });
    
    const formatted = formatAniListData(response.data.data.Page.media);
    cache.search[query] = { data: formatted, timestamp: Date.now() };
    
    res.json(formatted);
  } catch (error) {
    console.error("Search Error:", error.message);
    // 🚨 Send the exact error back to the app
    res.status(500).json({ error: "Search failed", details: error.message });
  }
});

// ==========================================
// 2. TRENDING (Powered by AniList)
// ==========================================
app.get('/api/trending', async (req, res) => {
  if (cache.trending.data && (Date.now() - cache.trending.timestamp < CACHE_TTL)) {
    console.log(`[Cache Hit] Trending`);
    return res.json(cache.trending.data);
  }

  const query = `
    query {
      Page(page: 1, perPage: 20) {
        media(sort: TRENDING_DESC, type: ANIME) {
          id
          idMal
          title { romaji english }
          coverImage { large }
          averageScore
          format
          episodes
        }
      }
    }
  `;

  try {
    await sleep(2000); 
    const response = await axios.post("https://graphql.anilist.co", { query });
    const formatted = formatAniListData(response.data.data.Page.media);
    cache.trending = { data: formatted, timestamp: Date.now() };
    res.json(formatted);
  } catch (error) {
    console.error("Trending Error:", error.message);
    // 🚨 Send the exact error back to the app
    res.status(500).json({ error: "Trending failed", details: error.message });
  }
});

// ==========================================
// 3. DETAILS + EPISODES (Powered by MAL)
// ==========================================
app.get('/api/anime/:id', async (req, res) => {
  const anilistId = req.params.id;

  const cached = cache.details[anilistId];
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log(`[Cache Hit] Details: ${anilistId}`);
    return res.json(cached.data);
  }

  try {
    const anilistQuery = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          id
          idMal
          title { romaji english }
          coverImage { large extraLarge }
          bannerImage
          description
          averageScore
          genres
          episodes
          status
          format
        }
      }
    `;
    
    await sleep(2000); 
    const anilistRes = await axios.post("https://graphql.anilist.co", { query: anilistQuery, variables: { id: parseInt(anilistId) } });
    const animeData = anilistRes.data.data.Media;

    if (!animeData || !animeData.idMal) {
      return res.status(404).json({ error: "MAL ID not found for this anime." });
    }

    let episodes = [];
    try {
      const jikanRes = await axios.get(`https://api.jikan.moe/v4/anime/${animeData.idMal}/episodes`);
      if (jikanRes.data.data) {
        episodes = jikanRes.data.data.map((ep) => ({
          number: ep.mal_id,
          title: ep.title || `Episode ${ep.mal_id}`,
          thumbnail: "",
          description: "",
          available: true
        }));
      }
    } catch (e) {
      console.log("Jikan failed:", e.message);
    }

    if (episodes.length === 0 && animeData.episodes) {
      for (let i = 1; i <= animeData.episodes; i++) {
        episodes.push({ number: i, title: `Episode ${i}`, thumbnail: "", description: "", available: true });
      }
    }

    const finalData = {
      ...animeData,
      episodes: episodes
    };

    cache.details[anilistId] = { data: finalData, timestamp: Date.now() };
    res.json(finalData);

  } catch (error) {
    console.error("Details Error:", error.message);
    // 🚨 Send the exact error back to the app
    res.status(500).json({ error: "Details failed", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
