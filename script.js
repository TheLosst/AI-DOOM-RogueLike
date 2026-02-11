const canvas = document.getElementById("view");
const ctx = canvas.getContext("2d", { alpha: false });
const fpsEl = document.getElementById("fps");
const hpEl = document.getElementById("hp");
const killsEl = document.getElementById("kills");
const levelEl = document.getElementById("level");
const floorEl = document.getElementById("floor");
const scoreEl = document.getElementById("score");
const noticeEl = document.getElementById("notice");
const finalScoreEl = document.getElementById("finalScore");
const highScoreEl = document.getElementById("highScore");
const minimap = document.getElementById("minimap");
const minimapCtx = minimap ? minimap.getContext("2d") : null;
const scaleSlider = document.getElementById("scaleSlider");
const scaleValue = document.getElementById("scaleValue");
noticeEl.hidden = true;

const minimapState = {
  fullscreen: false,
  baseSize: 360,
};

const state = {
  posX: 3.5,
  posY: 3.5,
  dir: 0,
  moveSpeed: 3.2,
  rotSpeed: 2.4,
  health: 100,
  kills: 0,
  weaponCooldown: 0,
  weaponAnim: 0,
  weaponFrameIndex: 0,
  weaponFrameTimer: 0,
  weaponPlaying: false,
  weaponFrameDuration: 0.15,
  shotTimer: 0,
  shotDuration: 0.09,
  level: 1,
  score: 10,
  scoreTimer: 0,
  rampProgress: 0,
  rampFrom: 0,
  rampTo: 0,
  cameraHeight: 0,
  rampCooldown: 0,
  firePressed: false,
  alive: true,
  keys: new Set(),
  lastTime: performance.now(),
  fpsTime: performance.now(),
  fpsFrames: 0,
};

const renderSettings = {
  scale: 0.6,
  width: 0,
  height: 0,
  imageData: null,
  data: null,
  zBuffer: null,
};

const savedScale = Number.parseFloat(localStorage.getItem("renderScale"));
if (Number.isFinite(savedScale)) {
  renderSettings.scale = clamp(savedScale, 0.4, 1);
  if (scaleSlider) scaleSlider.value = renderSettings.scale.toFixed(2);
  if (scaleValue) scaleValue.textContent = renderSettings.scale.toFixed(2);
}

if (scaleSlider) {
  scaleSlider.addEventListener("input", (event) => {
    const nextScale = Number.parseFloat(event.target.value);
    if (Number.isFinite(nextScale)) {
      renderSettings.scale = nextScale;
      if (scaleValue) scaleValue.textContent = nextScale.toFixed(2);
      localStorage.setItem("renderScale", nextScale.toFixed(2));
      resize();
    }
  });
}

const savedHighScore = Number.parseInt(localStorage.getItem("highScore"), 10);
if (Number.isFinite(savedHighScore) && highScoreEl) {
  highScoreEl.textContent = String(savedHighScore);
}

let mapGrid = [];
let WORLD_W = 0;
let WORLD_H = 0;
let door = null;
let floors = [];
let currentFloor = 0;

const asphalt = new Image();
const wallTex = new Image();
const enemyWalkTex = new Image();
const enemyFireTex = new Image();
const enemyDamagedTex = new Image();
const enemyDyingTex = new Image();
const doorTex = new Image();
const weaponTex = new Image();
const shotTex = new Image();
const outTex = new Image();

let asphaltData = null;
let wallData = null;
let weaponFrame = null;
let enemyWalkSprite = null;
let enemyFireSprite = null;
let enemyDamagedSprite = null;
let enemyDyingSprite = null;
let weaponSprite = null;
let shotSprite = null;
let outSprite = null;
let enemyWalkFrames = null;
let enemyWalkFrameH = null;
let enemyFireFrames = null;
let enemyFireFrameH = null;
let enemyDamagedFrames = null;
let enemyDamagedFrameH = null;
let enemyDyingFrames = null;
let enemyDyingFrameH = null;
let doorSprite = null;
let doorFrames = null;
let doorFrameH = null;
let weaponFrames = null;
let weaponFrameH = null;
let outFrames = null;
let outFrameH = null;

const baseEnemies = [
  { x: 8.5, y: 2.5, speed: 1.0 },
  { x: 9.0, y: 5.5, speed: 1.1 },
  { x: 3.5, y: 6.0, speed: 0.9 },
];

let enemies = [];
let outEffects = [];
let enemyProjectiles = [];

const enemyAnim = {
  walkFrameDuration: 0.16,
  fireFrameDuration: 0.14,
  damagedDuration: 0.22,
  dyingFrameDuration: 0.18,
  fireCooldown: 1.4,
  fireRange: 8.5,
  projectileSpeed: 4.6,
};

const levelConfig = {
  minSize: 21,
  maxSize: 27,
  minEnemies: 4,
  maxEnemies: 10,
};

function resize() {
  const width = Math.max(
    320,
    Math.floor(window.innerWidth * renderSettings.scale),
  );
  const height = Math.max(
    240,
    Math.floor(window.innerHeight * renderSettings.scale),
  );
  canvas.width = width;
  canvas.height = height;
  renderSettings.width = width;
  renderSettings.height = height;
  renderSettings.imageData = ctx.createImageData(width, height);
  renderSettings.data = renderSettings.imageData.data;
  renderSettings.zBuffer = new Float32Array(width);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  resizeMinimap();
}

window.addEventListener("resize", resize);
resize();

function resizeMinimap() {
  if (!minimap) return;
  if (minimapState.fullscreen) {
    minimap.width = window.innerWidth;
    minimap.height = window.innerHeight;
  } else {
    minimap.width = minimapState.baseSize;
    minimap.height = minimapState.baseSize;
  }
}

function imageToData(img) {
  const tCanvas = document.createElement("canvas");
  tCanvas.width = img.width;
  tCanvas.height = img.height;
  const tCtx = tCanvas.getContext("2d");
  tCtx.drawImage(img, 0, 0);
  return tCtx.getImageData(0, 0, img.width, img.height);
}

function loadImage(img, src) {
  return new Promise((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

function applyChromaKey(img, key, tolerance = 0) {
  const tCanvas = document.createElement("canvas");
  tCanvas.width = img.width;
  tCanvas.height = img.height;
  const tCtx = tCanvas.getContext("2d");
  tCtx.drawImage(img, 0, 0);
  const frame = tCtx.getImageData(0, 0, tCanvas.width, tCanvas.height);
  const data = frame.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (
      Math.abs(r - key.r) <= tolerance &&
      Math.abs(g - key.g) <= tolerance &&
      Math.abs(b - key.b) <= tolerance
    ) {
      data[i + 3] = 0;
    }
  }

  tCtx.putImageData(frame, 0, 0);
  return tCanvas;
}

function parseWeaponFrames(img) {
  const frame = imageToData(img);
  const data = frame.data;
  const w = img.width;
  const h = img.height;
  const row = h - 1;
  const frames = [];
  let inFrame = false;
  let start = 0;

  for (let x = 0; x < w; x++) {
    const idx = (row * w + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const isWhite = r > 240 && g > 240 && b > 240;

    if (!isWhite && !inFrame) {
      start = x;
      inFrame = true;
    }
    if (isWhite && inFrame) {
      if (x - start > 1) frames.push({ x: start, w: x - start });
      inFrame = false;
    }
  }

  if (inFrame) frames.push({ x: start, w: w - start });
  if (frames.length === 0) return null;
  return { frames, frameH: Math.max(1, h - 1) };
}

function clearMarkerRow(canvasEl) {
  const tCtx = canvasEl.getContext("2d");
  const w = canvasEl.width;
  const h = canvasEl.height;
  const row = h - 1;
  const rowData = tCtx.getImageData(0, row, w, 1);
  for (let i = 0; i < rowData.data.length; i += 4) {
    rowData.data[i + 3] = 0;
  }
  tCtx.putImageData(rowData, 0, row);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function ensureOdd(value) {
  return value % 2 === 0 ? value + 1 : value;
}

function getHitsToKill(level) {
  return 2 + Math.floor(level / 2);
}

function getEnemyMaxHealth(level) {
  return getHitsToKill(level) * 20;
}

function awardScore(base) {
  const multiplier = Math.max(1, state.level);
  state.score += base * multiplier;
}

function getDeadEnds(grid) {
  const deadEnds = [];
  for (let y = 1; y < grid.length - 1; y++) {
    for (let x = 1; x < grid[y].length - 1; x++) {
      if (grid[y][x] !== 0) continue;
      let walls = 0;
      if (grid[y - 1][x] === 1) walls += 1;
      if (grid[y + 1][x] === 1) walls += 1;
      if (grid[y][x - 1] === 1) walls += 1;
      if (grid[y][x + 1] === 1) walls += 1;
      if (walls >= 3) deadEnds.push({ x, y });
    }
  }
  return deadEnds;
}

function setCurrentFloor(index) {
  currentFloor = clamp(index, 0, floors.length - 1);
  setMap(floors[currentFloor].grid);
  enemies = floors[currentFloor].enemies;
  state.rampFrom = currentFloor;
  state.rampTo = currentFloor;
  state.rampProgress = 0;
}

function getRampAt(x, y) {
  const floor = floors[currentFloor];
  if (!floor) return null;
  if (floor.rampUp && floor.rampUp.x === x && floor.rampUp.y === y) {
    return { type: "up" };
  }
  if (floor.rampDown && floor.rampDown.x === x && floor.rampDown.y === y) {
    return { type: "down" };
  }
  return null;
}

function isRampCell(mx, my) {
  const floor = floors[currentFloor];
  if (!floor) return false;
  const up = floor.rampUp;
  const down = floor.rampDown;
  return (
    (up && up.x === mx && up.y === my) ||
    (down && down.x === mx && down.y === my)
  );
}

function updateRamp(dt) {
  const mx = Math.floor(state.posX);
  const my = Math.floor(state.posY);
  const ramp = getRampAt(mx, my);
  const wantsUp = state.keys.has("KeyW") || state.keys.has("ArrowUp");
  const wantsDown = state.keys.has("KeyS") || state.keys.has("ArrowDown");

  if (ramp && (wantsUp || wantsDown) && state.rampCooldown <= 0) {
    if (ramp.type === "up" && wantsUp && currentFloor < floors.length - 1) {
      setCurrentFloor(currentFloor + 1);
      state.rampCooldown = 2;
    }
    if (ramp.type === "down" && wantsDown && currentFloor > 0) {
      setCurrentFloor(currentFloor - 1);
      state.rampCooldown = 2;
    }
  }
  state.rampProgress = 0;
  state.rampFrom = currentFloor;
  state.rampTo = currentFloor;
}

function updateCameraHeight() {
  state.cameraHeight = 0;
}

function generateMaze(width, height) {
  const w = ensureOdd(width);
  const h = ensureOdd(height);
  const grid = Array.from({ length: h }, () => Array(w).fill(1));
  const rooms = carveRooms(grid, w, h);

  const stack = [{ x: 1, y: 1 }];
  grid[1][1] = 0;

  while (stack.length) {
    const current = stack[stack.length - 1];
    const directions = shuffle([
      { x: 2, y: 0 },
      { x: -2, y: 0 },
      { x: 0, y: 2 },
      { x: 0, y: -2 },
    ]);
    let carved = false;
    for (const dir of directions) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      if (nx <= 0 || ny <= 0 || nx >= w - 1 || ny >= h - 1) continue;
      if (grid[ny][nx] === 1) {
        grid[current.y + dir.y / 2][current.x + dir.x / 2] = 0;
        grid[ny][nx] = 0;
        stack.push({ x: nx, y: ny });
        carved = true;
        break;
      }
    }
    if (!carved) stack.pop();
  }

  connectRooms(grid, rooms);

  return { grid, rooms };
}

function carveRooms(grid, w, h) {
  const roomSizes = [
    { w: 2, h: 2 },
    { w: 2, h: 3 },
    { w: 3, h: 2 },
    { w: 3, h: 3 },
    { w: 3, h: 4 },
    { w: 4, h: 3 },
    { w: 4, h: 4 },
  ];
  const rooms = [];
  const attempts = 30;

  for (let i = 0; i < attempts; i++) {
    const size = roomSizes[randInt(0, roomSizes.length - 1)];
    const rx = randInt(1, w - size.w - 2);
    const ry = randInt(1, h - size.h - 2);
    if (!canPlaceRoom(grid, rx, ry, size.w, size.h)) continue;

    for (let y = ry; y < ry + size.h; y++) {
      for (let x = rx; x < rx + size.w; x++) {
        grid[y][x] = 0;
      }
    }
    rooms.push({ x: rx, y: ry, w: size.w, h: size.h });
  }

  return rooms;
}

function canPlaceRoom(grid, rx, ry, rw, rh) {
  for (let y = ry - 1; y <= ry + rh; y++) {
    for (let x = rx - 1; x <= rx + rw; x++) {
      if (y < 0 || x < 0 || y >= grid.length || x >= grid[0].length)
        return false;
      if (grid[y][x] === 0) return false;
    }
  }
  return true;
}

function connectRooms(grid, rooms) {
  for (const room of rooms) {
    const cx = randInt(room.x, room.x + room.w - 1);
    const cy = randInt(room.y, room.y + room.h - 1);
    const directions = shuffle([
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]);
    for (const dir of directions) {
      let nx = cx;
      let ny = cy;
      for (let step = 0; step < 20; step++) {
        nx += dir.x;
        ny += dir.y;
        if (
          nx <= 0 ||
          ny <= 0 ||
          ny >= grid.length - 1 ||
          nx >= grid[0].length - 1
        )
          break;
        if (grid[ny][nx] === 0) {
          carveLine(grid, cx, cy, nx, ny);
          step = 999;
          break;
        }
      }
    }
  }
}

function carveLine(grid, x1, y1, x2, y2) {
  let x = x1;
  let y = y1;
  while (x !== x2 || y !== y2) {
    grid[y][x] = 0;
    if (x < x2) x += 1;
    else if (x > x2) x -= 1;
    if (y < y2) y += 1;
    else if (y > y2) y -= 1;
  }
  grid[y2][x2] = 0;
}

function setMap(grid) {
  mapGrid = grid;
  WORLD_H = grid.length;
  WORLD_W = grid[0]?.length || 0;
}

function getFloorCells(grid) {
  const cells = [];
  for (let y = 1; y < grid.length - 1; y++) {
    for (let x = 1; x < grid[y].length - 1; x++) {
      if (grid[y][x] === 0) cells.push({ x, y });
    }
  }
  return cells;
}

function getReachableCellsByFloor(floors, start) {
  if (!floors.length) return [];
  const height = floors[0].grid.length;
  const width = floors[0].grid[0].length;
  const reachable = floors.map(() =>
    Array.from({ length: height }, () => Array(width).fill(false)),
  );
  if (floors[0].grid[start.y][start.x] !== 0) return reachable;

  const queue = [{ f: 0, x: start.x, y: start.y }];
  reachable[0][start.y][start.x] = true;

  for (let i = 0; i < queue.length; i++) {
    const { f, x, y } = queue[i];
    const grid = floors[f].grid;
    const dirs = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    for (const dir of dirs) {
      const nx = x + dir.x;
      const ny = y + dir.y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (grid[ny][nx] === 1 || reachable[f][ny][nx]) continue;
      reachable[f][ny][nx] = true;
      queue.push({ f, x: nx, y: ny });
    }

    const floor = floors[f];
    if (floor.rampUp && floor.rampUp.x === x && floor.rampUp.y === y) {
      const next = f + 1;
      if (next < floors.length && !reachable[next][y][x]) {
        if (floors[next].grid[y][x] === 0) {
          reachable[next][y][x] = true;
          queue.push({ f: next, x, y });
        }
      }
    }
    if (floor.rampDown && floor.rampDown.x === x && floor.rampDown.y === y) {
      const next = f - 1;
      if (next >= 0 && !reachable[next][y][x]) {
        if (floors[next].grid[y][x] === 0) {
          reachable[next][y][x] = true;
          queue.push({ f: next, x, y });
        }
      }
    }
  }

  return reachable;
}

function findFarthestCell(grid, start) {
  const h = grid.length;
  const w = grid[0].length;
  const dist = Array.from({ length: h }, () => Array(w).fill(-1));
  const queue = [{ x: start.x, y: start.y }];
  dist[start.y][start.x] = 0;
  let farthest = start;

  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    const dirs = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    for (const dir of dirs) {
      const nx = cell.x + dir.x;
      const ny = cell.y + dir.y;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (grid[ny][nx] === 1 || dist[ny][nx] !== -1) continue;
      dist[ny][nx] = dist[cell.y][cell.x] + 1;
      queue.push({ x: nx, y: ny });
      if (dist[ny][nx] > dist[farthest.y][farthest.x]) {
        farthest = { x: nx, y: ny };
      }
    }
  }

  return farthest;
}

function generateLevel({ resetStats }) {
  if (resetStats) {
    state.level = 1;
    state.score = 10;
    state.scoreTimer = 0;
  }

  const levelGrowth = Math.floor(state.level / 2);
  const baseW = randInt(levelConfig.minSize, levelConfig.maxSize);
  const baseH = randInt(levelConfig.minSize, levelConfig.maxSize);
  const width = ensureOdd(baseW + levelGrowth * 4);
  const height = ensureOdd(baseH + levelGrowth * 2);
  const roll = Math.random();
  const floorCount = roll < 0.5 ? 2 + Math.floor(state.level / 2) : 1;

  floors = [];
  for (let i = 0; i < floorCount; i++) {
    const { grid, rooms } = generateMaze(width, height);
    floors.push({ grid, rooms, enemies: [], rampUp: null, rampDown: null });
  }

  const start = { x: 1, y: 1 };
  for (let i = 0; i < floors.length - 1; i++) {
    const deadEnds = getDeadEnds(floors[i].grid);
    shuffle(deadEnds);
    const fallback = getFloorCells(floors[i].grid);
    const isStartCell = (cell) => cell.x === start.x && cell.y === start.y;
    const rampDeadEnds =
      i === 0 ? deadEnds.filter((cell) => !isStartCell(cell)) : deadEnds;
    const rampFallback =
      i === 0 ? fallback.filter((cell) => !isStartCell(cell)) : fallback;
    const pick = rampDeadEnds[0] ||
      rampFallback[0] ||
      fallback[0] || { x: 1, y: 1 };
    floors[i].rampUp = { x: pick.x, y: pick.y };
    floors[i + 1].rampDown = { x: pick.x, y: pick.y };
    floors[i].grid[pick.y][pick.x] = 0;
    floors[i + 1].grid[pick.y][pick.x] = 0;
  }

  const topFloorIndex = floors.length - 1;
  const topFloorGrid = floors[topFloorIndex].grid;
  const doorSeed = floors[topFloorIndex].rampDown || start;
  const doorCell = findFarthestCell(topFloorGrid, doorSeed);
  door = {
    x: doorCell.x + 0.5,
    y: doorCell.y + 0.5,
    open: false,
    floor: topFloorIndex,
  };

  state.posX = start.x + 0.5;
  state.posY = start.y + 0.5;

  if (resetStats) {
    state.health = 100;
    state.kills = 0;
  }

  outEffects = [];
  enemyProjectiles = [];

  const baseEnemiesCount = Math.max(
    1,
    Math.floor(randInt(levelConfig.minEnemies, levelConfig.maxEnemies) / 2),
  );
  const enemyHealth = getEnemyMaxHealth(state.level);

  floors.forEach((floor, index) => {
    const safeRadius = 5;
    const safeCells = new Set();
    const centers = [];
    if (index === 0) centers.push(start);
    if (floor.rampUp) centers.push(floor.rampUp);
    if (floor.rampDown) centers.push(floor.rampDown);
    for (const center of centers) {
      for (let y = center.y - safeRadius; y <= center.y + safeRadius; y++) {
        for (let x = center.x - safeRadius; x <= center.x + safeRadius; x++) {
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const dist = Math.hypot(x - center.x, y - center.y);
          if (dist <= safeRadius) safeCells.add(`${x},${y}`);
        }
      }
    }

    const roomEnemySpawns = [];
    for (const room of floor.rooms) {
      const area = room.w * room.h;
      const roomCount = Math.max(
        1,
        Math.floor((area <= 4 ? 1 : area <= 6 ? 2 : area <= 9 ? 3 : 4) / 2),
      );
      const roomCells = [];
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          if (!safeCells.has(`${x},${y}`)) roomCells.push({ x, y });
        }
      }
      shuffle(roomCells);
      for (let i = 0; i < roomCount && i < roomCells.length; i++) {
        roomEnemySpawns.push(roomCells[i]);
      }
    }

    const candidates = getFloorCells(floor.grid).filter((cell) => {
      const dStart = Math.hypot(cell.x - start.x, cell.y - start.y);
      const dDoor = Math.hypot(cell.x - doorCell.x, cell.y - doorCell.y);
      if (safeCells.has(`${cell.x},${cell.y}`)) return false;
      return dStart > 4 && dDoor > 3;
    });
    const reserved = new Set(
      roomEnemySpawns.map((cell) => `${cell.x},${cell.y}`),
    );
    const corridorCandidates = candidates.filter(
      (cell) => !reserved.has(`${cell.x},${cell.y}`),
    );
    shuffle(corridorCandidates);
    const corridorSpawns = corridorCandidates.slice(0, baseEnemiesCount);
    const spawns = roomEnemySpawns.concat(corridorSpawns);

    floor.enemies = spawns.map((cell) => ({
      x: cell.x + 0.5,
      y: cell.y + 0.5,
      speed: 0.8 + Math.random() * 0.6,
      health: enemyHealth,
      attackCooldown: 0,
      alive: true,
      state: "walk",
      frameIndex: 0,
      frameTimer: enemyAnim.walkFrameDuration,
      fireCooldown: enemyAnim.fireCooldown * (0.6 + Math.random() * 0.6),
      damagedTimer: 0,
      didShoot: false,
      countedKill: false,
      wanderDirX: 0,
      wanderDirY: 0,
      wanderTimer: 0,
    }));
  });

  const reachableByFloor = getReachableCellsByFloor(floors, start);
  floors.forEach((floor, floorIndex) => {
    const reachable = reachableByFloor[floorIndex];
    if (!reachable) return;
    for (const enemy of floor.enemies) {
      const ex = Math.floor(enemy.x);
      const ey = Math.floor(enemy.y);
      if (!reachable[ey]?.[ex]) {
        enemy.alive = false;
        enemy.health = 0;
      }
    }
  });

  setCurrentFloor(0);
}

function spriteFrameFor(img) {
  let frameW = img.width;
  let frameH = img.height;
  let frames = 1;
  if (img.width >= img.height * 1.2) {
    frameH = img.height;
    frameW = frameH;
    frames = Math.max(1, Math.floor(img.width / frameW));
  }
  return { frameW, frameH, frames };
}

function setupPointerLock() {
  canvas.addEventListener("click", () => {
    canvas.requestPointerLock();
  });

  document.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== canvas) return;
    const delta = event.movementX || 0;
    state.dir += (delta / 400) * state.rotSpeed * 0.6;
  });
}

function isWall(x, y) {
  const mx = Math.floor(x);
  const my = Math.floor(y);
  return isWallCell(mx, my);
}

function isWallCell(mx, my) {
  if (mx < 0 || my < 0 || mx >= WORLD_W || my >= WORLD_H) return true;
  return mapGrid[my][mx] === 1;
}

function isBlocked(x, y) {
  const mx = Math.floor(x);
  const my = Math.floor(y);
  if (isWallCell(mx, my)) return true;
  if (door && door.floor === currentFloor && !door.open) {
    if (mx === Math.floor(door.x) && my === Math.floor(door.y)) return true;
  }
  return false;
}

function hasLineOfSight(targetX, targetY) {
  const dx = targetX - state.posX;
  const dy = targetY - state.posY;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.floor(dist / 0.15));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = state.posX + dx * t;
    const py = state.posY + dy * t;
    if (isBlocked(px, py)) return false;
  }
  return true;
}

function resetGame() {
  state.dir = 0;
  state.weaponCooldown = 0;
  state.weaponAnim = 0;
  state.weaponFrameIndex = 0;
  state.weaponFrameTimer = 0;
  state.weaponPlaying = false;
  state.shotTimer = 0;
  state.scoreTimer = 0;
  state.firePressed = false;
  state.keys.clear();
  state.alive = true;
  noticeEl.hidden = true;
  generateLevel({ resetStats: true });
}

function update(dt) {
  if (!state.alive) return;

  const dirX = Math.cos(state.dir);
  const dirY = Math.sin(state.dir);
  const move = state.moveSpeed * dt;

  let nextX = state.posX;
  let nextY = state.posY;

  if (state.keys.has("KeyW") || state.keys.has("ArrowUp")) {
    nextX += dirX * move;
    nextY += dirY * move;
  }
  if (state.keys.has("KeyS") || state.keys.has("ArrowDown")) {
    nextX -= dirX * move;
    nextY -= dirY * move;
  }
  if (state.keys.has("KeyA") || state.keys.has("ArrowLeft")) {
    nextX += dirY * move;
    nextY -= dirX * move;
  }
  if (state.keys.has("KeyD") || state.keys.has("ArrowRight")) {
    nextX -= dirY * move;
    nextY += dirX * move;
  }

  if (!isBlocked(nextX, state.posY)) state.posX = nextX;
  if (!isBlocked(state.posX, nextY)) state.posY = nextY;

  if (state.weaponCooldown > 0) state.weaponCooldown -= dt;
  if (state.weaponAnim > 0) state.weaponAnim -= dt;
  if (state.shotTimer > 0) state.shotTimer -= dt;
  if (state.rampCooldown > 0) state.rampCooldown -= dt;

  if (state.weaponPlaying && weaponFrames) {
    state.weaponFrameTimer -= dt;
    if (state.weaponFrameTimer <= 0) {
      state.weaponFrameIndex += 1;
      if (state.weaponFrameIndex >= weaponFrames.length) {
        state.weaponFrameIndex = 0;
        state.weaponPlaying = false;
      } else {
        state.weaponFrameTimer += state.weaponFrameDuration;
      }
    }
  }

  state.scoreTimer += dt;
  if (state.scoreTimer >= 10) {
    const penalty = Math.floor(state.scoreTimer / 10);
    state.score = Math.max(0, state.score - penalty);
    state.scoreTimer -= penalty * 10;
  }

  if (state.firePressed && state.weaponCooldown <= 0 && !state.weaponPlaying) {
    fireWeapon();
  }

  updateEnemies(dt);
  updateOutEffects(dt);
  updateEnemyProjectiles(dt);
  updateRamp(dt);
  updateCameraHeight();

  if (door && !door.open && floors.length > 0) {
    const allDead = floors.every((floor) =>
      floor.enemies.every((enemy) => !enemy.alive),
    );
    if (allDead) door.open = true;
  }

  if (door && door.open && door.floor === currentFloor) {
    const dist = Math.hypot(state.posX - door.x, state.posY - door.y);
    if (dist < 0.6) {
      awardScore(1000);
      state.level += 1;
      generateLevel({ resetStats: false });
    }
  }
}

function updateOutEffects(dt) {
  if (!outFrames) return;
  for (const effect of outEffects) {
    effect.x += effect.vx * dt;
    effect.y += effect.vy * dt;
    effect.vy += 520 * 3 * dt;
    effect.angle += effect.spin * dt;
    effect.frameTimer -= dt;
    if (effect.frameTimer <= 0) {
      effect.frameIndex = (effect.frameIndex + 1) % outFrames.length;
      effect.frameTimer += effect.frameDuration;
    }
  }
  const margin = 160;
  outEffects = outEffects.filter(
    (effect) =>
      effect.x > -margin &&
      effect.x < canvas.width + margin &&
      effect.y < canvas.height + margin,
  );
}

function updateEnemies(dt) {
  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    if (enemy.state === "dying") {
      updateEnemyFrames(
        enemy,
        enemyDyingFrames,
        enemyAnim.dyingFrameDuration,
        dt,
      );
      if (
        enemy.frameIndex >= (enemyDyingFrames ? enemyDyingFrames.length : 1)
      ) {
        enemy.alive = false;
      }
      continue;
    }

    if (enemy.state === "damaged") {
      enemy.damagedTimer -= dt;
      if (enemy.damagedTimer <= 0) {
        enemy.state = "walk";
        enemy.frameIndex = 0;
        enemy.frameTimer = enemyAnim.walkFrameDuration;
      }
      if (enemy.state === "damaged") continue;
    }

    if (enemy.state === "fire") {
      updateEnemyFrames(
        enemy,
        enemyFireFrames,
        enemyAnim.fireFrameDuration,
        dt,
      );
      const fireFrame = enemy.frameIndex === 1;
      if (fireFrame && !enemy.didShoot) {
        spawnEnemyProjectile(enemy);
        enemy.didShoot = true;
      }
      if (enemy.frameIndex >= (enemyFireFrames ? enemyFireFrames.length : 1)) {
        enemy.state = "walk";
        enemy.frameIndex = 0;
        enemy.frameTimer = enemyAnim.walkFrameDuration;
        enemy.didShoot = false;
        enemy.fireCooldown = enemyAnim.fireCooldown;
      }
      continue;
    }

    const dx = state.posX - enemy.x;
    const dy = state.posY - enemy.y;
    const dist = Math.hypot(dx, dy);

    if (enemy.attackCooldown > 0) enemy.attackCooldown -= dt;

    if (enemy.fireCooldown > 0) enemy.fireCooldown -= dt;
    if (dist < enemyAnim.fireRange && hasLineOfSight(enemy.x, enemy.y)) {
      if (enemy.fireCooldown <= 0) {
        enemy.state = "fire";
        enemy.frameIndex = 0;
        enemy.frameTimer = enemyAnim.fireFrameDuration;
        enemy.didShoot = false;
        continue;
      }
    }

    updateEnemyFrames(
      enemy,
      enemyWalkFrames,
      enemyAnim.walkFrameDuration,
      dt,
      true,
    );

    if (dist < 0.8) {
      if (enemy.attackCooldown <= 0) {
        state.health = Math.max(0, state.health - 8);
        enemy.attackCooldown = 1.1;
        if (state.health <= 0) {
          handlePlayerDeath();
        }
      }
      continue;
    }

    const hasSight = dist < 8.5 && hasLineOfSight(enemy.x, enemy.y);
    if (hasSight) {
      const step = enemy.speed * dt;
      const nx = enemy.x + (dx / dist) * step;
      const ny = enemy.y + (dy / dist) * step;
      if (!isBlocked(nx, enemy.y)) enemy.x = nx;
      if (!isBlocked(enemy.x, ny)) enemy.y = ny;
    } else {
      enemy.wanderTimer -= dt;
      if (enemy.wanderTimer <= 0) {
        const angle = Math.random() * Math.PI * 2;
        enemy.wanderDirX = Math.cos(angle);
        enemy.wanderDirY = Math.sin(angle);
        enemy.wanderTimer = 0.6 + Math.random() * 1.4;
      }
      const step = enemy.speed * dt * 0.6;
      const nx = enemy.x + enemy.wanderDirX * step;
      const ny = enemy.y + enemy.wanderDirY * step;
      if (!isBlocked(nx, enemy.y)) enemy.x = nx;
      else enemy.wanderDirX *= -1;
      if (!isBlocked(enemy.x, ny)) enemy.y = ny;
      else enemy.wanderDirY *= -1;
    }
  }
}

function updateEnemyFrames(enemy, frames, frameDuration, dt, loop = false) {
  if (!frames || frames.length === 0) return;
  enemy.frameTimer -= dt;
  if (enemy.frameTimer <= 0) {
    enemy.frameIndex += 1;
    if (loop) {
      enemy.frameIndex %= frames.length;
    }
    enemy.frameTimer += frameDuration;
  }
}

function applyEnemyDamage(enemy, damage) {
  if (!enemy.alive || enemy.state === "dying") return;
  enemy.health -= damage;
  if (enemy.health <= 0) {
    enemy.state = "dying";
    enemy.frameIndex = 0;
    enemy.frameTimer = enemyAnim.dyingFrameDuration;
    enemy.didShoot = false;
    if (!enemy.countedKill) {
      state.kills += 1;
      awardScore(100);
      enemy.countedKill = true;
    }
    return;
  }
  enemy.state = "damaged";
  enemy.damagedTimer = enemyAnim.damagedDuration;
  enemy.frameIndex = 0;
  enemy.frameTimer = enemyAnim.damagedDuration;
}

function spawnEnemyProjectile(enemy) {
  const dx = state.posX - enemy.x;
  const dy = state.posY - enemy.y;
  const dist = Math.max(0.001, Math.hypot(dx, dy));
  const speed = enemyAnim.projectileSpeed;
  enemyProjectiles.push({
    x: enemy.x,
    y: enemy.y,
    vx: (dx / dist) * speed,
    vy: (dy / dist) * speed,
  });
}

function updateEnemyProjectiles(dt) {
  const next = [];
  for (const proj of enemyProjectiles) {
    const nx = proj.x + proj.vx * dt;
    const ny = proj.y + proj.vy * dt;
    if (isBlocked(nx, ny)) continue;
    const hitPlayer = Math.hypot(nx - state.posX, ny - state.posY) < 0.3;
    if (hitPlayer) {
      state.health = Math.max(0, state.health - 12);
      if (state.health <= 0) {
        handlePlayerDeath();
      }
      continue;
    }
    proj.x = nx;
    proj.y = ny;
    next.push(proj);
  }
  enemyProjectiles = next;
}

function fireWeapon() {
  state.weaponCooldown = 0.25;
  state.weaponAnim = 0.12;
  state.shotTimer = state.shotDuration;
  if (weaponFrames) {
    state.weaponFrameIndex = 0;
    state.weaponFrameTimer = state.weaponFrameDuration;
    state.weaponPlaying = true;
  }

  spawnOutEffects();

  let best = null;
  let bestDist = Infinity;
  const maxAngle = 0.12;

  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const dx = enemy.x - state.posX;
    const dy = enemy.y - state.posY;
    const dist = Math.hypot(dx, dy);
    const angle = normalizeAngle(Math.atan2(dy, dx) - state.dir);
    if (Math.abs(angle) > maxAngle) continue;
    if (!hasLineOfSight(enemy.x, enemy.y)) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = enemy;
    }
  }

  if (best) applyEnemyDamage(best, 20);
}

function getWeaponDrawRect(width, height) {
  if (!weaponFrame || !weaponSprite) return null;
  let frameW = weaponFrame.frameW;
  let frameH = weaponFrame.frameH;
  let srcX = 0;
  if (weaponFrames && weaponFrameH) {
    const frame = weaponFrames[state.weaponFrameIndex] || weaponFrames[0];
    frameW = frame.w;
    frameH = weaponFrameH;
    srcX = frame.x;
  }
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const renderScale = renderSettings.scale;
  const scale = Math.min(3.6, (screenW / 900) * 3);
  const recoil = state.weaponAnim > 0 ? (state.weaponAnim / 0.12) * 10 : 0;
  const drawW = frameW * scale * renderScale;
  const drawH = frameH * scale * renderScale;
  const drawX = Math.floor((screenW * renderScale) / 2 - drawW / 2);
  const drawY = Math.floor(
    screenH * renderScale - drawH + recoil * renderScale + 1,
  );
  return { frameW, frameH, srcX, scale, drawW, drawH, drawX, drawY };
}

function spawnOutEffects() {
  if (!outFrames || !outFrameH) return;
  const width = canvas.width;
  const height = canvas.height;
  const rect = getWeaponDrawRect(width, height);
  if (!rect) return;
  const muzzleX = rect.drawX + rect.drawW * 0.82;
  const muzzleY = rect.drawY + rect.drawH * 0.22;
  const ejectX = rect.drawX + rect.drawW * 0.78;
  const ejectY = rect.drawY + rect.drawH * 0.3;

  for (let i = 0; i < 1; i++) {
    const speed = (260 + Math.random() * 120) * 2 * 3;
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 3);
    const baseVx = Math.cos(angle) * speed;
    const baseVy = Math.sin(angle) * speed;
    const vy = baseVy / 3;
    const vx =
      Math.sign(baseVx || 1) * Math.sqrt(Math.max(0, speed * speed - vy * vy));
    outEffects.push({
      x: ejectX + i * 12,
      y: ejectY + i * 6,
      vx,
      vy,
      angle: Math.random() * Math.PI * 2,
      spin: 6 + Math.random() * 4,
      frameIndex: 0,
      frameTimer: 0.04,
      frameDuration: 0.04,
    });
  }
}

function render() {
  const width = renderSettings.width;
  const height = renderSettings.height;
  const imgData = renderSettings.imageData;
  const data = renderSettings.data;
  const zBuffer = renderSettings.zBuffer;
  if (!imgData) return;

  const dirX = Math.cos(state.dir);
  const dirY = Math.sin(state.dir);
  const fov = Math.PI / 3;
  const planeX = -dirY * Math.tan(fov / 2);
  const planeY = dirX * Math.tan(fov / 2);

  const skyTop = [16, 22, 32];
  const skyBottom = [8, 12, 18];
  const heightOffset = -state.cameraHeight * (height * 0.18);
  const horizon = height / 2 + heightOffset;

  for (let x = 0; x < width; x++) {
    const cameraX = (2 * x) / width - 1;
    const rayDirX = dirX + planeX * cameraX;
    const rayDirY = dirY + planeY * cameraX;

    let mapX = Math.floor(state.posX);
    let mapY = Math.floor(state.posY);

    const deltaDistX = Math.abs(1 / (rayDirX || 0.0001));
    const deltaDistY = Math.abs(1 / (rayDirY || 0.0001));

    let stepX;
    let stepY;
    let sideDistX;
    let sideDistY;

    if (rayDirX < 0) {
      stepX = -1;
      sideDistX = (state.posX - mapX) * deltaDistX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1.0 - state.posX) * deltaDistX;
    }

    if (rayDirY < 0) {
      stepY = -1;
      sideDistY = (state.posY - mapY) * deltaDistY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1.0 - state.posY) * deltaDistY;
    }

    let hit = false;
    let side = 0;

    while (!hit) {
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0;
      } else {
        sideDistY += deltaDistY;
        mapY += stepY;
        side = 1;
      }
      if (mapX < 0 || mapY < 0 || mapX >= WORLD_W || mapY >= WORLD_H) {
        hit = true;
        break;
      }
      if (mapGrid[mapY][mapX] === 1) hit = true;
    }

    const perpWallDist =
      side === 0
        ? (mapX - state.posX + (1 - stepX) / 2) / rayDirX
        : (mapY - state.posY + (1 - stepY) / 2) / rayDirY;

    const wallDist = Math.max(0.0001, perpWallDist);
    zBuffer[x] = wallDist;
    const lineHeight = Math.floor(height / wallDist);
    const drawStart = clamp(
      Math.floor(-lineHeight / 2 + horizon),
      0,
      height - 1,
    );
    const drawEnd = clamp(Math.floor(lineHeight / 2 + horizon), 0, height - 1);

    // Sky
    for (let y = 0; y < drawStart; y++) {
      const t = y / (height * 0.55);
      const r = Math.floor(skyTop[0] + (skyBottom[0] - skyTop[0]) * t);
      const g = Math.floor(skyTop[1] + (skyBottom[1] - skyTop[1]) * t);
      const b = Math.floor(skyTop[2] + (skyBottom[2] - skyTop[2]) * t);
      const idx = (y * width + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }

    // Walls
    if (wallData) {
      const texW = wallData.width;
      const texH = wallData.height;
      let wallX;
      if (side === 0) {
        wallX = state.posY + wallDist * rayDirY;
      } else {
        wallX = state.posX + wallDist * rayDirX;
      }
      wallX -= Math.floor(wallX);
      const texX = Math.floor(wallX * texW);

      for (let y = drawStart; y <= drawEnd; y++) {
        const d = y * 2 - height + lineHeight;
        const texY = Math.floor((d * texH) / lineHeight / 2);
        const texIdx = (texY * texW + texX) * 4;
        const idx = (y * width + x) * 4;
        const shade = side === 1 ? 0.7 : 1.0;
        data[idx] = wallData.data[texIdx] * shade;
        data[idx + 1] = wallData.data[texIdx + 1] * shade;
        data[idx + 2] = wallData.data[texIdx + 2] * shade;
        data[idx + 3] = 255;
      }
    }

    // Floor
    if (asphaltData) {
      const texW = asphaltData.width;
      const texH = asphaltData.height;
      for (let y = drawEnd + 1; y < height; y++) {
        const rowDistance = (height - horizon) / (y - horizon);
        const floorX = state.posX + rowDistance * rayDirX;
        const floorY = state.posY + rowDistance * rayDirY;
        const tx = Math.floor((floorX - Math.floor(floorX)) * texW);
        const ty = Math.floor((floorY - Math.floor(floorY)) * texH);
        const texIdx = (ty * texW + tx) * 4;
        const idx = (y * width + x) * 4;
        const fog = clamp(1.2 - rowDistance * 0.15, 0.2, 1.0);
        let r = asphaltData.data[texIdx] * fog;
        let g = asphaltData.data[texIdx + 1] * fog;
        let b = asphaltData.data[texIdx + 2] * fog;
        const cellX = Math.floor(floorX);
        const cellY = Math.floor(floorY);
        if (isRampCell(cellX, cellY)) {
          r = r * 0.6 + 80;
          g = g * 0.6 + 110;
          b = b * 0.6 + 160;
        }
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);

  drawDoor(zBuffer, width, height, dirX, dirY, planeX, planeY);
  drawSprites(zBuffer, width, height, dirX, dirY, planeX, planeY);
  drawEnemyProjectiles(zBuffer, width, height, dirX, dirY, planeX, planeY);
  drawShotEffect(width, height);
  drawWeapon(width, height);
  drawOutEffects(width, height);
  drawCrosshair(width, height);
}

function drawSprites(zBuffer, width, height, dirX, dirY, planeX, planeY) {
  if (!enemyWalkSprite || !enemyWalkFrames) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const invDet = 1.0 / (planeX * dirY - dirX * planeY);
  const ordered = enemies
    .filter((enemy) => enemy.alive)
    .map((enemy) => ({
      enemy,
      dx: enemy.x - state.posX,
      dy: enemy.y - state.posY,
      dist: (enemy.x - state.posX) ** 2 + (enemy.y - state.posY) ** 2,
    }))
    .sort((a, b) => b.dist - a.dist);

  for (const item of ordered) {
    const spriteX = item.dx;
    const spriteY = item.dy;
    const transformX = invDet * (dirY * spriteX - dirX * spriteY);
    const transformY = invDet * (-planeY * spriteX + planeX * spriteY);
    if (transformY <= 0.2) continue;

    const spriteScreenX = Math.floor(
      (width / 2) * (1 + transformX / transformY),
    );
    const sheet = getEnemySheet(item.enemy);
    if (!sheet) continue;
    const frame = sheet.frames[sheet.frameIndex] || sheet.frames[0];
    const frameW = frame.w;
    const frameH = sheet.frameH;
    const spriteH = Math.abs(height / transformY) * 0.8;
    const spriteW = spriteH * (frameW / frameH);
    const drawStartY = clamp(
      Math.floor(-spriteH / 2 + height / 2),
      0,
      height - 1,
    );
    const drawEndY = clamp(Math.floor(spriteH / 2 + height / 2), 0, height - 1);
    const drawStartX = clamp(
      Math.floor(-spriteW / 2 + spriteScreenX),
      0,
      width - 1,
    );
    const drawEndX = clamp(
      Math.floor(spriteW / 2 + spriteScreenX),
      0,
      width - 1,
    );

    for (let stripe = drawStartX; stripe < drawEndX; stripe++) {
      if (transformY >= zBuffer[stripe]) continue;
      const texX = Math.floor(
        ((stripe - (-spriteW / 2 + spriteScreenX)) * frameW) / spriteW,
      );
      ctx.drawImage(
        sheet.image,
        frame.x + texX,
        0,
        1,
        frameH,
        stripe,
        drawStartY,
        1,
        drawEndY - drawStartY,
      );
    }
  }
}

function drawDoor(zBuffer, width, height, dirX, dirY, planeX, planeY) {
  if (!door || !doorSprite || !doorFrames || door.floor !== currentFloor)
    return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const invDet = 1.0 / (planeX * dirY - dirX * planeY);
  const spriteX = door.x - state.posX;
  const spriteY = door.y - state.posY;
  const transformX = invDet * (dirY * spriteX - dirX * spriteY);
  const transformY = invDet * (-planeY * spriteX + planeX * spriteY);
  if (transformY <= 0.2) return;

  const spriteScreenX = Math.floor((width / 2) * (1 + transformX / transformY));
  const frameIndex = door.open ? 1 : 0;
  const frame = doorFrames[frameIndex] || doorFrames[0];
  const frameW = frame.w;
  const frameH = doorFrameH;
  const spriteH = Math.abs(height / transformY);
  const spriteW = spriteH * (frameW / frameH);
  const drawStartY = clamp(
    Math.floor(-spriteH / 2 + height / 2),
    0,
    height - 1,
  );
  const drawEndY = clamp(Math.floor(spriteH / 2 + height / 2), 0, height - 1);
  const drawStartX = clamp(
    Math.floor(-spriteW / 2 + spriteScreenX),
    0,
    width - 1,
  );
  const drawEndX = clamp(Math.floor(spriteW / 2 + spriteScreenX), 0, width - 1);

  for (let stripe = drawStartX; stripe < drawEndX; stripe++) {
    if (transformY >= zBuffer[stripe]) continue;
    const texX = Math.floor(
      ((stripe - (-spriteW / 2 + spriteScreenX)) * frameW) / spriteW,
    );
    ctx.drawImage(
      doorSprite,
      frame.x + texX,
      0,
      1,
      frameH,
      stripe,
      drawStartY,
      1,
      drawEndY - drawStartY,
    );
    zBuffer[stripe] = Math.min(zBuffer[stripe], transformY);
  }
}

function getEnemySheet(enemy) {
  if (enemy.state === "dying" && enemyDyingSprite && enemyDyingFrames) {
    return {
      image: enemyDyingSprite,
      frames: enemyDyingFrames,
      frameH: enemyDyingFrameH,
      frameIndex: Math.min(enemy.frameIndex, enemyDyingFrames.length - 1),
    };
  }
  if (enemy.state === "damaged" && enemyDamagedSprite && enemyDamagedFrames) {
    return {
      image: enemyDamagedSprite,
      frames: enemyDamagedFrames,
      frameH: enemyDamagedFrameH,
      frameIndex: 0,
    };
  }
  if (enemy.state === "fire" && enemyFireSprite && enemyFireFrames) {
    return {
      image: enemyFireSprite,
      frames: enemyFireFrames,
      frameH: enemyFireFrameH,
      frameIndex: Math.min(enemy.frameIndex, enemyFireFrames.length - 1),
    };
  }
  return {
    image: enemyWalkSprite,
    frames: enemyWalkFrames,
    frameH: enemyWalkFrameH,
    frameIndex: enemy.frameIndex % enemyWalkFrames.length,
  };
}

function drawEnemyProjectiles(
  zBuffer,
  width,
  height,
  dirX,
  dirY,
  planeX,
  planeY,
) {
  if (enemyProjectiles.length === 0) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const invDet = 1.0 / (planeX * dirY - dirX * planeY);
  ctx.fillStyle = "rgba(255, 160, 80, 0.9)";
  for (const proj of enemyProjectiles) {
    const spriteX = proj.x - state.posX;
    const spriteY = proj.y - state.posY;
    const transformX = invDet * (dirY * spriteX - dirX * spriteY);
    const transformY = invDet * (-planeY * spriteX + planeX * spriteY);
    if (transformY <= 0.2) continue;
    const screenX = Math.floor((width / 2) * (1 + transformX / transformY));
    if (screenX < 0 || screenX >= width) continue;
    if (transformY >= zBuffer[screenX]) continue;
    const size = clamp((height / transformY) * 0.1, 6, 32);
    const screenY = Math.floor(height / 2);
    ctx.beginPath();
    ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWeapon(width, height) {
  const rect = getWeaponDrawRect(width, height);
  if (!rect) return;
  const { frameW, frameH, srcX, drawW, drawH, drawX, drawY } = rect;
  ctx.drawImage(
    weaponSprite,
    srcX,
    0,
    frameW,
    frameH,
    drawX,
    drawY,
    drawW,
    drawH,
  );
}

function drawShotEffect(width, height) {
  if (!shotSprite || state.shotTimer <= 0) return;
  const rect = getWeaponDrawRect(width, height);
  if (!rect) return;
  const scale = renderSettings.scale;
  const muzzleX = rect.drawX + rect.drawW * 0.78 - 179 * scale;
  const muzzleY = rect.drawY + rect.drawH * 0.26 + 228 * scale;
  const shotW = rect.drawW * 0.35 * 3;
  const shotH = (shotSprite.height / shotSprite.width) * shotW;
  ctx.drawImage(
    shotSprite,
    muzzleX - shotW * 0.2,
    muzzleY - shotH * 0.5,
    shotW,
    shotH,
  );
}

function drawOutEffects() {
  if (!outSprite || !outFrames || !outFrameH) return;
  for (const effect of outEffects) {
    const frame = outFrames[effect.frameIndex];
    if (!frame) continue;
    const w = frame.w;
    const h = outFrameH;
    const scale = 0.6 * 3 * 2;
    const drawW = w * scale;
    const drawH = h * scale;
    ctx.save();
    ctx.translate(effect.x, effect.y);
    ctx.rotate(effect.angle);
    ctx.drawImage(
      outSprite,
      frame.x,
      0,
      frame.w,
      outFrameH,
      -drawW / 2,
      -drawH / 2,
      drawW,
      drawH,
    );
    ctx.restore();
  }
}

function drawCrosshair(width, height) {
  ctx.strokeStyle = "rgba(240, 230, 214, 0.9)";
  ctx.lineWidth = 2;
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy);
  ctx.lineTo(cx - 3, cy);
  ctx.moveTo(cx + 3, cy);
  ctx.lineTo(cx + 10, cy);
  ctx.moveTo(cx, cy - 10);
  ctx.lineTo(cx, cy - 3);
  ctx.moveTo(cx, cy + 3);
  ctx.lineTo(cx, cy + 10);
  ctx.stroke();
}

function frame(now) {
  const dt = Math.min(0.05, (now - state.lastTime) / 1000);
  state.lastTime = now;
  update(dt);
  render();
  drawMiniMap();

  hpEl.textContent = `HP: ${state.health}`;
  killsEl.textContent = `Kills: ${state.kills}`;
  if (levelEl) levelEl.textContent = `Level: ${state.level}`;
  if (floorEl) floorEl.textContent = `Floor: ${currentFloor + 1}`;
  if (scoreEl) scoreEl.textContent = `Score: ${state.score}`;

  state.fpsFrames += 1;
  if (now - state.fpsTime > 500) {
    const fps = Math.round((state.fpsFrames * 1000) / (now - state.fpsTime));
    fpsEl.textContent = `FPS: ${fps}`;
    state.fpsFrames = 0;
    state.fpsTime = now;
  }

  requestAnimationFrame(frame);
}

function handlePlayerDeath() {
  state.health = 0;
  state.alive = false;
  const currentScore = Math.max(0, Math.floor(state.score));
  if (finalScoreEl) finalScoreEl.textContent = String(currentScore);
  const prevHigh = Number.parseInt(localStorage.getItem("highScore"), 10);
  const best = Number.isFinite(prevHigh)
    ? Math.max(prevHigh, currentScore)
    : currentScore;
  localStorage.setItem("highScore", String(best));
  if (highScoreEl) highScoreEl.textContent = String(best);
  noticeEl.hidden = false;
}

function drawMiniMap() {
  if (!minimapCtx || WORLD_W === 0 || WORLD_H === 0) return;
  const canvasW = minimap.width;
  const canvasH = minimap.height;
  const size = Math.min(canvasW, canvasH);
  const cellSize = Math.max(
    1,
    Math.floor((size - 16) / Math.max(WORLD_W, WORLD_H)),
  );
  const mapW = cellSize * WORLD_W;
  const mapH = cellSize * WORLD_H;
  const offsetX = Math.floor((canvasW - mapW) / 2);
  const offsetY = Math.floor((canvasH - mapH) / 2);

  minimapCtx.clearRect(0, 0, canvasW, canvasH);
  minimapCtx.fillStyle = "rgba(8, 12, 18, 0.85)";
  minimapCtx.fillRect(0, 0, canvasW, canvasH);

  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      if (mapGrid[y][x] === 1) {
        minimapCtx.fillStyle = "#1e2430";
      } else {
        minimapCtx.fillStyle = "#0c1119";
      }
      minimapCtx.fillRect(
        offsetX + x * cellSize,
        offsetY + y * cellSize,
        cellSize,
        cellSize,
      );
    }
  }

  if (door && door.floor === currentFloor) {
    const doorX = offsetX + Math.floor(door.x) * cellSize;
    const doorY = offsetY + Math.floor(door.y) * cellSize;
    minimapCtx.fillStyle = door.open ? "#6fdc8c" : "#c7a26b";
    minimapCtx.fillRect(doorX, doorY, cellSize, cellSize);
    minimapCtx.fillStyle = "#0b1119";
    minimapCtx.font = `${Math.max(8, Math.floor(cellSize * 0.7))}px "Space Grotesk", sans-serif`;
    minimapCtx.textAlign = "center";
    minimapCtx.textBaseline = "middle";
    minimapCtx.fillText("E", doorX + cellSize / 2, doorY + cellSize / 2);
  }

  const floor = floors[currentFloor];
  if (floor) {
    minimapCtx.fillStyle = "#6bb7ff";
    if (floor.rampUp) {
      minimapCtx.fillRect(
        offsetX + floor.rampUp.x * cellSize,
        offsetY + floor.rampUp.y * cellSize,
        cellSize,
        cellSize,
      );
    }
    if (floor.rampDown) {
      minimapCtx.fillRect(
        offsetX + floor.rampDown.x * cellSize,
        offsetY + floor.rampDown.y * cellSize,
        cellSize,
        cellSize,
      );
    }
    minimapCtx.fillStyle = "#e6f0ff";
    minimapCtx.font = `${Math.max(8, Math.floor(cellSize * 0.7))}px "Space Grotesk", sans-serif`;
    minimapCtx.textAlign = "center";
    minimapCtx.textBaseline = "middle";
    if (floor.rampUp) {
      minimapCtx.fillText(
        "U",
        offsetX + floor.rampUp.x * cellSize + cellSize / 2,
        offsetY + floor.rampUp.y * cellSize + cellSize / 2,
      );
    }
    if (floor.rampDown) {
      minimapCtx.fillText(
        "D",
        offsetX + floor.rampDown.x * cellSize + cellSize / 2,
        offsetY + floor.rampDown.y * cellSize + cellSize / 2,
      );
    }
  }

  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    minimapCtx.fillStyle = "#d35c4a";
    minimapCtx.fillRect(
      offsetX + Math.floor(enemy.x) * cellSize + cellSize * 0.2,
      offsetY + Math.floor(enemy.y) * cellSize + cellSize * 0.2,
      cellSize * 0.6,
      cellSize * 0.6,
    );
  }

  const px = offsetX + state.posX * cellSize;
  const py = offsetY + state.posY * cellSize;
  minimapCtx.fillStyle = "#ff8a3d";
  minimapCtx.beginPath();
  minimapCtx.arc(px, py, Math.max(2, cellSize * 0.3), 0, Math.PI * 2);
  minimapCtx.fill();

  const dx = Math.cos(state.dir) * cellSize * 0.8;
  const dy = Math.sin(state.dir) * cellSize * 0.8;
  minimapCtx.strokeStyle = "#ff8a3d";
  minimapCtx.lineWidth = Math.max(1, cellSize * 0.15);
  minimapCtx.beginPath();
  minimapCtx.moveTo(px, py);
  minimapCtx.lineTo(px + dx, py + dy);
  minimapCtx.stroke();
}

window.addEventListener("keydown", (event) => state.keys.add(event.code));
window.addEventListener("keyup", (event) => state.keys.delete(event.code));

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") state.firePressed = true;
  if (event.code === "KeyR" && !state.alive) resetGame();
  if (event.code === "KeyT") teleportToDoor();
  if (event.code === "KeyY") killAllEnemies();
  if (event.code === "KeyU") killPlayer();
  if (event.code === "KeyQ") toggleMinimap();
});

window.addEventListener("keyup", (event) => {
  if (event.code === "Space") state.firePressed = false;
});

window.addEventListener("mousedown", () => {
  state.firePressed = true;
});

window.addEventListener("mouseup", () => {
  state.firePressed = false;
});

function toggleMinimap() {
  if (!minimap) return;
  minimapState.fullscreen = !minimapState.fullscreen;
  minimap.classList.toggle("fullscreen", minimapState.fullscreen);
  resizeMinimap();
}

function teleportToDoor() {
  if (!door) return;
  const offsets = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: -1 },
  ];
  for (const offset of offsets) {
    const nx = door.x + offset.x;
    const ny = door.y + offset.y;
    if (!isBlocked(nx, ny)) {
      state.posX = nx;
      state.posY = ny;
      return;
    }
  }
  state.posX = door.x;
  state.posY = door.y;
}

function killAllEnemies() {
  for (const floor of floors) {
    for (const enemy of floor.enemies) {
      if (!enemy.alive) continue;
      enemy.health = 0;
      enemy.state = "dying";
      enemy.frameIndex = 0;
      enemy.frameTimer = enemyAnim.dyingFrameDuration;
      enemy.didShoot = false;
      if (!enemy.countedKill) {
        state.kills += 1;
        awardScore(100);
        enemy.countedKill = true;
      }
    }
  }
}

function killPlayer() {
  handlePlayerDeath();
}

Promise.all([
  loadImage(asphalt, "res/asphalt_texture.jpg"),
  loadImage(wallTex, "res/building_texture.jpg"),
  loadImage(enemyWalkTex, "res/EnemyWalk.png"),
  loadImage(enemyFireTex, "res/EnemyFire.png"),
  loadImage(enemyDamagedTex, "res/EnemyDamaged.png"),
  loadImage(enemyDyingTex, "res/EnemyDying.png"),
  loadImage(doorTex, "res/nextleveldoor.png"),
  loadImage(weaponTex, "res/Weapons Doom Alpha.png"),
  loadImage(shotTex, "res/ShotEffect.png"),
  loadImage(outTex, "res/OutEffects.png"),
]).then((results) => {
  const [
    asphaltOk,
    wallOk,
    walkOk,
    fireOk,
    damagedOk,
    dyingOk,
    doorOk,
    weaponOk,
    shotOk,
    outOk,
  ] = results;
  if (
    !asphaltOk ||
    !wallOk ||
    !walkOk ||
    !fireOk ||
    !damagedOk ||
    !dyingOk ||
    !doorOk ||
    !weaponOk ||
    !shotOk ||
    !outOk
  ) {
    console.warn("Some textures failed to load.");
  }
  asphaltData = imageToData(asphalt);
  wallData = imageToData(wallTex);
  enemyWalkSprite = applyChromaKey(enemyWalkTex, { r: 0, g: 255, b: 255 }, 4);
  enemyFireSprite = applyChromaKey(enemyFireTex, { r: 0, g: 255, b: 255 }, 4);
  enemyDamagedSprite = applyChromaKey(
    enemyDamagedTex,
    { r: 0, g: 255, b: 255 },
    4,
  );
  enemyDyingSprite = applyChromaKey(enemyDyingTex, { r: 0, g: 255, b: 255 }, 4);
  doorSprite = applyChromaKey(doorTex, { r: 0, g: 255, b: 255 }, 4);
  weaponSprite = applyChromaKey(weaponTex, { r: 0, g: 255, b: 255 }, 4);
  shotSprite = applyChromaKey(shotTex, { r: 0, g: 255, b: 255 }, 4);
  outSprite = applyChromaKey(outTex, { r: 0, g: 255, b: 255 }, 4);

  const walkParsed = parseWeaponFrames(enemyWalkTex);
  if (walkParsed) {
    enemyWalkFrames = walkParsed.frames;
    enemyWalkFrameH = walkParsed.frameH;
    clearMarkerRow(enemyWalkSprite);
  }
  const fireParsed = parseWeaponFrames(enemyFireTex);
  if (fireParsed) {
    enemyFireFrames = fireParsed.frames;
    enemyFireFrameH = fireParsed.frameH;
    clearMarkerRow(enemyFireSprite);
  }
  const damagedParsed = parseWeaponFrames(enemyDamagedTex);
  if (damagedParsed) {
    enemyDamagedFrames = damagedParsed.frames;
    enemyDamagedFrameH = damagedParsed.frameH;
    clearMarkerRow(enemyDamagedSprite);
  }
  const dyingParsed = parseWeaponFrames(enemyDyingTex);
  if (dyingParsed) {
    enemyDyingFrames = dyingParsed.frames;
    enemyDyingFrameH = dyingParsed.frameH;
    clearMarkerRow(enemyDyingSprite);
  }

  const doorParsed = parseWeaponFrames(doorTex);
  if (doorParsed) {
    doorFrames = doorParsed.frames;
    doorFrameH = doorParsed.frameH;
    clearMarkerRow(doorSprite);
  }

  const parsed = parseWeaponFrames(weaponTex);
  if (parsed) {
    weaponFrames = parsed.frames;
    weaponFrameH = parsed.frameH;
    clearMarkerRow(weaponSprite);
  }
  const outParsed = parseWeaponFrames(outTex);
  if (outParsed) {
    outFrames = outParsed.frames;
    outFrameH = outParsed.frameH;
    clearMarkerRow(outSprite);
  }
  weaponFrame = spriteFrameFor(weaponSprite);
  if (!weaponFrameH) weaponFrameH = weaponFrame.frameH;
  if (!enemyWalkFrames) {
    const fallback = spriteFrameFor(enemyWalkSprite);
    enemyWalkFrames = [{ x: 0, w: fallback.frameW }];
    enemyWalkFrameH = fallback.frameH;
  }
  if (!enemyFireFrames) {
    const fallback = spriteFrameFor(enemyFireSprite);
    enemyFireFrames = [{ x: 0, w: fallback.frameW }];
    enemyFireFrameH = fallback.frameH;
  }
  if (!enemyDamagedFrames) {
    const fallback = spriteFrameFor(enemyDamagedSprite);
    enemyDamagedFrames = [{ x: 0, w: fallback.frameW }];
    enemyDamagedFrameH = fallback.frameH;
  }
  if (!enemyDyingFrames) {
    const fallback = spriteFrameFor(enemyDyingSprite);
    enemyDyingFrames = [{ x: 0, w: fallback.frameW }];
    enemyDyingFrameH = fallback.frameH;
  }
  if (!doorFrames) {
    const fallback = spriteFrameFor(doorSprite);
    doorFrames = [{ x: 0, w: fallback.frameW }];
    doorFrameH = fallback.frameH;
  }
  setupPointerLock();
  resetGame();
  requestAnimationFrame(frame);
});
