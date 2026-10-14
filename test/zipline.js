// Ziplines: grab a cable from a jump, ride it down, let go three ways.
require('../src/physics.js');
const P = globalThis.StrafePhysics;
const dt = 0.01;
let ok = true; const check = (name, cond, info) => { console.log((cond ? 'PASS ' : 'FAIL ') + name, info ?? ''); if (!cond) ok = false; };
const cmd = (o) => Object.assign({ forward: 0, side: 0, jump: false, duck: false, yaw: 0, pitch: 0 }, o);
function mkWorld() {
  const W = new P.World();
  W.addBox([-400, -64, -400], [400, 0, 400], {});          // start roof
  W.addBox([-400, -464, -4400], [400, -400, -3600], {});   // landing roof, 400 lower
  // cable over the start roof heading -z, from 100 above head height down to the landing roof
  W.ziplines.push({ a: [0, 165, 200], b: [0, -400 + 120, -3500] });
  return W;
}
function run(W, steps, f) {
  const p = new P.Player(W); p.reset([0, 0, 300], 0);
  const ev = [];
  for (let i = 0; i < steps; i++) { p.tick(f(i, p), dt); for (const e of p.events) ev.push(e.type); p.events.length = 0; }
  return { p, ev };
}
// run forward and jump under the cable: grab it, ride to the end, land on the far roof
{
  let zipTop = 0;
  const { p, ev } = run(mkWorld(), 900, (i, p) => { if (p.zip) zipTop = Math.max(zipTop, p.zip.speed); return cmd({ forward: 1, jump: i === 40 }); });
  check('grabs the cable', ev.includes('zip'), ev.slice(0, 6).join(','));
  check('speeds up riding down', zipTop > 700, zipTop.toFixed(0));
  check('rides off the end and lands far', ev.includes('zipoff') && p.onGround && p.pos[2] < -3500, p.pos.map(v => v.toFixed(0)).join(','));
}
// jump off halfway: let go with a hop and keep the speed
{
  let off = null;
  const { ev } = run(mkWorld(), 400, (i, p) => {
    const j = p.zip && p.zip.t > 0.5 && !off; if (j) off = p.zip.speed;
    return cmd({ forward: 1, jump: i === 40 || j });
  });
  check('jump lets go', ev.filter(e => e === 'zipoff').length === 1 && off > 0, 'speed ' + (off || 0).toFixed(0));
}
// a hop off early falls back past the same cable instead of catching it again
{
  let off = false;
  const { ev } = run(mkWorld(), 900, (i, p) => {
    const j = p.zip && p.zip.t > 0.3 && !off; if (j) off = true;
    return cmd({ forward: 1, jump: i === 40 || j });
  });
  check('no regrab after a hop off', ev.filter(e => e === 'zip').length === 1, ev.filter(e => e === 'zip' || e === 'zipoff').join(','));
}
// never grab it from the ground or when standing still under it
{
  const { ev } = run(mkWorld(), 200, () => cmd({}));
  check('no grab standing', !ev.includes('zip'));
}
// a cable in a wall: riding into it lets go instead of passing through
{
  const W = mkWorld(); W.addBox([-400, -400, -2000], [400, 400, -1900], {});
  let offZ = null;
  run(W, 600, (i, p) => { if (p.zip) offZ = p.pos[2]; return cmd({ forward: 1, jump: i === 40 }); });
  check('stops at a wall', offZ !== null && offZ > -1900 + 15, offZ && offZ.toFixed(0));
}
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
