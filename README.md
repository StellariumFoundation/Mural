# Mural of Open Messages 🧅

A fully decentralized, completely open mural canvas designed to run as an anonymous **Tor Hidden Service v3** hosted anywhere—including Render, Docker, or local machine. Anyone can leave immutable texts, high-resolution photographs, high-quality videos, and documents permanently.

---

## ✨ Features \& Capabilities

- **🌌 Absolute Immutability**: There is literally no moderation or delete triggers. Once a post is uploaded, it is engraved in the secure SQLite ledger forever.
- **📄 Complete Multi-Media Support**: Supports uploading images, rich video streams (up to 25MB for 20MB files), and general document attachment files (PDF, Word, TXT, spreadsheets, archives).
- **📱 Single Screen Flow with Bottom Navigation**: Toggle seamlessly between the global **Mural** feed (ordered chronologically from newest to oldest) and the **Post** creator via our sleek floating bottom navigator bar.
- **📡 Tor Hidden Service out of the Box**: When started, the server runs a background Tor process configuring and generating a `.onion` service point, mapping directly to standard port `3000`.
- **💾 Low JavaScript & Pure SQLite**: Heavy JavaScript models and unnecessary SDKs are omitted to guarantee fast load times, lightweight bundle payloads, and optimal browser privacy.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Lucide Icons, and lightweight custom form data handlers.
- **Backend / Database**: Node.js, Express, Multer, `better-sqlite3` database engine.
- **Anonymity Layer**: Native Tor v3 onion services daemon.

---

## 🚀 Deployed as a Tor Hidden Service on Render

To deploy this website on Render as a Hidden Service, build a custom Web Service using our pre-configured `Dockerfile`.

### 1. Configure the Render Web Service
1. Log in to your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** -> **Web Service**.
3. Point Render to your repository.
4. Select **Docker** as the Runtime environment. Render will automatically detect the `/Dockerfile` at the root.
5. Set the required environment configuration:
   - `PORT`: `3000`
   - `NODE_ENV`: `production`

### 2. Retrieve Your `.onion` Address
Because Render's container environments have standard console logging logs:
1. When your container deploys and launches, our Node backend automatically runs `tor` in the background.
2. The server configures the Hidden Service, generates your unique RSA/Ed25519 Tor keys inside `/app/tor_service`, and writes the address to `/app/tor_service/hostname`.
3. The server prints the `.onion` address directly in your Render console logs:
   ```txt
   ====================================================
   🌟 ONION DEPLOYMENT ONLINE!
   🔗 Active Onion Link: http://xyz123abc456.onion
   ====================================================
   ```
4. Copy this link and browse securely via the official **Tor Browser**.

---

## 🏠 Running Locally with Tor

To run this application locally and bootstrap Tor:

1. Ensure you have `node`, `npm`, and `tor` installed on the host system:
   ```bash
   # macOS
   brew install tor
   
   # Ubuntu / Debian
   sudo apt-get install -y tor
   ```
2. Run installation:
   ```bash
   npm install
   ```
3. Run the development environment:
   ```bash
   npm run dev
   ```
   *The console will print out your unique, active Onion Link! Use the Tor Browser to navigate.*

---

## 💾 Persistence details

All mural state, binary pictures, video segments, and file sheets are parsed fully securely on-demand, using **SQLite 3 blob storage**. This makes the application fully portable and server-restart proof without relying on external SaaS databases.
