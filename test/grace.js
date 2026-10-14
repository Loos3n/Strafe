// Forgiving parkour timing (parkourGrace in src/physics.js): a jump pressed a
// moment after running off a ledge, off the end of a wallrun or out of a climb
// still jumps or kicks off, and one pressed just before a climb kick is allowed
// is kept for it. A press after the window does nothing, as before.
require('../src/physics.js');
const P = globalThis.StrafePhysics;
const dt = 0.01;
const cmd = (o) => Object.assign({ forward: 0, side: 0, jump: false, duck: false, yaw: 0, pitch: 0 }, o);
let ok = true;
const check = (name, cond, info) => { console.log((cond ? 'PASS ' : 'FAIL ') + name, info ?? ''); if (!cond) ok = false; };
const types = (p) => p.events.splice(0).map(e => e.type);

// a rooftop that ends at z = -400, a long drop below
function ledge(lateTicks) {
  const W = new P.World(); W.addBox([-500, -64, -400], [500, 0, 500], {});
  const p = new P.Player(W); p.reset([0, 0, 300], 0);
  let off = -1, ev = [];
  for (let i = 0; i < 400; i++) {
    const jump = off >= 0 && i === off + lateTicks;
    p.tick(cmd({ forward: 1, jump }), dt);
    const t = types(p);
    if (off < 0 && !p.onGround) off = i;
    if (off >= 0) ev.push(...t);
    if (jump) return { p, jumped: t.includes('jump'), vy: p.vel[1] };
  }
  return { jumped: false };
}
{ const r = ledge(6); check('late jump off a ledge (60 ms) still jumps', r.jumped && r.vy > 250, 'vy ' + (r.vy || 0).toFixed(0)); }
{ const r = ledge(25); check('jump 250 ms after the ledge does not', !r.jumped); }

// a wall on your right that you run along until the wallrun times out
function wall(lateTicks) {
  const W = new P.World(); W.addBox([32, -2000, -3000], [64, 2000, 0], {});
  const p = new P.Player(W); p.reset([0, 0, -50], 0); p.vel = [0, 0, -400];
  let ran = false, end = -1;
  for (let i = 0; i < 400; i++) {
    const jump = end >= 0 && i === end + lateTicks;
    p.tick(cmd({ forward: 1, jump }), dt);
    const t = types(p);
    if (p.wallrun) ran = true;
    else if (ran && end < 0) end = i;
    if (jump) return { ran, kicked: t.includes('walljump'), vx: p.vel[0] };
  }
  return { ran, kicked: false };
}
{ const r = wall(5); check('late wall jump (50 ms after the wallrun ends) kicks off', r.ran && r.kicked && r.vx < -200, 'vx ' + (r.vx || 0).toFixed(0)); }
{ const r = wall(25); check('wall jump 250 ms late does not', r.ran && !r.kicked); }

// climb a tall wall ahead; press jump at different times
function climb(pressAt) {
  const W = new P.World(); W.addBox([-500, -64, -2000], [500, 0, 500], {}); W.addBox([-500, 0, -200], [500, 2000, -170], {});
  const p = new P.Player(W); p.reset([0, 0, 0], 0);
  for (let i = 0; i < 60; i++) { p.tick(cmd({ forward: 1 }), dt); types(p); if (p.pos[2] < -120) break; }
  let started = -1, prev = false, kickT = null;
  for (let i = 0; i < 200; i++) {
    const want = started < 0 || i === started + pressAt;
    const jump = want && !prev; prev = jump;
    const climbT = p.climb ? p.climb.t : 0;
    p.tick(cmd({ forward: 1, jump }), dt);
    const t = types(p);
    if (started < 0 && t.includes('climb')) started = i;
    if (t.includes('climbjump')) { kickT = climbT; break; }
    if (started >= 0 && !p.climb && i > started + 80) break;
  }
  return { started: started >= 0, kickT };
}
{ const r = climb(2); check('jump pressed 20 ms into a climb is kept for the kick', r.started && r.kickT !== null && r.kickT < 0.08, 'kick at ' + (r.kickT === null ? 'none' : r.kickT.toFixed(2) + 's')); }
{ const r = climb(20); check('climb kick on time still works', r.started && r.kickT !== null, 'kick at ' + (r.kickT === null ? 'none' : r.kickT.toFixed(2) + 's')); }

// running off a flat pad straight onto a surf ramp's face gives no ledge grace
{ const W = new P.World();
  W.addBox([0, -64, -300], [500, 0, 300], {});
  W.addSweep([[0, 0], [0, -600], [-346, -600]], -300, 300, 0, { kind: 'ramp' }); // a 60 degree face dropping away from the pad edge
  const p = new P.Player(W); p.reset([150, 0, 0], Math.PI / 2);
  let graced = false, left = false;
  for (let i = 0; i < 120; i++) { p.tick(cmd({ forward: 1, yaw: Math.PI / 2 }), dt); if (p.ledgeGrace > 0) graced = true; if (p.pos[0] < -20) left = true; }
  check('no ledge grace running onto a surf ramp', left && !graced, 'pos ' + p.pos.map(v => v.toFixed(0)));
}

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
