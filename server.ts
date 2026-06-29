import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API route to dynamically extract the direct MP4 URL from Higgsfield share link
  app.get("/api/higgsfield-video", async (req, res) => {
    try {
      const shareUrl = (req.query.url as string) || "https://higgsfield.ai/s/keldUFnImRA";
      const response = await fetch(shareUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9"
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch Higgsfield page: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();

      // Let's search for any .mp4 URL in the HTML source
      // We will search for both unescaped and escaped URL formats (e.g. \u002F instead of /)
      const mp4Regex = /https?:\\?\/\\?\/[^"'` >]+\.mp4[^"'` >]*/gi;
      const matches = html.match(mp4Regex) || [];

      // Also parse og:video metadata
      const ogVideoRegex = /<meta\s+property="og:video"\s+content="([^"]+)"/i;
      const ogMatch = html.match(ogVideoRegex);

      let videoUrl = "";

      if (ogMatch && ogMatch[1]) {
        videoUrl = ogMatch[1];
      } else if (matches.length > 0) {
        // Clean up escaped characters like \/ and \u002F
        const cleanMatches = matches.map(m => {
          return m
            .replace(/\\u002F/g, "/")
            .replace(/\\u002f/g, "/")
            .replace(/\\\//g, "/")
            .replace(/\\/g, "");
        });
        
        // Prefer URLs containing "cdn" or "storage" or "higgsfield"
        const preferred = cleanMatches.find(url => 
          url.includes("higgsfield") || url.includes("storage") || url.includes("cdn")
        );
        videoUrl = preferred || cleanMatches[0];
      }

      if (!videoUrl) {
        // Fallback: search for any URL starting with https inside quotes that has video or media
        const anyUrlRegex = /"(https?:\\?\/\\?\/[^"]+)"/gi;
        let match;
        while ((match = anyUrlRegex.exec(html)) !== null) {
          const candidate = match[1]
            .replace(/\\u002F/g, "/")
            .replace(/\\u002f/g, "/")
            .replace(/\\\//g, "/")
            .replace(/\\/g, "");
          if (candidate.includes("mp4") || candidate.includes("/video/") || candidate.includes("storage.googleapis.com")) {
            videoUrl = candidate;
            break;
          }
        }
      }

      if (videoUrl) {
        // Remove trailing quotes, backslashes, or HTML entities
        videoUrl = videoUrl
          .replace(/&amp;/g, "&")
          .replace(/["'`\\]/g, "")
          .trim();

        console.log("[Proxy] Successfully extracted video URL:", videoUrl);
        return res.json({ success: true, url: videoUrl });
      } else {
        console.error("[Proxy] Could not extract video URL from page. HTML length:", html.length);
        return res.json({ 
          success: false, 
          error: "No video stream found in the Higgsfield page source.",
          htmlLength: html.length 
        });
      }
    } catch (err: any) {
      console.error("[Proxy] Error fetching Higgsfield video page:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Serve static assets or mount Vite in dev mode
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running at http://localhost:${PORT}`);
  });
}

startServer();
