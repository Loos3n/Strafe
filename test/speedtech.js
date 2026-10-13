// Speed tech: ramp slides over fast slopes and edge bugs off hard landings.
require('../src/physics.js');
const P = globalThis.StrafePhysics;
const dt = 0.01;
let ok = true; const check = (name, cond, info) => { console.log((cond ? 'PASS ' : 'FAIL ') + name, info ?? ''); if (!cond) ok = false; };
const cmd = (o) => Object.assign({ forward: 0, side: 0, jump: false, duck: false, yaw: 0, pitch: 0 }, o);
// a long downhill slope heading -z: 14 degrees, walkable
function slopeWorld() {
  const W = new P.World();
  W.addPrism('x', [[0, 0], [-6000, -1500], [-6000, -1600], [0, -100]], -400, 400, {});
  return W;
}
function slideRun(speed) {
  const W = slopeWorld(), p = new P.Player(W);
  p.reset([0, 40, -200], 0);
  p.vel = [0, 0, -speed];
  let ground = 0, ev = [];
  for (let i = 0; i < 150; i++) { p.tick(cmd({}), dt); if (p.onGround) ground++; for (const e of p.events) ev.push(e.type); p.events.length = 0; }
  return { ground, speed: Math.hypot(...p.vel), ev };
}
{
  const fast = slideRun(1300), slow = slideRun(600);
  check('fast rider ramp slides', fast.ev.includes('rampslide') && fast.ground < 10 && fast.speed > 1300, JSON.stringify(fast).slice(0, 120));
  check('slow rider walks the slope', !slow.ev.includes('rampslide') && slow.ground > 60 && slow.speed < 600, JSON.stringify(slow).slice(0, 120));
}
// edge bug: fall hard onto a ledge with only the edge of your box over it
function edgeRun(x, fall) {
  const W = new P.World();
  W.addBox([-200, -64, -200], [100, 0, 200], {});
  const p = new P.Player(W);
  p.reset([x, 300, 0], 0);
  p.vel = [300, -fall, 0];
  const ev = [];
  for (let i = 0; i < 150; i++) { p.tick(cmd({}), dt); for (const e of p.events) ev.push(e.type); p.events.length = 0; }
  return { ev, y: p.pos[1], x: p.pos[0] };
}
{
  // moving +x at 300 u/s, landing with the box's left edge just over the ledge
  const hit = edgeRun(4, 700), centre = edgeRun(-150, 700), soft = edgeRun(4, 100);
  check('edge bug on a hard edge landing', hit.ev.includes('edgebug') && !hit.ev.includes('land') && hit.y < -100, JSON.stringify(hit));
  check('no edge bug landing in the middle', !centre.ev.includes('edgebug') && centre.ev.includes('land'), JSON.stringify(centre));
  check('no edge bug on a soft fall', !soft.ev.includes('edgebug'), JSON.stringify(soft));
}
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
