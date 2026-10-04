# Strafe

A browser prototype that mixes Mirror's Edge parkour with CS surf and bhop movement.

- `dist/index.html` is the built, self-contained game (Three.js r128 from cdnjs).
- `src/physics.js` is the movement core: Source `CGameMovement` ground friction, accelerate,
  air accelerate with the 30 u/s air cap, `TryPlayerMove` clip-plane sliding, step moves, and
  Quake 3 style box-vs-brush sweeps with bevel planes. 100 tick fixed timestep, interpolated rendering.
  The Mirror's Edge layer (slide, wallrun, wall climb, climb kick with 180° turn, mantle, vault) sits on top.
- `src/map.js` builds the hub, a nine-station tutorial (one mechanic per station, with hint cards and a speed gate for air strafing) and ten levels: Surf, Bhop, Rooftops (a long beginner parkour run that turns three corners), Canyon (V-gorge surf), Stairway (turning bhop), Crossover (all mechanics in one run), and four long advanced levels: Downtown (a city parkour run through an office and along a crane), Cascade (nine-ramp surf with sideways transfers), Spire (small-block bhop with island-free corners) and Freerun (a full rooftop parkour run). It also builds the Gauntlet, a separate numbered set of six mixed levels (Lift, Drift, Sidewinder, Undertow, Freefall, Terminal), each harder than the last, made by `gauntlet()` from pads, bhop block lines and surf ramps: blocks shrink, ramps steepen, transfers widen and checkpoints thin out as the set goes on. Rooftops and Downtown are laid out with `cityKit`, which places pieces in per-leg frames so a run can turn corners and fills the skyline around the route.
- `src/audio.js` synthesizes all sound with Web Audio: footsteps, jumps, landings, wind/surf/slide loops tied to speed, and a generative score whose filter opens up with speed.
- `src/game.js` is rendering, input (pointer lock, CS sensitivity scale), HUD, timers and the menus: a title screen (Story, Play, Tutorial, Free roam, Settings, Controls; it doubles as the pause menu) over a flythrough that cycles the levels, and a level select screen behind Play.

Play: open `dist/index.html` in a browser (it loads Three.js from cdnjs, so it needs a connection). No install step; Node is only needed to build and run the tests.

Build: `node build.js` writes `dist/index.html`.
Tests: `node test/sim.js` (movement checks), `node test/surfrun.js` (bot surfs the whole surf course),
`node test/w2w.js` (bot chains the rooftop wall-to-wall section), `node test/levels.js` (bots finish Canyon, Crossover and Stairway), `node test/tutorial.js` (bot clears every tutorial station), `node test/advanced.js [level] [checkpoint]` (bots finish Cascade, Spire and Freerun). `node test/city.js [level] [checkpoint]` (bots finish Rooftops and Downtown). `node test/gauntlet.js [level] [checkpoint]` (one plan-reading bot finishes all six Gauntlet levels).

Default tuning matches CS:GO surf/KZ servers: gravity 800, maxspeed 250, accelerate 5.5,
airaccelerate 150, friction 5.2, stopspeed 80, jump height 57. All of it lives in `DEFAULTS` in `src/physics.js`.

Ghost replay: every run is sampled every 4 ticks; a new best (or the first finish on a level with no ghost yet) is stored in localStorage (`strafe.ghost.v1.<level>`) and replays as a see-through runner with a marker that shows through walls, plus a live "Ghost +/-s" gap under the timer. Toggle it in Settings. `__strafe.step` and `__strafe.ghost` are exposed for browser tests.

Story mode: the Story button in the menu opens a courier campaign (a prologue on the tutorial plus ten jobs, one per level) with briefings, debriefs and up to three stars per job for beating time targets. Jobs unlock in order; progress is in localStorage (`strafe.story.v1`). The jobs and targets are `STORY` in `src/game.js`.

Online leaderboard: inside claude.ai the published game uses the artifact `db` and `user` capabilities. Each player's best per level is one shared document, `times/<their id>`, that only they can write (rules: `times` read view / write owner, `times/{self}` write interact); level select shows the top ten per level with names from the viewer's claude.ai profile, and the finish screen shows your online rank. Only runs at the standard air acceleration (150) are posted, local bests are uploaded once, and outside claude.ai the board is hidden.
