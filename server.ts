import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Proxy for AstrologyAPI
  app.post("/api/astrology", async (req, res) => {
    const { endpoint, data } = req.body;
    const ASTROLOGY_API_KEY = process.env.ASTROLOGY_API_KEY;
    const ASTROLOGY_USER_ID = process.env.ASTROLOGY_USER_ID;

    if (!ASTROLOGY_API_KEY || !ASTROLOGY_USER_ID) {
      return res.status(500).json({ error: "API credentials not configured" });
    }

    try {
      const response = await axios.post(`https://api.astrologyapi.com/v1/${endpoint}`, data, {
        headers: {
          "Authorization": "Basic " + Buffer.from(`${ASTROLOGY_USER_ID}:${ASTROLOGY_API_KEY}`).toString("base64"),
          "Content-Type": "application/json"
        }
      });
      res.json(response.data);
    } catch (error: any) {
      res.status(error.response?.status || 500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
