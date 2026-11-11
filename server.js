const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const ANILIST_URL = "https://graphql.anilist.co";

// 🚨 Add headers to prevent AniList from blocking the request
const axiosConfig = {
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
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
    const response = await axios.post(ANILIST_URL, { query: gql, variables: { search: query } }, axiosConfig);
    res.json(formatAniList(response.data.data.Page.media));
  } catch (error) {
    console.error("Search Error:", error.message);
    res.status(500).json({ error: "Search failed", details: error.message });
  }
});

// ==========================================
// 2. TRENDING
// ==========================================
app.get('/api/trending', async (req, res) => {
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
    const response = await axios.post(ANILIST_URL, { query: gql }, axiosConfig);
    res.json(formatAniList(response.data.data.Page.media));
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
    const response = await axios.post(ANILIST_URL, { query: gql, variables: { id: parseInt(anilistId) } }, axiosConfig);
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

    res.json({
      ...animeData,
      episodes: episodes
    });

  } catch (error) {
    console.error("Details Error:", error.message);
    res.status(500).json({ error: "Details failed", details: error.message });
  }
});

app.get('/', (req, res) => res.send('AniLumoS Backend is running!'));
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
