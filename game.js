import * as THREE from "three";

const ARENA_SIZE = 40;
const WALL_HEIGHT = 6;
const PLAYER_SPEED = 12;
const TURN_SPEED = 2.2;
const PLAYER_MAX_HEALTH = 100;
const ENEMY_MAX_HEALTH = 100;
const BULLET_DAMAGE = 12;
const FIRE_COOLDOWN = 0.35;
const ENEMY_FIRE_COOLDOWN = 0.9;
const BULLET_SPEED = 55;
const ENEMY_SPEED = 7;

const keys = {};
let gameRunning = false;
let lastTime = 0;

const canvas = document.getElementById("game-canvas");
const menu = document.getElementById("menu");
const hud = document.getElementById("hud");
const messageEl = document.getElementById("message");
const messageTitle = document.getElementById("message-title");
const messageText = document.getElementById("message-text");
const playerHealthBar = document.getElementById("player-health");
const enemyHealthBar = document.getElementById("enemy-health");
const ammoEl = document.getElementById("ammo");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e14);
scene.fog = new THREE.Fog(0x0a0e14, 25, 70);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(0, 1.7, 14);

const player = {
  health: PLAYER_MAX_HEALTH,
  yaw: 0,
  fireTimer: 0,
  position: new THREE.Vector3(0, 1.7, 14),
};

const enemy = {
  mesh: null,
  health: ENEMY_MAX_HEALTH,
  fireTimer: 0,
  state: "patrol",
  patrolTarget: new THREE.Vector3(),
  stateTimer: 0,
};

const bullets = [];
const muzzleFlashes = [];

function clampToArena(pos, margin = 1.5) {
  const limit = ARENA_SIZE / 2 - margin;
  pos.x = THREE.MathUtils.clamp(pos.x, -limit, limit);
  pos.z = THREE.MathUtils.clamp(pos.z, -limit, limit);
}

function setupLights() {
  const ambient = new THREE.AmbientLight(0x3a4a6a, 0.45);
  scene.add(ambient);

  const main = new THREE.DirectionalLight(0xb8d4ff, 0.9);
  main.position.set(15, 25, 10);
  main.castShadow = true;
  main.shadow.mapSize.set(2048, 2048);
  main.shadow.camera.near = 1;
  main.shadow.camera.far = 60;
  main.shadow.camera.left = -25;
  main.shadow.camera.right = 25;
  main.shadow.camera.top = 25;
  main.shadow.camera.bottom = -25;
  scene.add(main);

  const rim = new THREE.PointLight(0x0ea5e9, 0.6, 50);
  rim.position.set(0, 8, 0);
  scene.add(rim);
}

function createArena() {
  const floorGeo = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE, 20, 20);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x1a2332,
    roughness: 0.85,
    metalness: 0.15,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const gridHelper = new THREE.GridHelper(ARENA_SIZE, 20, 0x1e3a5f, 0x152238);
  gridHelper.position.y = 0.02;
  scene.add(gridHelper);

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x243044,
    roughness: 0.7,
    metalness: 0.3,
  });

  const half = ARENA_SIZE / 2;
  const walls = [
    { w: ARENA_SIZE, d: 0.6, x: 0, z: -half },
    { w: ARENA_SIZE, d: 0.6, x: 0, z: half },
    { w: 0.6, d: ARENA_SIZE, x: -half, z: 0 },
    { w: 0.6, d: ARENA_SIZE, x: half, z: 0 },
  ];

  walls.forEach(({ w, d, x, z }) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_HEIGHT, d), wallMat);
    wall.position.set(x, WALL_HEIGHT / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
  });

  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.4 });
  const pillarPositions = [
    [-10, -10], [10, -10], [-10, 10], [10, 10],
    [-10, 0], [10, 0], [0, -10], [0, 10],
  ];

  pillarPositions.forEach(([x, z]) => {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, WALL_HEIGHT, 8), pillarMat);
    pillar.position.set(x, WALL_HEIGHT / 2, z);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    scene.add(pillar);
  });
}

function createEnemy() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.8, 1.2),
    new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x450a0a, roughness: 0.4, metalness: 0.6 })
  );
  body.position.y = 1.1;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.5, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x991b1b, emissive: 0x7f1d1d, roughness: 0.3, metalness: 0.7 })
  );
  head.position.y = 2.2;
  head.castShadow = true;
  group.add(head);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 2 });
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), eyeMat);
  eye.position.set(0, 2.25, 0.38);
  group.add(eye);

  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.15, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.2 })
  );
  gun.position.set(0.4, 1.3, 0.6);
  group.add(gun);

  group.position.set(0, 0, -12);
  scene.add(group);
  enemy.mesh = group;
  pickPatrolTarget();
}

function pickPatrolTarget() {
  const limit = ARENA_SIZE / 2 - 4;
  enemy.patrolTarget.set(
    THREE.MathUtils.randFloatSpread(limit * 2),
    0,
    THREE.MathUtils.randFloatSpread(limit * 2)
  );
}

function syncCamera() {
  camera.position.copy(player.position);
  camera.rotation.set(0, player.yaw, 0, "YXZ");
}

function updateHealthBars() {
  playerHealthBar.style.width = `${(player.health / PLAYER_MAX_HEALTH) * 100}%`;
  enemyHealthBar.style.width = `${(enemy.health / ENEMY_MAX_HEALTH) * 100}%`;
}

function spawnBullet(origin, direction, fromEnemy) {
  const geo = new THREE.SphereGeometry(fromEnemy ? 0.12 : 0.08, 6, 6);
  const mat = new THREE.MeshBasicMaterial({
    color: fromEnemy ? 0xf87171 : 0x38bdf8,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(origin);
  scene.add(mesh);

  bullets.push({
    mesh,
    velocity: direction.clone().normalize().multiplyScalar(BULLET_SPEED),
    fromEnemy,
    life: 2,
  });

  const flashGeo = new THREE.SphereGeometry(0.25, 6, 6);
  const flashMat = new THREE.MeshBasicMaterial({
    color: fromEnemy ? 0xfca5a5 : 0x7dd3fc,
    transparent: true,
    opacity: 0.8,
  });
  const flash = new THREE.Mesh(flashGeo, flashMat);
  flash.position.copy(origin);
  scene.add(flash);
  muzzleFlashes.push({ mesh: flash, life: 0.08 });
}

function playerShoot() {
  if (player.fireTimer > 0) return;

  player.fireTimer = FIRE_COOLDOWN;
  ammoEl.textContent = "COOLDOWN";
  ammoEl.classList.add("cooldown");

  const direction = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
  const origin = player.position.clone().add(direction.clone().multiplyScalar(0.5));
  spawnBullet(origin, direction, false);

  const raycaster = new THREE.Raycaster(player.position, direction);
  const hits = raycaster.intersectObject(enemy.mesh, true);

  if (hits.length > 0 && hits[0].distance < 50) {
    damageEnemy(BULLET_DAMAGE);
  }
}

function damageEnemy(amount) {
  enemy.health = Math.max(0, enemy.health - amount);
  updateHealthBars();

  if (enemy.mesh) {
    enemy.mesh.children[0].material.emissive.setHex(0xffffff);
    setTimeout(() => {
      if (enemy.mesh) enemy.mesh.children[0].material.emissive.setHex(0x450a0a);
    }, 80);
  }

  if (enemy.health <= 0) endGame(true);
}

function damagePlayer(amount) {
  player.health = Math.max(0, player.health - amount);
  updateHealthBars();

  if (player.health <= 0) endGame(false);
}

function enemyShoot() {
  if (enemy.fireTimer > 0 || !enemy.mesh) return;

  const toPlayer = player.position.clone().sub(enemy.mesh.position);
  toPlayer.y = 0;
  const dist = toPlayer.length();
  if (dist > 28) return;

  enemy.fireTimer = ENEMY_FIRE_COOLDOWN;
  toPlayer.normalize();

  const origin = enemy.mesh.position.clone();
  origin.y = 1.5;
  origin.add(toPlayer.clone().multiplyScalar(0.8));
  spawnBullet(origin, toPlayer, true);
}

function updateEnemyAI(dt) {
  if (!enemy.mesh || enemy.health <= 0) return;

  const pos = enemy.mesh.position;
  const toPlayer = player.position.clone().sub(pos);
  toPlayer.y = 0;
  const distToPlayer = toPlayer.length();

  enemy.stateTimer -= dt;

  if (distToPlayer < 22) {
    enemy.state = "combat";
  } else if (enemy.stateTimer <= 0) {
    enemy.state = "patrol";
    pickPatrolTarget();
    enemy.stateTimer = 4;
  }

  let moveDir = new THREE.Vector3();

  if (enemy.state === "combat") {
    enemy.mesh.lookAt(player.position.x, pos.y, player.position.z);

    if (distToPlayer > 10) {
      moveDir.copy(toPlayer).normalize();
    } else if (distToPlayer < 6) {
      moveDir.copy(toPlayer).normalize().multiplyScalar(-1);
    }

    if (distToPlayer < 26 && hasLineOfSight(pos, player.position)) {
      enemyShoot();
    }
  } else {
    const toTarget = enemy.patrolTarget.clone().sub(pos);
    toTarget.y = 0;
    if (toTarget.length() < 1.5) {
      pickPatrolTarget();
    } else {
      moveDir.copy(toTarget).normalize();
      enemy.mesh.lookAt(enemy.patrolTarget.x, pos.y, enemy.patrolTarget.z);
    }
  }

  pos.add(moveDir.multiplyScalar(ENEMY_SPEED * dt));
  clampToArena(pos);
}

function hasLineOfSight(from, to) {
  const dir = to.clone().sub(from);
  const dist = dir.length();
  dir.normalize();

  const raycaster = new THREE.Raycaster(from.clone().setY(1.5), dir, 0, dist);
  const obstacles = scene.children.filter(
    (c) => c.geometry && (c.geometry.type === "BoxGeometry" || c.geometry.type === "CylinderGeometry")
  );
  const hits = raycaster.intersectObjects(obstacles, false);
  return hits.length === 0 || hits[0].distance >= dist - 0.5;
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.mesh.position.add(b.velocity.clone().multiplyScalar(dt));
    b.life -= dt;

    if (b.fromEnemy) {
      const d = b.mesh.position.distanceTo(player.position);
      if (d < 0.9) {
        damagePlayer(BULLET_DAMAGE);
        removeBullet(i);
        continue;
      }
    }

    if (b.life <= 0 || Math.abs(b.mesh.position.x) > ARENA_SIZE / 2 || Math.abs(b.mesh.position.z) > ARENA_SIZE / 2) {
      removeBullet(i);
    }
  }
}

function removeBullet(index) {
  scene.remove(bullets[index].mesh);
  bullets.splice(index, 1);
}

function updateMuzzleFlashes(dt) {
  for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
    muzzleFlashes[i].life -= dt;
    muzzleFlashes[i].mesh.material.opacity = muzzleFlashes[i].life / 0.08;
    if (muzzleFlashes[i].life <= 0) {
      scene.remove(muzzleFlashes[i].mesh);
      muzzleFlashes.splice(i, 1);
    }
  }
}

function updatePlayer(dt) {
  if (keys.ArrowLeft) player.yaw += TURN_SPEED * dt;
  if (keys.ArrowRight) player.yaw -= TURN_SPEED * dt;

  const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw);
  const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw);

  if (keys.ArrowUp) player.position.add(forward.clone().multiplyScalar(PLAYER_SPEED * dt));
  if (keys.ArrowDown) player.position.add(forward.clone().multiplyScalar(-PLAYER_SPEED * dt));

  clampToArena(player.position);
  syncCamera();

  if (player.fireTimer > 0) {
    player.fireTimer -= dt;
    if (player.fireTimer <= 0) {
      ammoEl.textContent = "READY";
      ammoEl.classList.remove("cooldown");
    }
  }

  if (keys[" "]) playerShoot();
}

function endGame(victory) {
  gameRunning = false;
  hud.classList.add("hidden");
  messageEl.classList.remove("hidden");
  messageTitle.textContent = victory ? "Victory!" : "Defeated";
  messageTitle.className = victory ? "victory" : "defeat";
  messageText.textContent = victory
    ? "The combat drone has been destroyed. Arena cleared."
    : "The drone got the better of you. Try again.";
}

function resetGame() {
  bullets.forEach((b) => scene.remove(b.mesh));
  bullets.length = 0;
  muzzleFlashes.forEach((f) => scene.remove(f.mesh));
  muzzleFlashes.length = 0;

  player.health = PLAYER_MAX_HEALTH;
  player.yaw = 0;
  player.fireTimer = 0;
  player.position.set(0, 1.7, 14);

  enemy.health = ENEMY_MAX_HEALTH;
  enemy.fireTimer = 0;
  enemy.state = "patrol";
  enemy.stateTimer = 0;
  if (enemy.mesh) enemy.mesh.position.set(0, 0, -12);
  pickPatrolTarget();

  syncCamera();
  updateHealthBars();
  ammoEl.textContent = "READY";
  ammoEl.classList.remove("cooldown");
}

function startGame() {
  resetGame();
  menu.classList.add("hidden");
  messageEl.classList.add("hidden");
  hud.classList.remove("hidden");
  gameRunning = true;
  lastTime = performance.now();
}

function gameLoop(now) {
  requestAnimationFrame(gameLoop);
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (gameRunning) {
    updatePlayer(dt);
    updateEnemyAI(dt);
    updateBullets(dt);
    updateMuzzleFlashes(dt);
    if (enemy.fireTimer > 0) enemy.fireTimer -= dt;
  }

  renderer.render(scene, camera);
}

window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
    e.preventDefault();
    keys[e.key] = true;
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.key] = false;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.getElementById("start-btn").addEventListener("click", startGame);
document.getElementById("restart-btn").addEventListener("click", startGame);

setupLights();
createArena();
createEnemy();
syncCamera();
updateHealthBars();
requestAnimationFrame(gameLoop);
