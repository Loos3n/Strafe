# Strafe

A browser prototype that mixes Mirror's Edge parkour with CS surf and bhop movement.

- `dist/index.html` is the built, self-contained game (Three.js r128 from cdnjs).
- `src/physics.js` is the movement core: Source `CGameMovement` ground friction, accelerate,
  air accelerate with the 30 u/s air cap, `TryPlayerMove` clip-plane sliding, step moves, and
  Quake 3 style box-vs-brush sweeps with bevel planes. 100 tick fixed timestep, interpolated rendering.
  The Mirror's Edge layer (slide, wallrun, wall climb, climb kick with 180° turn, mantle, vault) sits on top.
- `src/map.js` builds a nine-station tutorial (one mechanic per station, with hint cards and a speed gate for air strafing) and ten levels: Surf (ten ramps over water round three corners), Bhop (block lines, islands and speed lanes over lava), Rooftops (a long beginner parkour run that turns three corners), Canyon (eleven alternating gorge banks), Stairway (climbing and falling block stairs round four corners), Crossover (slide, surf, bhop, wallrun and mantle, twice), and four long advanced levels: Downtown (a city parkour run through an office and along a crane), Cascade (thirteen narrow ramps that switch sides across wide gaps, with two climbs and checkpoints that drop you in from high ledges), Spire (small-block bhop with island-free corners) and Freerun (a full rooftop parkour run). It also builds the Gauntlet, a separate numbered set of six mixed levels (Lift, Drift, Sidewinder, Undertow, Freefall, Terminal), each harder than the last, made by `gauntlet()` from pads, bhop block lines and surf ramps: blocks shrink, ramps steepen, transfers widen and checkpoints thin out as the set goes on. Rooftops and Downtown are laid out with `cityKit`, which places pieces in per-leg frames so a run can turn corners and fills the skyline around the route. Surf, Bhop, Canyon, Stairway and Crossover are long turning routes built by `routeKit` from pads, corner pads, speed lanes, bhop block lines, surf ramps, gorge banks, slide roofs and wallrun billboards.
- `src/audio.js` synthesizes all sound with Web Audio: footsteps, jumps, landings, wind/surf/slide loops tied to speed, and a generative score whose filter opens up with speed.
- `src/game.js` is rendering, input (pointer lock, CS sensitivity scale), HUD, timers and the menus: a title screen (Story, Play, Tutorial, Settings, Controls; it doubles as the pause menu) over a flythrough that cycles the levels, and a level select screen behind Play.

Play: open `dist/index.html` in a browser (it loads Three.js from cdnjs, so it needs a connection). No install step; Node is only needed to build and run the tests.

Build: `node build.js` writes `dist/index.html`.
Tests: `node test/sim.js` (movement checks),
`node test/w2w.js` (bot chains the rooftop wall-to-wall section), `node test/routes.js [level] [checkpoint]` (one bot finishes Surf, Bhop, Canyon, Stairway and Crossover from the start and every checkpoint), `node test/tutorial.js` (bot clears every tutorial station), `node test/advanced.js [level] [checkpoint]` (bots finish Cascade, Spire and Freerun). `node test/city.js [level] [checkpoint]` (bots finish Rooftops and Downtown). `node test/gauntlet.js [level] [checkpoint]` (one plan-reading bot finishes all six Gauntlet levels).

Polish: speed lines streak past the screen edges above about 450 u/s, hard landings nod and jolt the camera, footsteps and landings sound different on concrete, metal, wooden blocks, tiled pads and gravel (`SURFACE` in `src/game.js`, `step` in `src/audio.js`), and Settings has speed lines and landing kick toggles plus a Performance group (render scale 50 to 100%, frame rate counter).

Wallrun sound: catching a wall plays a shoe squeak, palm slap and thump, and the run itself is a scuffing loop that rises in pitch as the wallrun goes on. Mantle boost: a mantle you come into below 150 u/s (speed just before hitting the ledge) pops you out at `mantleExitMin` (280), easing back to the old 200 floor by 250 u/s; faster mantles are unchanged.

Default tuning matches CS:GO surf/KZ servers: gravity 800, maxspeed 250, accelerate 5.5,
airaccelerate 150, friction 5.2, stopspeed 80, jump height 57. All of it lives in `DEFAULTS` in `src/physics.js`.

Ghost replay: every run is sampled every 4 ticks; a new best (or the first finish on a level with no ghost yet) is stored in localStorage (`strafe.ghost.v1.<level>`) and replays as a see-through runner with a marker that shows through walls, plus a live "Ghost +/-s" gap under the timer. Toggle it in Settings. `__strafe.step` and `__strafe.ghost` are exposed for browser tests.

Story mode: the Story button in the menu opens a courier campaign (a prologue on the tutorial plus ten jobs, one per level) with briefings, debriefs and up to three stars per job for beating time targets. Jobs unlock in order; progress is in localStorage (`strafe.story.v1`). When the five route levels were rebuilt, local bests, splits and ghosts for them were cleared once (`strafe.rebuild.v2`); when the surf in Surf, Canyon, Crossover and Cascade was made harder they were cleared again (`strafe.rebuild.v3`). The jobs and targets are `STORY` in `src/game.js`.

Cosmetics: story stars unlock eight runner skins (they recolour the first-person arms, legs and the ghost; Prism cycles colour) and eight trails (a camera-facing ribbon behind you and your ghost above 300 u/s). Pick them from Cosmetics on the title menu, where a small runner jogs a turntable wearing whatever you point at (locked items too; tap a locked one to keep it in the preview); the choice is saved in settings. They are `SKINS` and `TRAILS` in `src/game.js`.

Online leaderboard: inside claude.ai the published game uses the artifact `db` and `user` capabilities. Each player's best per level is one shared document, `times/<their id>`, that only they can write (rules: `times` read view / write owner, `times/{self}` write interact); level select shows the top ten per level with names from the viewer's claude.ai profile, and the finish screen shows your online rank. Reworked levels post under new fields (`REBUILT` in `src/game.js`: `bhop_v2`, `surf_v3`, `cascade_v3` and so on) so old times drop off. Only runs at the standard air acceleration (150) are posted, local bests are uploaded once, and outside claude.ai the board is hidden.
