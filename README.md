# Strafe

Mirror's Edge parkour meets Counter-Strike surf and bhop, in your browser.

Run rooftops, wallrun billboards, slide under pipes, vault rails and ride ziplines, then carry that speed into surf ramps and bunnyhop lines. The movement is built on Source engine physics: real air strafing, surfing and bhopping, with a parkour layer on top.

**Play:** https://strafe-online.strafe-game.workers.dev (desktop, phone or controller; it installs as an app on phones)

## Features

- **32 levels** in five sets: the main levels, the Gauntlet, Night City, Harbor and Cableway, plus a guided tutorial and a story campaign
- **Endless mode**: a new course every day, the same for everyone, with its own leaderboard
- **Online leaderboards** with ghosts, and **live races** against friends
- **Daily and weekly challenges**
- **Level editor** with 22 piece types (ramps, bhop lines, ziplines, moving platforms and more). Publish your levels and play everyone else's
- **Replays**: watch any run with ghost data from a follow, first-person or free camera
- **Practice mode** with save states, checkpoint skipping and segment times
- **Medals, achievements and cosmetics** (runner skins and trails)
- Touch controls, gamepad support, key rebinding, colour-blind modes and graphics settings

## Controls

| Action | Keyboard and mouse | Controller |
| --- | --- | --- |
| Move | WASD | Left stick |
| Look | Mouse | Right stick |
| Jump | Space or mouse wheel | A or LB |
| Crouch, slide | Shift or C | B or LT |
| Back to checkpoint | F | X |
| Restart | R | View |
| Practice mode | P (Z save, X load) | |
| Menu | Esc | Menu |

Wallrun by jumping at a red wall while holding W. Air strafe by holding A or D in the air and turning the mouse the same way.

## Running it locally

Open `dist/index.html` in a browser. It loads Three.js from a CDN, so it needs a connection. Node is only needed to build and test.

```sh
node build.js          # builds dist/index.html from src/
node test/sim.js       # movement checks
node test/routes.js    # a bot finishes every route level from every checkpoint
```

The other bot tests in `test/` each cover a level set or a mechanic. They're slow, so run them in parallel.

## Project layout

| Path | What it is |
| --- | --- |
| `src/physics.js` | Movement: Source-style friction, acceleration, air strafing, surfing, collision, and the parkour moves |
| `src/map.js` | Every level, built from code with `routeKit`, `cityKit` and `gauntlet()` |
| `src/game.js` | Rendering, input, HUD, menus, editor, online features |
| `src/audio.js` | All sound, synthesized with Web Audio |
| `src/tutorial.js` | Tutorial goals |
| `server/` | Cloudflare Worker for leaderboards, races and community levels. It also hosts the game |
| `desktop/` | Electron wrapper for Windows, macOS and Linux |
| `assets/` | 3D models, inlined into the page at build time |
| `docs/NOTES.md` | Detailed notes on how each system works |

## Credits

- City models: [KayKit City Builder Bits](https://kaylousberg.itch.io/city-builder-bits) by Kay Lousberg (CC0)
- Runner model and animations: [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) by Quaternius (CC0)
- Fallback runner: X Bot from the three.js examples (Mixamo)
- Rendering: [three.js](https://threejs.org) r128 (MIT)

Licences for the models are in `assets/`.
