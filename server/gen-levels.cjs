// Writes src/levels.json: each level's start, finish and respawn points,
// keyed the way the board names levels, for the server's run checks.
// Run after changing a level: node server/gen-levels.cjs
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
require(path.join(root, 'src/physics.js')); require(path.join(root, 'src/map.js'));
const P = globalThis.StrafePhysics;
const { world, courses } = globalThis.StrafeMap.buildMap(P);
// reworked levels post under a new key, same as the game's lbKey
const game = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8');
const REBUILT = Function('return ' + game.match(/const REBUILT = (\{[^}]*\})/)[1])();
const box = (t) => [...t.min, ...t.max];
const out = {};
for (const [name, c] of Object.entries(courses)) {
  const tr = world.triggers.filter(t => t.course === name);
  const start = tr.find(t => t.type === 'start'), end = tr.find(t => t.type === 'end');
  if (!start || !end) continue;
  const spawns = [c.spawn].concat(tr.filter(t => t.spawn).map(t => t.spawn)).map(s => s.pos.map(Math.round));
  out[REBUILT[name] ? name + REBUILT[name] : name] = { name: c.name, start: box(start), end: box(end), spawns };
}
fs.writeFileSync(path.join(__dirname, 'src/levels.json'), JSON.stringify(out) + '\n');
console.log('levels', Object.keys(out).length);
