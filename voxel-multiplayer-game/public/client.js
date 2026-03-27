import * as THREE from "https://unpkg.com/three@0.165.0/build/three.module.js";

const canvas = document.getElementById("gameCanvas");
const statusEl = document.getElementById("status");
const nameInput = document.getElementById("nameInput");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b9ff);
scene.fog = new THREE.Fog(0x87b9ff, 20, 80);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 3, 6);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const light = new THREE.DirectionalLight(0xffffff, 1.0);
light.position.set(6, 12, 4);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.45));

const worldGroup = new THREE.Group();
scene.add(worldGroup);

const blockGeo = new THREE.BoxGeometry(1, 1, 1);
const grassMat = new THREE.MeshStandardMaterial({ color: 0x4fb54f });
const blockMap = new Map();

function key(x, y, z) {
  return `${x},${y},${z}`;
}

function addBlock(x, y, z, material = grassMat) {
  const k = key(x, y, z);
  if (blockMap.has(k)) {
    return;
  }
  const mesh = new THREE.Mesh(blockGeo, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  worldGroup.add(mesh);
  blockMap.set(k, mesh);
}

function removeBlock(x, y, z) {
  const k = key(x, y, z);
  const mesh = blockMap.get(k);
  if (!mesh) {
    return;
  }
  worldGroup.remove(mesh);
  blockMap.delete(k);
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
  pos: new THREE.Vector3(0, 3, 6),
  vel: new THREE.Vector3(0, 0, 0),
  yaw: 0,
  pitch: 0,
  onGround: false
};

const keys = {
  forward: false,
  back: false,
  left: false,
  right: false,
  jump: false
};

let pointerLocked = false;
let ws = null;
const isFileMode = window.location.protocol === "file:";
const offlineWorldSize = 32;

const raycaster = new THREE.Raycaster();

function getSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
}

function generateOfflineWorld() {
  for (let x = -offlineWorldSize / 2; x < offlineWorldSize / 2; x += 1) {
    for (let z = -offlineWorldSize / 2; z < offlineWorldSize / 2; z += 1) {
      addBlock(x, 0, z);
    }
  }
}

function removeLocalBlock(x, y, z) {
  if (y === 0) {
    return;
  }
  removeBlock(x, y, z);
}

function placeLocalBlock(x, y, z) {
  addBlock(x, y, z);
}

function sendMove() {
  if (ws?.readyState === WebSocket.OPEN && me.id) {
    ws.send(
      JSON.stringify({
        type: "move",
        x: me.pos.x,
        y: me.pos.y,
        z: me.pos.z,
        yaw: me.yaw
      })
    );
  }
}

function sendName(name) {
  if (!name) {
    return;
  }
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "set_name", name }));
  }
}

function sendRemoveBlock(x, y, z) {
  if (isFileMode) {
    removeLocalBlock(x, y, z);
    return;
  }
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "remove_block", x, y, z }));
  }
}

function sendPlaceBlock(x, y, z) {
  if (isFileMode) {
    placeLocalBlock(x, y, z);
    return;
  }
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "place_block", x, y, z }));
  }
}

function connectSocket() {
  if (isFileMode) {
    me.id = "offline-player";
    statusEl.textContent = "Offline mode (opened from index.html)";
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
        addBlock(block.x, block.y, block.z);
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

    if (msg.type === "player_name") {
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
      addBlock(msg.x, msg.y, msg.z);
      return;
    }

    if (msg.type === "block_removed") {
      removeBlock(msg.x, msg.y, msg.z);
    }
  });
}

connectSocket();

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
  me.yaw -= e.movementX * 0.0024;
  me.pitch -= e.movementY * 0.0024;
  me.pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, me.pitch));
});

function canStandAt(x, y, z) {
  const belowY = Math.floor(y - 1.01);
  const bx = Math.round(x);
  const bz = Math.round(z);
  return blockMap.has(key(bx, belowY, bz));
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

  const point = hit.point.clone().addScaledVector(normal, -0.5);
  const tx = Math.round(point.x);
  const ty = Math.round(point.y);
  const tz = Math.round(point.z);

  if (e.button === 0) {
    if (ty !== 0) {
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
    sendPlaceBlock(px, py, pz);
  }
});

window.addEventListener("contextmenu", (e) => e.preventDefault());

nameInput.addEventListener("change", () => {
  const name = nameInput.value.trim();
  sendName(name);
});

const dir = new THREE.Vector3();
const right = new THREE.Vector3();
const move = new THREE.Vector3();
const clock = new THREE.Clock();

function updatePlayer(dt) {
  const speed = 6;
  const accel = 24;
  const friction = 10;
  const gravity = 18;
  const jumpSpeed = 7.6;

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

  const damping = Math.max(0, 1 - friction * dt);
  me.vel.x *= damping;
  me.vel.z *= damping;

  const horizSpeed = Math.hypot(me.vel.x, me.vel.z);
  if (horizSpeed > speed) {
    const scale = speed / horizSpeed;
    me.vel.x *= scale;
    me.vel.z *= scale;
  }

  me.vel.y -= gravity * dt;

  if (keys.jump && me.onGround) {
    me.vel.y = jumpSpeed;
    me.onGround = false;
  }

  me.pos.x += me.vel.x * dt;
  me.pos.z += me.vel.z * dt;
  me.pos.y += me.vel.y * dt;

  const groundY = Math.floor(me.pos.y - 1.01);
  const gx = Math.round(me.pos.x);
  const gz = Math.round(me.pos.z);
  if (blockMap.has(key(gx, groundY, gz)) && me.vel.y <= 0) {
    me.pos.y = groundY + 1.02;
    me.vel.y = 0;
    me.onGround = true;
  } else {
    me.onGround = canStandAt(me.pos.x, me.pos.y, me.pos.z);
  }

  if (me.pos.y < -20) {
    me.pos.set(0, 6, 0);
    me.vel.set(0, 0, 0);
  }
}

let syncTimer = 0;
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
