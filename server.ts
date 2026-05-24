import express from "express";
import path from "path";
import { createClient } from "@libsql/client";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import { spawn } from "child_process";
import fs from "fs";
import "dotenv/config";

const backupDir = path.join(process.cwd(), "tor_service_backup");

function restoreTorBackup(torDir: string): boolean {
  if (fs.existsSync(backupDir)) {
    const files = ["hostname", "hs_ed25519_public_key", "hs_ed25519_secret_key"];
    const allExist = files.every(file => fs.existsSync(path.join(backupDir, file)));
    if (allExist) {
      console.log("📂 [Tor Service] Restoring persistent onion keys from local backup...");
      files.forEach(file => {
        const src = path.join(backupDir, file);
        const dest = path.join(torDir, file);
        fs.copyFileSync(src, dest);
        fs.chmodSync(dest, 0o600);
      });
      return true;
    }
  }
  return false;
}

function saveTorBackup(torDir: string) {
  const secretKeyPath = path.join(torDir, "hs_ed25519_secret_key");
  if (fs.existsSync(secretKeyPath)) {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const files = ["hostname", "hs_ed25519_public_key", "hs_ed25519_secret_key"];
    files.forEach(file => {
      const src = path.join(torDir, file);
      const dest = path.join(backupDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`💾 [Tor Service] Backed up ${file} to local backup folder.`);
      }
    });
  }
}

async function restoreTorKeysFromDatabase(client: any, torDir: string): Promise<boolean> {
  try {
    const result = await client.execute("SELECT filename, content_base64 FROM tor_keys");
    if (result.rows && result.rows.length > 0) {
      console.log(`📂 [Tor DB Restore] Found ${result.rows.length} keys in Turso, restoring...`);
      if (!fs.existsSync(torDir)) {
        fs.mkdirSync(torDir, { recursive: true });
      }
      fs.chmodSync(torDir, 0o700);

      for (const row of result.rows) {
        const filename = row.filename as string;
        const base64Content = row.content_base64 as string;
        const dest = path.join(torDir, filename);
        const buffer = Buffer.from(base64Content, "base64");
        fs.writeFileSync(dest, buffer);
        fs.chmodSync(dest, 0o600);
        console.log(`📂 [Tor DB Restore] Successfully restored ${filename}`);
      }
      return true;
    } else {
      console.log("📂 [Tor DB Restore] No keys found in database yet. Generating brand new onion identity.");
      return false;
    }
  } catch (err: any) {
    console.error("⚠️ [Tor DB Restore] Could not restore keys from database:", err.message);
    return false;
  }
}

async function saveTorKeysToDatabase(client: any, torDir: string) {
  try {
    const files = ["hostname", "hs_ed25519_public_key", "hs_ed25519_secret_key"];
    const allExist = files.every(file => fs.existsSync(path.join(torDir, file)));
    if (!allExist) return;

    console.log("💾 [Tor DB Save] Storing onion keys to Turso database for permanent persistence...");
    for (const file of files) {
      const src = path.join(torDir, file);
      const content = fs.readFileSync(src);
      const base64Content = content.toString("base64");
      
      await client.execute({
        sql: "INSERT OR REPLACE INTO tor_keys (filename, content_base64) VALUES (?, ?)",
        args: [file, base64Content]
      });
      console.log(`💾 [Tor DB Save] Persisted ${file} in database.`);
    }
  } catch (err: any) {
    console.error("⚠️ [Tor DB Save] Failed to write key files to database:", err.message);
  }
}

let activeTorProcess: any = null;
let isRestartingTor = false;

// Keeps the Render instance from going to sleep by quietly hitting its own HTTP URL
function startKeepAlive() {
  const appUrl = process.env.APP_URL;
  if (!appUrl || appUrl.includes("localhost") || appUrl.includes("127.0.0.1")) {
    console.log("ℹ️ [Keep-Alive] Running in local environment or APP_URL not configured. Skipping active self-pings.");
    return;
  }
  
  console.log(`🔗 [Keep-Alive] Registering self-ping loop to ${appUrl} every 10 minutes to prevent Render sleeps...`);
  setInterval(async () => {
    try {
      const res = await fetch(`${appUrl.trim()}/api/messages`);
      console.log(`📡 [Keep-Alive] Self-ping loaded successfully: status ${res.status}.`);
    } catch (err: any) {
      console.log(`📡 [Keep-Alive] Self-ping warning (could not hit endpoint): ${err.message}`);
    }
  }, 10 * 60 * 1000); // 10 minutes (Render's sleep timeout is 15 minutes)
}

// Detects if the server container went to sleep (freeze) and woke up (thaw)
function startFreezeThawWatcher(client: any) {
  let lastTime = Date.now();
  console.log("🔄 [Tor System] Initializing freeze-thaw sleep-wake cycle watcher...");
  setInterval(() => {
    const currentTime = Date.now();
    const diff = currentTime - lastTime;
    
    // Interval of 5000ms. If it took more than 20 seconds, we woke up from a sleep!
    if (diff > 20000) {
      console.log(`⚠️ [Tor System] Sleep-wake cycle (VM pause/resume) detected! (Time gap: ${diff}ms)`);
      console.log("🔄 Automatically restarting Tor daemon to restore circuits...");
      restartTor(client);
    }
    lastTime = currentTime;
  }, 5000);
}

function restartTor(client: any) {
  if (isRestartingTor) return;
  isRestartingTor = true;

  try {
    if (activeTorProcess) {
      console.log("🛑 Terminating existing stale Tor daemon process...");
      activeTorProcess.kill("SIGKILL");
      activeTorProcess = null;
    }
  } catch (err: any) {
    console.error("⚠️ [Tor System] Error terminating stale Tor daemon:", err.message);
  }

  setTimeout(() => {
    isRestartingTor = false;
    launchTorDaemon(client);
  }, 3000);
}

// Starts the Tor Hidden Service in the background
async function launchTorDaemon(client: any) {
  console.log("🧅 [Tor Service] Starting Tor daemon...");
  
  const torrcPath = path.join(process.cwd(), "torrc");
  const torDir = path.join(process.cwd(), "tor_service");

  try {
    if (!fs.existsSync(torDir)) {
      fs.mkdirSync(torDir, { recursive: true });
    }
    // Set 700 permissions which Tor strictly requires
    fs.chmodSync(torDir, 0o700);

    const torrcContent = `SocksPort 0\nHiddenServiceDir ${torDir}\nHiddenServicePort 80 127.0.0.1:3000\n`;
    fs.writeFileSync(torrcPath, torrcContent, "utf8");

    // 1. Try to restore onion identity from central database (survives any Render rebuild/destroy)
    const restoredFromDB = await restoreTorKeysFromDatabase(client, torDir);
    
    // 2. Fallback to local files if database setup is pristine
    if (!restoredFromDB) {
      restoreTorBackup(torDir);
    }

    const torProcess = spawn("tor", ["-f", torrcPath]);
    activeTorProcess = torProcess;

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
      if (activeTorProcess === torProcess) {
        activeTorProcess = null;
        if (!isRestartingTor) {
          console.log("⚠️ [Tor Service] Tor process died unexpectedly. Restarting in 5 seconds...");
          setTimeout(() => {
            launchTorDaemon(client);
          }, 5000);
        }
      }
    });

    // Check for the onion address periodically and print it prominently
    const hostnameFile = path.join(torDir, "hostname");
    const checkOnion = setInterval(async () => {
      if (fs.existsSync(hostnameFile)) {
        const address = fs.readFileSync(hostnameFile, "utf8").trim();
        console.log("\n====================================================");
        console.log("🌟 ONION DEPLOYMENT ONLINE!");
        console.log(`🔗 Active Onion Link: http://${address}`);
        console.log("====================================================\n");
        
        // Backup files to database immediately for future container spins or Render redeploys
        await saveTorKeysToDatabase(client, torDir);

        // Also update local folder backup
        saveTorBackup(torDir);
        
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

  // Ensure Tor key persistence table first
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS tor_keys (
        filename TEXT PRIMARY KEY,
        content_base64 TEXT
      )
    `);
    console.log("✅ [Tor Database] tor_keys table verified/created successfully.");
  } catch (dbErr) {
    console.error("❌ [Tor Database] Failed to initialize tor_keys schema:", dbErr);
  }

  // Let Tor fire up in the background (using initialized Turso client for persistent backup)
  await launchTorDaemon(client);

  // Initialize sleep-wake cycle watcher and active self-pinger
  startFreezeThawWatcher(client);
  startKeepAlive();

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
