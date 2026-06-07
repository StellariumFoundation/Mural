# Stellarium Mural

A lightweight, persistent image/video/text board built with full-stack React + Express + Turso SQLite.

## Deployment to Render.com

This app uses Bun for ultra-fast startup and performance! You can very easily deploy it to [Render](https://render.com).

1. Connect your Github/Gitlab to Render.
2. Create a new **Web Service**.
3. Fill out the service details:
   - **Environment:** Node (Render natively supports Bun out of the box now)
   - **Build Command:** `bun install && bun run build`
   - **Start Command:** `bun run dist/server.js`
   
4. **Environment Variables Required:**
   - `TURSO_DATABASE_URL`: Add your Turso SQLite URL (e.g., libsql://your-db.turso.io)
   - `TURSO_AUTH_TOKEN`: Add your Turso Auth Token
   - `APP_URL`: Add the URL Render assigns your app once it's created.

5. Click **Deploy Web Service**!

## Features
- Infinite scrolling pagination (10 posts at a time)
- Seamless Media Upload (Up to 25MB via memory storage, buffered strictly to the DB)
- Extremely low memory footprint.
- "No JavaScript" Basic Version fallback (for legacy browsers or ultra-privacy via Tor). Visit `/basic`
