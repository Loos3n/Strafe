// Preload for the bot tests: records each bot run the way the game records
// a ghost and runs the server's checks on it.
//   node -r ./server/test/record.cjs test/routes.js
const path = require('path');
require(path.join(__dirname, '../../src/physics.js'));
const P = globalThis.StrafePhysics;
const levels = require('../src/levels.json');
const game = require('fs').readFileSync(path.join(__dirname, '../../src/game.js'), 'utf8');
const REBUILT = Function('return ' + game.match(/const REBUILT = (\{[^}]*\})/)[1])();
const key = (c) => REBUILT[c] ? c + REBUILT[c] : c;
const results = globalThis.__checks = [];
let checkRun;
const ready = import('../src/check.js').then(m => { checkRun = m.checkRun; });
const pending = [];
// a bot starting over from a checkpoint is a new attempt, not a respawn
const recs = new WeakMap(); // not a property, so a cloned player starts fresh
const reset = P.Player.prototype.reset;
P.Player.prototype.reset = function (...a) { const r = recs.get(this); if (r) r.run = null; return reset.apply(this, a); };
const tick = P.Player.prototype.tick;
P.Player.prototype.tick = function (cmd, dt) {
  tick.call(this, cmd, dt);
  let r = recs.get(this);
  if (!r) recs.set(this, r = { inStart: false, run: null });
  let inStart = false, end = null;
  for (const t of this.triggersTouching()) { if (t.type === 'start') inStart = t.course; if (t.type === 'end') end = t.course; }
  if (r.run) {
    r.run.off++;
    if (r.run.off % 4 === 0) r.run.s.push(...this.pos.map(Math.round), 0, 0);
    if (end === r.run.course) { pending.push({ course: r.run.course, ticks: r.run.off, ghost: { e: 4, s: r.run.s } }); r.run = null; }
  }
  if (inStart) r.run = null;
  else if (r.inStart) r.run = { course: r.inStart, off: 0, s: [...this.pos.map(Math.round), 0, 0] };
  r.inStart = inStart;
};
const exit = process.exit;
process.exit = (code) => {
  ready.then(() => {
    let bad = 0;
    for (const p of pending) {
      const err = checkRun(levels[key(p.course)], p.ticks, p.ghost);
      if (err) bad++;
      console.log('[server check]', p.course, (p.ticks / 100).toFixed(2) + 's', err ? 'REJECTED: ' + err : 'accepted');
    }
    if (process.env.RECORD_OUT) require('fs').writeFileSync(process.env.RECORD_OUT, JSON.stringify(pending.map(p => Object.assign({ key: key(p.course) }, p))));
    exit(code || (bad ? 2 : 0));
  });
};
process.on('beforeExit', () => process.exit(0));
