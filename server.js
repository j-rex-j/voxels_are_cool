const path = require("path");
const http = require("http");
const express = require("express");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const TICK_RATE_MS = 50;
const WORLD_SIZE = 32;

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const players = new Map();
const worldBlocks = new Map();

for (let x = -WORLD_SIZE / 2; x < WORLD_SIZE / 2; x += 1) {
  for (let z = -WORLD_SIZE / 2; z < WORLD_SIZE / 2; z += 1) {
    setBlock(x, 0, z, "grass");
  }
}

function blockKey(x, y, z) {
  return `${x},${y},${z}`;
}

function setBlock(x, y, z, type) {
  worldBlocks.set(blockKey(x, y, z), { x, y, z, type });
}

function removeBlock(x, y, z) {
  worldBlocks.delete(blockKey(x, y, z));
}

function serializeWorld() {
  return Array.from(worldBlocks.values());
}

function randomColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 70%, 55%)`;
}

function makePlayer(id) {
  return {
    id,
    name: `Player-${id.slice(0, 4)}`,
    color: randomColor(),
    x: 0,
    y: 3,
    z: 0,
    yaw: 0
  };
}

function sendJSON(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(payload, exceptId = null) {
  const encoded = JSON.stringify(payload);
  for (const [id, state] of players.entries()) {
    if (id === exceptId) {
      continue;
    }
    if (state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(encoded);
    }
  }
}

wss.on("connection", (ws) => {
  const id = Math.random().toString(36).slice(2, 10);
  const player = makePlayer(id);

  players.set(id, { ws, player });

  sendJSON(ws, {
    type: "init",
    yourId: id,
    players: Array.from(players.values()).map((p) => p.player),
    world: serializeWorld()
  });

  broadcast({ type: "player_joined", player }, id);

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const entry = players.get(id);
    if (!entry) {
      return;
    }

    if (msg.type === "move") {
      const p = entry.player;
      p.x = Number(msg.x) || 0;
      p.y = Number(msg.y) || 0;
      p.z = Number(msg.z) || 0;
      p.yaw = Number(msg.yaw) || 0;
      return;
    }

    if (msg.type === "set_name") {
      const nextName = String(msg.name || "").trim().slice(0, 24);
      if (nextName) {
        entry.player.name = nextName;
        broadcast({ type: "player_name", id, name: nextName });
      }
      return;
    }

    if (msg.type === "place_block") {
      const x = Math.round(Number(msg.x));
      const y = Math.round(Number(msg.y));
      const z = Math.round(Number(msg.z));
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return;
      }
      if (y < -8 || y > 20) {
        return;
      }
      setBlock(x, y, z, "grass");
      broadcast({ type: "block_placed", x, y, z, blockType: "grass" });
      return;
    }

    if (msg.type === "remove_block") {
      const x = Math.round(Number(msg.x));
      const y = Math.round(Number(msg.y));
      const z = Math.round(Number(msg.z));
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return;
      }
      if (y === 0) {
        return;
      }
      removeBlock(x, y, z);
      broadcast({ type: "block_removed", x, y, z });
    }
  });

  ws.on("close", () => {
    players.delete(id);
    broadcast({ type: "player_left", id });
  });
});

setInterval(() => {
  if (players.size === 0) {
    return;
  }
  broadcast({
    type: "state",
    players: Array.from(players.values()).map((entry) => entry.player)
  });
}, TICK_RATE_MS);

server.listen(PORT, () => {
  console.log(`Voxel server running at http://localhost:${PORT}`);
});
