# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step. Open `index.html` directly in a browser, or serve it with any static file server:

```sh
python3 -m http.server
# or
npx serve .
```

There are no tests, no linter, and no package.json.

## Architecture

Everything lives in three files: `index.html`, `style.css`, and `script.js`. All game logic is in `script.js` (~2000 lines, no modules or imports).

### Core systems

**Raycasting renderer** (`render()`) — DDA algorithm. Writes pixels directly into a `Float32Array`-backed `ImageData` buffer (`renderSettings.data`) for walls, floor, and sky, then calls `ctx.putImageData`. Sprites and the weapon are drawn on top via `ctx.drawImage` in a second pass. `renderSettings.zBuffer` (Float32Array, one entry per column) gates sprite overdraw.

**Multi-floor world** — `floors[]` is an array of `{ grid, rooms, enemies, rampUp, rampDown }`. `currentFloor` is the active index. `setCurrentFloor()` swaps `mapGrid`, `enemies`, and `WORLD_W/H` in place. Ramp cells are visually tinted blue on the floor texture. `getReachableCellsByFloor()` does a BFS across floors via ramp connections to cull unreachable enemy spawns.

**Procedural generation** (`generateLevel()`) — `generateMaze()` runs a recursive-backtracker DDA maze, then `carveRooms()` punches rectangular rooms into it, and `connectRooms()` carves straight corridors from each room outward until it hits another open cell. Door placement is the cell farthest from the ramp on the top floor (`findFarthestCell()`). Level size and floor count grow with `state.level`.

**Sprite frame parsing** (`parseWeaponFrames()`) — sprite sheets encode frame boundaries using a bottom-row white pixel marker. Non-white runs in the last row define `{ x, w }` frame slices. After parsing, `clearMarkerRow()` erases that row. Cyan (#00FFFF) is the chroma-key color for transparency across all sprites; `applyChromaKey()` sets alpha=0 for matching pixels.

**Enemy AI** (`updateEnemies()`) — per-enemy state machine: `walk → fire → walk` (ranged attack) or `walk → damaged → walk` or `walk → dying`. `hasLineOfSight()` raycasts in 0.15-unit steps. Enemies outside line of sight wander randomly; within range they path directly toward the player.

**Game loop** — `requestAnimationFrame` driven, dt capped at 50 ms. HUD elements are updated each frame by direct DOM text assignment.

### Key globals

| Variable | Purpose |
|---|---|
| `state` | Player position, direction, health, input keys, animation timers |
| `renderSettings` | Canvas dimensions, `imageData`, `zBuffer`, render scale |
| `floors[]` | All floor data; `enemies` on each floor are separate arrays |
| `enemies` | Alias for `floors[currentFloor].enemies` — reassigned by `setCurrentFloor()` |
| `door` | Single exit door with `{ x, y, open, floor }` |
| `mapGrid` / `WORLD_W` / `WORLD_H` | Active floor's collision grid |

### Debug hotkeys (in-game)

- **T** — teleport player next to the door
- **Y** — instantly kill all enemies on all floors
- **U** — kill the player
- **Q** — toggle fullscreen minimap

`localStorage` persists `renderScale` and `highScore` between sessions.
