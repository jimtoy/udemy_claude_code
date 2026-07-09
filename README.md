# Arena Strike — 3D FPS 

A browser-based first-person arena shooter built with Three.js. Face off against an AI combat drone in a enclosed arena.

## Controls

| Key | Action |
|-----|--------|
| ↑ | Move forward |
| ↓ | Move backward |
| ← | Turn left |
| → | Turn right |
| Space | Shoot |

## Run locally

Serve the folder with any static file server, then open in a browser:

```bash
npx serve .
```

Or open `index.html` directly (ES modules may require a local server in some browsers).

## Gameplay

- Destroy the red combat drone before it destroys you.
- Use pillars for cover — the enemy needs line of sight to shoot.
- Each shot deals 12 damage; both you and the enemy start with 100 health.
