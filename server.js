const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 🚨 Helper function to format MAL data into the structure your app expects
const formatMALData = (data) => {
  return data.map((item) => ({
    id: item.node.id,
    title: { 
      romaji: item.node.title, 
      english: item.node.title 
    },
    coverImage: { 
      large: item.node.main_picture?.large || "" 
    },
    averageScore: item.node.mean ? Math.round(item.node.mean * 10) : null,
    format: item.node.media_type || "UNKNOWN",
    episodes: item.node.num_episodes || 0
  }));
};

// 1. Root Route (Health Check)
app.get('/', (req, res) => {
  res.send('AniLumoS Backend is running!');
});

// 2. Search Route
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Search query required" });

  try {
    const response = await axios.get(`https://api.myanimelist.net/v2/anime`, {
      params: {
        q: query,
        limit: 20,
        fields: 'id,title,main_picture,mean,media_type,num_episodes'
      },
      headers: { 'X-MAL-CLIENT-ID': process.env.MAL_CLIENT_ID }
    });
    res.json(formatMALData(response.data.data));
  } catch (error) {
    console.error("Search Error:", error.message);
    res.status(500).json({ error: "Search failed" });
  }
});

// 3. Trending Route
app.get('/api/trending', async (req, res) => {
  try {
    const response = await axios.get(`https://api.myanimelist.net/v2/anime/ranking`, {
      params: {
        ranking_type: 'airing',
        limit: 20,
        fields: 'id,title,main_picture,mean,media_type,num_episodes'
      },
      headers: { 'X-MAL-CLIENT-ID': process.env.MAL_CLIENT_ID }
    });
    res.json(formatMALData(response.data.data));
  } catch (error) {
    console.error("Trending Error:", error.message);
    res.status(500).json({ error: "Trending failed" });
  }
});

// 4. Details Route
app.get('/api/anime/:id', async (req, res) => {
  try {
    const response = await axios.get(`https://api.myanimelist.net/v2/anime/${req.params.id}`, {
      params: {
        fields: 'id,title,main_picture,mean,media_type,num_episodes,synopsis,status,genres,alternative_titles'
      },
      headers: { 'X-MAL-CLIENT-ID': process.env.MAL_CLIENT_ID }
    });
    
    const data = response.data;
    // Format details to match what your AnimeDetails.tsx expects
    res.json({
      id: data.id,
      title: { romaji: data.title, english: data.alternative_titles?.en || data.title },
      coverImage: { large: data.main_picture?.large || "", extraLarge: data.main_picture?.large || "" },
      bannerImage: "", // MAL doesn't provide banners
      description: data.synopsis || "No description available.",
      averageScore: data.mean ? Math.round(data.mean * 10) : null,
      genres: data.genres ? data.genres.map(g => g.name) : [],
      episodes: data.num_episodes,
      status: data.status,
      format: data.media_type,
      relations: { edges: [] }, // MAL doesn't provide relations in this endpoint
      characters: { edges: [] }, // MAL doesn't provide characters in this endpoint
      recommendations: { nodes: [] } // MAL doesn't provide recommendations in this endpoint
    });
  } catch (error) {
    console.error("Details Error:", error.message);
    res.status(500).json({ error: "Details failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
