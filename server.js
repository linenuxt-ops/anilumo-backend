const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const ANILIST_URL = "https://graphql.anilist.co";

// 🚨 1. Add a Sleep function to delay requests
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 🚨 2. Add a Cache to store results
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getFromCache = (key) => {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  return item.data;
};

const saveToCache = (key, data) => {
  cache.set(key, { data: data, expiresAt: Date.now() + CACHE_TTL });
};

const formatAniList = (data) => {
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
// 1. SEARCH
// ==========================================
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Query required" });

  // Check Cache
  const cacheKey = `search:${query.toLowerCase()}`;
  const cachedData = getFromCache(cacheKey);
  if (cachedData) {
    console.log(`[Cache Hit] Search: ${query}`);
    return res.json(cachedData);
  }

  const gql = `
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
    console.log(`[Cache Miss] Searching AniList for: ${query}`);
    await sleep(2000); // 🚨 Wait 2 seconds to avoid rate limit
    const response = await axios.post(ANILIST_URL, { query: gql, variables: { search: query } });
    
    const formatted = formatAniList(response.data.data.Page.media);
    saveToCache(cacheKey, formatted);
    res.json(formatted);
  } catch (error) {
    console.error("Search Error:", error.message);
    res.status(500).json({ error: "Search failed", details: error.message });
  }
});

// ==========================================
// 2. TRENDING
// ==========================================
app.get('/api/trending', async (req, res) => {
  const cacheKey = 'trending:airing';
  const cachedData = getFromCache(cacheKey);
  if (cachedData) {
    console.log(`[Cache Hit] Trending`);
    return res.json(cachedData);
  }

  const gql = `
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
    console.log(`[Cache Miss] Fetching Trending from AniList`);
    await sleep(2000); // 🚨 Wait 2 seconds to avoid rate limit
    const response = await axios.post(ANILIST_URL, { query: gql });
    
    const formatted = formatAniList(response.data.data.Page.media);
    saveToCache(cacheKey, formatted);
    res.json(formatted);
  } catch (error) {
    console.error("Trending Error:", error.message);
    res.status(500).json({ error: "Trending failed", details: error.message });
  }
});

// ==========================================
// 3. DETAILS + EPISODES
// ==========================================
app.get('/api/anime/:id', async (req, res) => {
  const anilistId = req.params.id;
  const cacheKey = `anime:${anilistId}`;
  
  const cachedData = getFromCache(cacheKey);
  if (cachedData) {
    console.log(`[Cache Hit] Details: ${anilistId}`);
    return res.json(cachedData);
  }

  const gql = `
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
        relations {
          edges {
            relationType
            node { id title { romaji english } coverImage { large } format }
          }
        }
        streamingEpisodes { title thumbnail url }
        characters(perPage: 12, sort: [ROLE, RELEVANCE, ID]) {
          edges {
            role
            node { id name { full } image { large } }
            voiceActors(language: JAPANESE) { id name { full } image { large } }
          }
        }
        recommendations(perPage: 12, sort: RATING_DESC) {
          nodes {
            mediaRecommendation { id title { romaji english } coverImage { large } averageScore format episodes }
          }
        }
      }
    }
  `;

  try {
    console.log(`[Cache Miss] Fetching Details for ID: ${anilistId}`);
    await sleep(2000); // 🚨 Wait 2 seconds to avoid rate limit
    const response = await axios.post(ANILIST_URL, { query: gql, variables: { id: parseInt(anilistId) } });
    const animeData = response.data.data.Media;

    if (!animeData) {
      return res.status(404).json({ error: "Anime not found." });
    }

    let episodes = [];
    const streamingData = animeData.streamingEpisodes || [];

    if (streamingData.length > 0) {
      episodes = streamingData.map((ep, index) => ({
        number: index + 1,
        title: ep.title?.replace(/^Episode \d+ - /i, '') || `Episode ${index + 1}`,
        thumbnail: ep.thumbnail || "",
        description: "",
        available: true
      }));
    } else if (animeData.episodes > 0) {
      for (let i = 1; i <= animeData.episodes; i++) {
        episodes.push({ number: i, title: `Episode ${i}`, thumbnail: "", description: "", available: true });
      }
    }

    const finalData = { ...animeData, episodes: episodes };
    saveToCache(cacheKey, finalData);
    res.json(finalData);

  } catch (error) {
    console.error("Details Error:", error.message);
    res.status(500).json({ error: "Details failed", details: error.message });
  }
});

app.get('/', (req, res) => res.send('AniLumoS Backend is running!'));
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
