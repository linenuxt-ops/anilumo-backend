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

// A simple in-memory cache (resets when Render restarts)
const cache = {
  trending: { data: null, timestamp: 0 },
  search: {}, // Stores results keyed by search query
  details: {}, // Stores results keyed by anime ID
};

// Cache duration: 5 minutes (in milliseconds)
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

  // 🚨 Check Cache
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
    await sleep(2000); // 🚨 Delay to prevent 429
    const response = await axios.post("https://graphql.anilist.co", {
      query: graphqlQuery,
      variables: { search: query },
    });
    
    const formatted = formatAniListData(response.data.data.Page.media);
    
    // Save to Cache
    cache.search[query] = { data: formatted, timestamp: Date.now() };
    
    res.json(formatted);
  } catch (error) {
    console.error("Search Error:", error.message);
    res.status(500).json({ error: "Search failed" });
  }
});

// ==========================================
// 2. TRENDING (Powered by AniList)
// ==========================================
app.get('/api/trending', async (req, res) => {
  // 🚨 Check Cache
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
    await sleep(2000); // 🚨 Delay to prevent 429
    const response = await axios.post("https://graphql.anilist.co", { query });
    
    const formatted = formatAniListData(response.data.data.Page.media);
    
    // Save to Cache
    cache.trending = { data: formatted, timestamp: Date.now() };
    
    res.json(formatted);
  } catch (error) {
    console.error("Trending Error:", error.message);
    res.status(500).json({ error: "Trending failed" });
  }
});

// ==========================================
// 3. DETAILS + EPISODES (Powered by MAL)
// ==========================================
app.get('/api/anime/:id', async (req, res) => {
  const anilistId = req.params.id;

  // 🚨 Check Cache
  const cached = cache.details[anilistId];
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log(`[Cache Hit] Details: ${anilistId}`);
    return res.json(cached.data);
  }

  try {
    // Step A: Get the MAL ID from AniList
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
    
    await sleep(2000); // 🚨 Delay to prevent 429
    const anilistRes = await axios.post("https://graphql.anilist.co", { query: anilistQuery, variables: { id: parseInt(anilistId) } });
    const animeData = anilistRes.data.data.Media;

    if (!animeData || !animeData.idMal) {
      return res.status(404).json({ error: "MAL ID not found for this anime." });
    }

    // Step B: Get Episodes from MAL (via Jikan for titles)
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
      console.log("Jikan failed, falling back to MAL count.");
    }

    // Step C: If Jikan failed, generate list from MAL count
    if (episodes.length === 0 && animeData.episodes) {
      for (let i = 1; i <= animeData.episodes; i++) {
        episodes.push({ number: i, title: `Episode ${i}`, thumbnail: "", description: "", available: true });
      }
    }

    // Step D: Return merged data
    const finalData = {
      ...animeData,
      episodes: episodes
    };

    // Save to Cache
    cache.details[anilistId] = { data: finalData, timestamp: Date.now() };

    res.json(finalData);

  } catch (error) {
    console.error("Details Error:", error.message);
    res.status(500).json({ error: "Details failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
