const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Allow your Electron app to talk to this server
app.use(cors());
app.use(express.json());

// 🚨 Basic Test Route
app.get('/', (req, res) => {
  res.send('AniLumoS Backend is running!');
});

// 🚨 Search Route (Mock Data for now)
app.get('/api/search', (req, res) => {
  const query = req.query.q || '';
  console.log(`Received search request for: ${query}`);

  // For now, return a fake anime so you can see it working in your app
  const mockAnime = [
    {
      id: 1,
      title: { romaji: `Mock Anime Result for "${query}"`, english: "Mock English Title" },
      coverImage: { large: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-1f1f1f1f1f1f.jpg" },
      averageScore: 85,
      format: "TV",
      episodes: 24
    }
  ];

  res.json(mockAnime);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});