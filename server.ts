import express from "express";
import path from "path";
import { createClient } from "@libsql/client";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import { spawn } from "child_process";
import fs from "fs";
import "dotenv/config";

// Starts the Tor Hidden Service in the background
function launchTorDaemon() {
  console.log("🧅 [Tor Service] Searching for Tor daemon...");
  
  const torrcPath = path.join(process.cwd(), "torrc");
  const torDir = path.join(process.cwd(), "tor_service");

  try {
    if (!fs.existsSync(torDir)) {
      fs.mkdirSync(torDir, { recursive: true });
    }
    // Set 750 or 700 permissions which Tor strictly requires
    fs.chmodSync(torDir, 0o700);

    const torrcContent = `SocksPort 0\nHiddenServiceDir ${torDir}\nHiddenServicePort 80 127.0.0.1:3000\n`;
    fs.writeFileSync(torrcPath, torrcContent, "utf8");

    const torProcess = spawn("tor", ["-f", torrcPath]);

    torProcess.on("error", (err) => {
      console.log("ℹ️ [Tor Service] Quietly caught spawn error (Tor is not installed in this container/development sandbox. It will run in your Render web service environment where Docker installs Tor automatically):", err.message);
    });

    torProcess.stdout?.on("data", (data) => {
      const output = data.toString();
      if (output.includes("Bootstrapped 100%")) {
        console.log("====================================================");
        console.log("🧅 Tor fully connected and bootstrapped to the network!");
        console.log("====================================================");
      }
    });

    torProcess.stderr?.on("data", (data) => {
      const errStr = data.toString();
      if (errStr.trim()) {
        console.log("[Tor Warning/Error]:", errStr.trim());
      }
    });

    torProcess.on("close", (code) => {
      console.log(`[Tor Process] Exited daemon with status code ${code}`);
    });

    // Check for the onion address periodically and print it prominently
    const hostnameFile = path.join(torDir, "hostname");
    const checkOnion = setInterval(() => {
      if (fs.existsSync(hostnameFile)) {
        const address = fs.readFileSync(hostnameFile, "utf8").trim();
        console.log("\n====================================================");
        console.log("🌟 ONION DEPLOYMENT ONLINE!");
        console.log(`🔗 Active Onion Link: http://${address}`);
        console.log("====================================================\n");
        clearInterval(checkOnion);
      }
    }, 1000);

    // Timeout check polling after 2 minutes
    setTimeout(() => clearInterval(checkOnion), 120000);

  } catch (err: any) {
    console.log("⚠️ [Tor Service] Could not launch Tor daemon in this environment:", err.message);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Let Tor fire up in the background
  launchTorDaemon();

  // Initialize Turso database client (LibSQL)
  const tursoUrl = process.env.TURSO_DATABASE_URL || "libsql://water-database-stellarfoundation.aws-us-west-2.turso.io";
  const tursoToken = process.env.TURSO_AUTH_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJleHAiOjE5MDYzMzU5OTUsImlhdCI6MTc3OTUwMDc5NSwiaWQiOiIwMTllNTI4MS1jZDAxLTc5OWUtYjgyYi1iNjY5MmIwM2IwZjEiLCJyaWQiOiJkY2YwMjAyMy00MjUyLTQ0ZDMtYjBkNC02YmQxM2MyOTg5ZTUifQ.4CBKWqMGwr_8rvC_aU49gmgYi84HvG22duxogwjJokA3NtH-egJtrP6iqwneVp4fu2rkha1NLbmypWgnPXQTCA";

  if (!tursoUrl) {
    console.error("❌ [Turso] TURSO_DATABASE_URL environment variable is missing.");
    throw new Error("TURSO_DATABASE_URL environment variable is required to start the server.");
  }

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
    console.log("✅ [Turso] mural_messages table verified/created successfully.");
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

  // GET messages (excludes media_data to keep JSON payload lightweight)
  app.get("/api/messages", async (req, res) => {
    try {
      const result = await client.execute(`
        SELECT id, message, author, media_mime, media_name, created_at 
        FROM mural_messages 
        ORDER BY id DESC
      `);
      res.json(result.rows);
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
        args: [id]
      });

      const row = result.rows[0];

      if (!row || !row.media_data) {
        return res.status(404).send("Media file not found");
      }

      const mediaData = Buffer.from(row.media_data as any);
      res.setHeader("Content-Type", (row.media_mime as string) || "application/octet-stream");
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
        return res.status(400).json({ error: "Either text or media is required to post!" });
      }

      await client.execute({
        sql: "INSERT INTO mural_messages (message, author, media_data, media_mime, media_name) VALUES (?, ?, ?, ?, ?)",
        args: [
          message || "",
          author || "Anonymous",
          file ? new Uint8Array(file.buffer) : null,
          file ? file.mimetype : null,
          file ? file.originalname : null
        ]
      });

      res.status(201).json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to store message" });
    }
  });

  // Note: No delete endpoint exists anymore (as requested: changed mind, no-one can delete messages)

  // Vite development middleware vs Static Production bundle
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
    console.log(`Mural Backend Live on http://0.0.0.0:${PORT}`);
  });
}

startServer();
