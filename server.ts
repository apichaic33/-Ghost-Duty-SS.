import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.use(vite.middlewares);

    app.use(express.json());

    // API Route for Line Notification
    app.post("/api/notify", async (req, res) => {
      const { token, message } = req.body;
      
      if (!token || !message) {
        return res.status(400).json({ error: "Missing token or message" });
      }

      try {
        await axios.post(
          "https://notify-api.line.me/api/notify",
          `message=${encodeURIComponent(message)}`,
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Bearer ${token}`,
            },
          }
        );
        res.json({ success: true });
      } catch (error: any) {
        console.error("Line Notify Error:", error.response?.data || error.message);
        res.status(500).json({ error: "Failed to send notification" });
      }
    });

    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    app.use(express.json());

    // API Route for Line Notification
    app.post("/api/notify", async (req, res) => {
      const { token, message } = req.body;
      
      if (!token || !message) {
        return res.status(400).json({ error: "Missing token or message" });
      }

      try {
        await axios.post(
          "https://notify-api.line.me/api/notify",
          `message=${encodeURIComponent(message)}`,
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Bearer ${token}`,
            },
          }
        );
        res.json({ success: true });
      } catch (error: any) {
        console.error("Line Notify Error:", error.response?.data || error.message);
        res.status(500).json({ error: "Failed to send notification" });
      }
    });

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
