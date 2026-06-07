import express from "express";
import path from "path";
import { createClient } from "@libsql/client";
import multer from "multer";
import fs from "fs";
import "dotenv/config";
import compression from "compression";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Optimize performance by enabling gzip/deflate compression
  app.use(compression());

  // Initialize Turso database client (LibSQL)
  const tursoUrl =
    process.env.TURSO_DATABASE_URL ;
  const tursoToken =
    process.env.TURSO_AUTH_TOKEN;

  console.log(`ℹ️ [Database] Connecting to database at: ${tursoUrl.startsWith('file:') ? 'local development file' : 'remote Turso database'}`);

  const client = createClient({
    url: tursoUrl,
    authToken: tursoToken,
  });

  // Set up table that supports media uploads fully within Turso (SQLite dialect)
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS mural_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT,
        author TEXT,
        media_data BLOB,
        media_mime TEXT,
        media_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log(
      "✅ [Turso] mural_messages table verified/created successfully.",
    );
  } catch (dbErr) {
    console.error("❌ [Turso] Failed to initialize database schema:", dbErr);
  }

  app.use(express.json());

  // Set up standard memory storage for multer parsing
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 25 * 1024 * 1024, // Allow up to 25MB (supporting 20MB videos request)
    },
  });

  // GET messages count
  app.get("/api/messages/count", async (req, res) => {
    try {
      const result = await client.execute("SELECT COUNT(*) as count FROM mural_messages");
      res.json({ count: result.rows[0].count });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to count messages" });
    }
  });

  // GET messages (excludes media_data to keep JSON payload lightweight)
  app.get("/api/messages", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = 10;
      const offset = (page - 1) * limit;

      const result = await client.execute({
        sql: `
          SELECT id, message, author, media_mime, media_name, created_at 
          FROM mural_messages 
          ORDER BY id DESC
          LIMIT ? OFFSET ?
        `,
        args: [limit + 1, offset],
      });

      const hasMore = result.rows.length > limit;
      const data = result.rows.slice(0, limit);

      res.json({ messages: data, hasMore });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to load messages" });
    }
  });

  // GET media on-demand (serves binary content with appropriate mimetype)
  app.get("/api/media/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const result = await client.execute({
        sql: "SELECT media_data, media_mime FROM mural_messages WHERE id = ?",
        args: [id],
      });

      const row = result.rows[0];

      if (!row || !row.media_data) {
        return res.status(404).send("Media file not found");
      }

      const mediaData = Buffer.from(row.media_data as any);
      res.setHeader(
        "Content-Type",
        (row.media_mime as string) || "application/octet-stream",
      );
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); // 1 year cache
      res.send(mediaData);
    } catch (error) {
      console.error(error);
      res.status(500).send("Failed to load media file");
    }
  });

  // POST new message with optional media file
  app.post("/api/messages", upload.single("file"), async (req, res) => {
    try {
      const { message, author } = req.body;
      const file = req.file;

      if (!message && !file) {
        return res
          .status(400)
          .json({ error: "Either text or media is required to post!" });
      }

      await client.execute({
        sql: "INSERT INTO mural_messages (message, author, media_data, media_mime, media_name) VALUES (?, ?, ?, ?, ?)",
        args: [
          message || "",
          author || "Anonymous",
          file ? new Uint8Array(file.buffer) : null,
          file ? file.mimetype : null,
          file ? file.originalname : null,
        ],
      });

      res.status(201).json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to store message" });
    }
  });

  // Note: No delete endpoint exists anymore (as requested: changed mind, no-one can delete messages)

  // ==========================================
  // No-JS Basic / Tor Safest Mode Compatibility
  // ==========================================

  // POST new message via basic HTML form
  app.post("/basic/post", upload.single("file"), async (req, res) => {
    try {
      const { message, author } = req.body;
      const file = req.file;

      if (!message && !file) {
        return res
          .status(400)
          .send(
            "Error: Either text or media is required. <a href='/basic'>Go back</a>",
          );
      }

      await client.execute({
        sql: "INSERT INTO mural_messages (message, author, media_data, media_mime, media_name) VALUES (?, ?, ?, ?, ?)",
        args: [
          message || "",
          author || "Anonymous",
          file ? new Uint8Array(file.buffer) : null,
          file ? file.mimetype : null,
          file ? file.originalname : null,
        ],
      });

      res.redirect("/basic");
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .send("Failed to store message. <a href='/basic'>Go back</a>");
    }
  });

  // GET simple HTML readonly/write view
  app.get("/basic", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = 10;
      const offset = (page - 1) * limit;

      const result = await client.execute({
        sql: `
          SELECT id, message, author, media_mime, media_name, created_at 
          FROM mural_messages 
          ORDER BY id DESC
          LIMIT ? OFFSET ?
        `,
        args: [limit + 1, offset],
      });

      const hasMore = result.rows.length > limit;
      const data = result.rows.slice(0, limit);

      let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stellarium Mural - Basic Mode</title>
  <style>
    body { font-family: monospace; background: #090d16; color: #cbd5e1; max-width: 95vw; margin: 0 auto; padding: 3vw; box-sizing: border-box; }
    h1 { color: #10b981; text-align: center; font-size: 5vw; margin: 2vw 0; text-shadow: 0 0 10px rgba(16,185,129,0.3); }
    .nav-link { display: block; text-align: center; margin-bottom: 4vw; font-size: 3vw; color: #64748b; }
    .nav-link a { color: #10b981; text-decoration: none; font-weight: bold; }
    .post-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 3vw; }
    .post { border: 1px solid #1e293b; padding: 4vw; border-radius: 3vw; background: #020617; box-shadow: 0 4px 20px rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 2vw; box-sizing: border-box; }
    .author { font-weight: bold; color: #34d399; font-size: 3.5vw; }
    .date { color: #64748b; font-size: 2.8vw; display: block; margin-top: 0.5vw; }
    form { background: #0b1329; padding: 4vw; border-radius: 3vw; margin-bottom: 5vw; border: 1px solid #1e293b; }
    form h3 { margin-top: 0; color: #10b981; }
    input, textarea, button { background: #020617; color: #cbd5e1; border: 1px solid #1e293b; padding: 3vw; margin-bottom: 3vw; width: 100%; box-sizing: border-box; border-radius: 1.5vw; font-size: 3vw; font-family: monospace; }
    button { background: #10b981; color: #020617; cursor: pointer; font-weight: bold; border: none; font-size: 3.5vw; transition: background 0.2s; }
    button:hover { background: #34d399; }
    a { color: #10b981; text-decoration: none; }
    a:hover { text-decoration: underline; }
    img, video, audio { max-width: 100%; height: auto; border-radius: 2vw; margin-top: 2vw; }
    .pagination { display: flex; justify-content: space-between; margin-top: 5vw; font-size: 3.5vw; grid-column: 1 / -1; }
    
    @media (min-width: 768px) {
      body { max-width: 1200px; padding: 2vw; }
      h1 { font-size: 2.5rem; }
      .nav-link { font-size: 1rem; margin-bottom: 2rem; }
      .post { padding: 1.5rem; border-radius: 1rem; gap: 1rem; }
      .author { font-size: 1.1rem; }
      .date { font-size: 0.8rem; display: inline; margin-top: 0; }
      form { padding: 2rem; border-radius: 1rem; margin-bottom: 2.5rem; }
      input, textarea, button { padding: 1rem; border-radius: 0.5rem; font-size: 1rem; margin-bottom: 1rem; }
      button { font-size: 1rem; }
      .pagination { font-size: 1rem; margin-top: 2.5rem; }
    }
  </style>
</head>
<body>
  <h1>🪐 Stellarium Mural (Basic Mode)</h1>
  <p class="nav-link"><a href="/">Switch to rich JavaScript view</a></p>
  
  <form action="/basic/post" method="POST" enctype="multipart/form-data">
    <h3>Write a message</h3>
    <input type="text" name="author" placeholder="Alias (Optional, defaults to Anonymous)">
    <textarea name="message" rows="4" placeholder="Your transmission..."></textarea>
    <label style="display: block; margin-bottom: 1vw; font-size: 0.9em; color: #94a3b8;">Attach media (optional, up to 25MB):</label>
    <input type="file" name="file" accept="image/*,video/*,audio/*">
    <button type="submit">Broadcast to the void</button>
  </form>

  <h2 style="color: #cbd5e1; border-bottom: 1px solid #1e293b; padding-bottom: 1vw; margin-bottom: 3vw;">Recent Transmissions</h2>
  <div class="post-container">
`;

      if (data.length === 0) {
        html += `<p style="grid-column: 1/-1; text-align: center; color: #64748b;">No messages found on this page.</p>`;
      } else {
        for (const row of data) {
          html += `<div class="post">`;
          html += `<div class="author">${row.author} <span class="date">- ${new Date(row.created_at as string).toLocaleString()}</span></div>`;
          if (row.message) {
            // Very basic sanitize
            const safeMsg = (row.message as string)
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;");
            html += `<p style="margin: 0; line-height: 1.5; white-space: pre-wrap;">${safeMsg.replace(/\\n/g, "<br>")}</p>`;
          }
          if (row.media_mime) {
            const mime = row.media_mime as string;
            const url = `/api/media/${row.id}`;
            if (mime.startsWith("image/"))
              html += `<img src="${url}" alt="Attachment">`;
            else if (mime.startsWith("video/"))
              html += `<video src="${url}" controls></video>`;
            else if (mime.startsWith("audio/"))
              html += `<audio src="${url}" controls></audio>`;
            else
              html += `<p style="margin: 0;"><a href="${url}" target="_blank">Download Attachment: ${row.media_name || "file"}</a></p>`;
          }
          html += `</div>`;
        }
      }

      html += `</div>`; // Close post-container

      html += `<div class="pagination">`;
      if (page > 1) {
        html += `<a href="/basic?page=${page - 1}">&larr; Newer Posts</a>`;
      } else {
        html += `<span></span>`;
      }
      if (hasMore) {
        html += `<a href="/basic?page=${page + 1}">Older Posts &rarr;</a>`;
      }
      html += `</div>`;

      html += `</body></html>`;

      res.send(html);
    } catch (error) {
      console.error(error);
      res.status(500).send("Failed to load basic view.");
    }
  });

  // Static Production bundle and Dev bundle from bun map
  const distPath = path.join(process.cwd(), "dist");
  const publicPath = path.join(process.cwd(), "public");
  app.use(express.static(distPath));
  app.use(express.static(publicPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Mural Backend Live on http://0.0.0.0:${PORT}`);
  });
}

startServer();
