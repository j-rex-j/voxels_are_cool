import * as THREE from "https://unpkg.com/three@0.165.0/build/three.module.js";

const WORLD_SIZE = 32;
const WORLD_HALF = WORLD_SIZE / 2;
const BLOCK_TYPES = ["grass", "dirt", "stone", "wood", "leaves", "sand"];

const canvas = document.getElementById("gameCanvas");
const statusEl = document.getElementById("status");
const nameInput = document.getElementById("nameInput");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x84beff);
scene.fog = new THREE.Fog(0x84beff, 30, 110);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 8, 10);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const sun = new THREE.DirectionalLight(0xfff3de, 1.05);
sun.position.set(8, 20, 10);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.48));

const worldGroup = new THREE.Group();
scene.add(worldGroup);

const blockGeo = new THREE.BoxGeometry(1, 1, 1);
const blockMap = new Map();

const blockMats = {
  grass: new THREE.MeshStandardMaterial({ color: 0x5bbf57 }),
  dirt: new THREE.MeshStandardMaterial({ color: 0x8c5f35 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x8d919a }),
  wood: new THREE.MeshStandardMaterial({ color: 0x7f5d38 }),
  leaves: new THREE.MeshStandardMaterial({ color: 0x3b8c3b }),
  sand: new THREE.MeshStandardMaterial({ color: 0xdac37d })
};

function key(x, y, z) {
  return `${x},${y},${z}`;
}

function getHeight(x, z) {
  const noise = Math.sin(x * 0.23) * 1.4 + Math.cos(z * 0.17) * 1.2 + Math.sin((x + z) * 0.11);
  return Math.max(1, Math.min(6, Math.floor(noise + 4)));
}

function blockTypeAtHeight(y, topY) {
  if (y === topY) {
    return topY <= 2 ? "sand" : "grass";
  }
  if (y >= topY - 2) {
    return "dirt";
  }
  return "stone";
}

function addBlock(x, y, z, type = "grass") {
  const k = key(x, y, z);
  if (blockMap.has(k)) {
    const old = blockMap.get(k);
    if (old.type === type) {
      return;
    }
    worldGroup.remove(old.mesh);
    blockMap.delete(k);
  }
  const mat = blockMats[type] || blockMats.grass;
  const mesh = new THREE.Mesh(blockGeo, mat);
  mesh.position.set(x, y, z);
  worldGroup.add(mesh);
  blockMap.set(k, { mesh, type });
}

function removeBlock(x, y, z) {
  const k = key(x, y, z);
  const block = blockMap.get(k);
  if (!block) {
    return;
  }
  worldGroup.remove(block.mesh);
  blockMap.delete(k);
}

function hasBlock(x, y, z) {
  return blockMap.has(key(x, y, z));
}

function getBlockType(x, y, z) {
  return blockMap.get(key(x, y, z))?.type || null;
}

function generateTree(x, y, z) {
  const trunkHeight = 3 + Math.floor(Math.abs(Math.sin((x + z) * 0.7)) * 2);
  for (let i = 1; i <= trunkHeight; i += 1) {
    addBlock(x, y + i, z, "wood");
  }
  const topY = y + trunkHeight;
  for (let lx = -2; lx <= 2; lx += 1) {
    for (let lz = -2; lz <= 2; lz += 1) {
      for (let ly = 0; ly <= 2; ly += 1) {
        if (Math.abs(lx) + Math.abs(lz) + ly > 4) {
          continue;
        }
        addBlock(x + lx, topY + ly, z + lz, "leaves");
      }
    }
  }
}

function generateOfflineWorld() {
  for (let x = -WORLD_HALF; x < WORLD_HALF; x += 1) {
    for (let z = -WORLD_HALF; z < WORLD_HALF; z += 1) {
      const topY = getHeight(x, z);
      for (let y = 0; y <= topY; y += 1) {
        addBlock(x, y, z, blockTypeAtHeight(y, topY));
      }
    }
  }
  for (let x = -WORLD_HALF + 2; x < WORLD_HALF - 2; x += 1) {
    for (let z = -WORLD_HALF + 2; z < WORLD_HALF - 2; z += 1) {
      const topY = getHeight(x, z);
      if (topY >= 3 && (x * 31 + z * 17) % 29 === 0) {
        generateTree(x, topY, z);
      }
    }
  }
}

const remotePlayers = new Map();
const remoteGeo = new THREE.BoxGeometry(0.7, 1.7, 0.7);

function upsertRemotePlayer(player) {
  if (!player || !player.id) {
    return;
  }
  let entity = remotePlayers.get(player.id);
  if (!entity) {
    const mat = new THREE.MeshStandardMaterial({ color: player.color || "#f5c" });
    const mesh = new THREE.Mesh(remoteGeo, mat);
    scene.add(mesh);
    entity = { mesh };
    remotePlayers.set(player.id, entity);
  }
  entity.mesh.position.set(player.x, player.y - 0.85, player.z);
  entity.mesh.rotation.y = player.yaw;
}

function removeRemotePlayer(id) {
  const entity = remotePlayers.get(id);
  if (!entity) {
    return;
  }
  scene.remove(entity.mesh);
  entity.mesh.material.dispose();
  remotePlayers.delete(id);
}

const me = {
  id: null,
  pos: new THREE.Vector3(0, 8, 10),
  vel: new THREE.Vector3(0, 0, 0),
  yaw: 0,
  pitch: 0,
  onGround: false
};

const keys = { forward: false, back: false, left: false, right: false, jump: false };
let pointerLocked = false;
let ws = null;
const isFileMode = window.location.protocol === "file:";
const raycaster = new THREE.Raycaster();
let selectedBlockType = "grass";

function ensureHotbar() {
  const hotbar = document.getElementById("hotbar");
  if (!hotbar) {
    return;
  }
  hotbar.textContent = "";
  BLOCK_TYPES.forEach((type, idx) => {
    const item = document.createElement("div");
    item.className = "slot";
    item.dataset.type = type;
    item.textContent = `${idx + 1} ${type}`;
    if (type === selectedBlockType) {
      item.classList.add("selected");
    }
    hotbar.appendChild(item);
  });
}

function setSelectedBlockType(type) {
  if (!BLOCK_TYPES.includes(type)) {
    return;
  }
  selectedBlockType = type;
  const slots = document.querySelectorAll("#hotbar .slot");
  slots.forEach((slot) => slot.classList.toggle("selected", slot.dataset.type === type));
}

function getSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
}

function sendMove() {
  if (ws?.readyState === WebSocket.OPEN && me.id) {
    ws.send(JSON.stringify({ type: "move", x: me.pos.x, y: me.pos.y, z: me.pos.z, yaw: me.yaw }));
  }
}

function sendName(name) {
  if (name && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "set_name", name }));
  }
}

function sendRemoveBlock(x, y, z) {
  if (isFileMode) {
    if (y > 0) {
      removeBlock(x, y, z);
    }
    return;
  }
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "remove_block", x, y, z }));
  }
}

function sendPlaceBlock(x, y, z) {
  if (isFileMode) {
    addBlock(x, y, z, selectedBlockType);
    return;
  }
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "place_block", x, y, z, blockType: selectedBlockType }));
  }
}

function connectSocket() {
  if (isFileMode) {
    me.id = "offline-player";
    statusEl.textContent = "Offline mode";
    generateOfflineWorld();
    return;
  }

  ws = new WebSocket(getSocketUrl());
  ws.addEventListener("open", () => {
    statusEl.textContent = "Connected";
  });
  ws.addEventListener("close", () => {
    statusEl.textContent = "Disconnected, retrying...";
    setTimeout(connectSocket, 1000);
  });
  ws.addEventListener("message", (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.type === "init") {
      me.id = msg.yourId;
      for (const block of msg.world || []) {
        addBlock(block.x, block.y, block.z, block.type || "grass");
      }
      for (const player of msg.players || []) {
        if (player.id !== me.id) {
          upsertRemotePlayer(player);
        }
      }
      return;
    }
    if (msg.type === "player_joined") {
      if (msg.player?.id !== me.id) {
        upsertRemotePlayer(msg.player);
      }
      return;
    }
    if (msg.type === "player_left") {
      removeRemotePlayer(msg.id);
      return;
    }
    if (msg.type === "state") {
      for (const player of msg.players || []) {
        if (player.id !== me.id) {
          upsertRemotePlayer(player);
        }
      }
      return;
    }
    if (msg.type === "block_placed") {
      addBlock(msg.x, msg.y, msg.z, msg.blockType || "grass");
      return;
    }
    if (msg.type === "block_removed") {
      removeBlock(msg.x, msg.y, msg.z);
    }
  });
}

connectSocket();
ensureHotbar();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyW") keys.forward = true;
  if (e.code === "KeyS") keys.back = true;
  if (e.code === "KeyA") keys.left = true;
  if (e.code === "KeyD") keys.right = true;
  if (e.code === "Space") keys.jump = true;
  if (e.code === "KeyF") {
    if (!pointerLocked) {
      canvas.requestPointerLock();
    } else {
      document.exitPointerLock();
    }
  }

  if (e.code.startsWith("Digit")) {
    const idx = Number(e.code.replace("Digit", "")) - 1;
    if (idx >= 0 && idx < BLOCK_TYPES.length) {
      setSelectedBlockType(BLOCK_TYPES[idx]);
    }
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "KeyW") keys.forward = false;
  if (e.code === "KeyS") keys.back = false;
  if (e.code === "KeyA") keys.left = false;
  if (e.code === "KeyD") keys.right = false;
  if (e.code === "Space") keys.jump = false;
});

document.addEventListener("pointerlockchange", () => {
  pointerLocked = document.pointerLockElement === canvas;
});

window.addEventListener("mousemove", (e) => {
  if (!pointerLocked) {
    return;
  }
  me.yaw -= e.movementX * 0.0025;
  me.pitch -= e.movementY * 0.0025;
  me.pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, me.pitch));
});

function canStandAt(x, y, z) {
  const by = Math.floor(y - 1.01);
  return hasBlock(Math.round(x), by, Math.round(z));
}

window.addEventListener("mousedown", (e) => {
  if (!pointerLocked) {
    return;
  }
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects(worldGroup.children, false);
  if (!hits.length) {
    return;
  }
  const hit = hits[0];
  const normal = hit.face?.normal?.clone();
  if (!normal) {
    return;
  }

  const breakPoint = hit.point.clone().addScaledVector(normal, -0.5);
  const tx = Math.round(breakPoint.x);
  const ty = Math.round(breakPoint.y);
  const tz = Math.round(breakPoint.z);

  if (e.button === 0) {
    const targetType = getBlockType(tx, ty, tz);
    if (targetType !== "stone" || ty > 1) {
      sendRemoveBlock(tx, ty, tz);
    }
    return;
  }

  if (e.button === 2) {
    e.preventDefault();
    const placePoint = hit.point.clone().addScaledVector(normal, 0.5);
    const px = Math.round(placePoint.x);
    const py = Math.round(placePoint.y);
    const pz = Math.round(placePoint.z);
    if (!hasBlock(px, py, pz)) {
      sendPlaceBlock(px, py, pz);
    }
  }
});

window.addEventListener("contextmenu", (e) => e.preventDefault());
nameInput.addEventListener("change", () => sendName(nameInput.value.trim()));

const dir = new THREE.Vector3();
const right = new THREE.Vector3();
const move = new THREE.Vector3();
const clock = new THREE.Clock();
let syncTimer = 0;

function updatePlayer(dt) {
  const walkSpeed = 5.8;
  const accel = 26;
  const friction = 10;
  const gravity = 20;
  const jumpSpeed = 8.4;

  dir.set(Math.sin(me.yaw), 0, Math.cos(me.yaw));
  right.set(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
  move.set(0, 0, 0);
  if (keys.forward) move.add(dir);
  if (keys.back) move.sub(dir);
  if (keys.left) move.sub(right);
  if (keys.right) move.add(right);
  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(accel * dt);
    me.vel.x += move.x;
    me.vel.z += move.z;
  }

  const damp = Math.max(0, 1 - friction * dt);
  me.vel.x *= damp;
  me.vel.z *= damp;

  const h = Math.hypot(me.vel.x, me.vel.z);
  if (h > walkSpeed) {
    const s = walkSpeed / h;
    me.vel.x *= s;
    me.vel.z *= s;
  }

  me.vel.y -= gravity * dt;
  if (keys.jump && me.onGround) {
    me.vel.y = jumpSpeed;
    me.onGround = false;
  }

  me.pos.x += me.vel.x * dt;
  me.pos.z += me.vel.z * dt;
  me.pos.y += me.vel.y * dt;

  const gy = Math.floor(me.pos.y - 1.01);
  const gx = Math.round(me.pos.x);
  const gz = Math.round(me.pos.z);
  if (hasBlock(gx, gy, gz) && me.vel.y <= 0) {
    me.pos.y = gy + 1.02;
    me.vel.y = 0;
    me.onGround = true;
  } else {
    me.onGround = canStandAt(me.pos.x, me.pos.y, me.pos.z);
  }

  if (me.pos.y < -20) {
    me.pos.set(0, 10, 0);
    me.vel.set(0, 0, 0);
  }
}

function syncNetwork(dt) {
  syncTimer += dt;
  if (syncTimer < 0.05) {
    return;
  }
  syncTimer = 0;
  sendMove();
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  updatePlayer(dt);
  syncNetwork(dt);
  camera.position.copy(me.pos);
  camera.rotation.set(me.pitch, me.yaw, 0, "YXZ");
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
