# 3D Multiplayer HTML Voxel Game

A simple Minecraft-style prototype made with HTML + JavaScript + Three.js and a Node.js WebSocket server.

## Features

- First-person movement and mouse look
- Voxel world (break/place blocks)
- Real-time multiplayer player syncing
- Name setting for players

## Run

### Quick launch (no install)

- Open `public/index.html` directly in your browser.
- This runs in **offline mode** (single-player, no server required).

### Multiplayer launch (server required)

1. Open a terminal in this folder:
   - `c:\Users\johnr\OneDrive\Documents\voxel-multiplayer-game`
2. Install dependencies:
   - `npm install`
3. Start the server:
   - `npm start`
4. Open your browser:
   - [http://localhost:3000](http://localhost:3000)

To test multiplayer, open the URL in multiple browser tabs or on another device on the same network using your PC IP and port `3000`.

## Cloud hosting (online multiplayer)

This project is now configured for **Render** cloud hosting (includes WebSocket support for multiplayer).

### Option A: Deploy from GitHub (recommended)

1. Create a new GitHub repo and upload this folder.
2. Go to [Render Dashboard](https://dashboard.render.com/) and click **New +** -> **Blueprint**.
3. Connect your GitHub repo.
4. Render detects `render.yaml` and creates the web service automatically.
5. After deploy, open your Render URL (for example `https://voxel-multiplayer-game.onrender.com`).

Anyone who opens that URL can play online together in the same world.

### Option B: Manual web service

If you do not use Blueprint:

1. Create a **Web Service** in Render from your repo.
2. Use:
   - Build Command: `npm --prefix voxel-multiplayer-game install`
   - Start Command: `npm --prefix voxel-multiplayer-game start`
3. Deploy and open the public URL.

If Render shows `ENOENT ... /opt/render/project/src/package.json`, set the service **Root Directory** to `voxel-multiplayer-game` or use the prefixed commands above.

## Notes for online play

- Multiplayer requires running from `http(s)` so the WebSocket server is available.
- The client auto-selects `wss://` on HTTPS and `ws://` on HTTP.
- The direct file launch (`public/index.html`) remains offline single-player mode.
