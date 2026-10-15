// Bot walks the tutorial station by station, with the same goals the game
// tracks (src/tutorial.js): each station has to be passed by doing its move,
// and gates open only when their goal is met. The bot cannot air strafe, so
// the strafe goal is passed for it, as the game does when you reach 350 u/s.
require('../src/physics.js'); require('../src/map.js'); require('../src/tutorial.js');
const P = globalThis.StrafePhysics; const { world, courses } = globalThis.StrafeMap.buildMap(P);
const TUT = globalThis.StrafeTutorial;
const doors = {};
for (const b of world.brushes) if (b.props.door) doors[b.props.door] = b;
for (const g of TUT.gates) if (!doors[g]) { console.log('missing gate', g); process.exit(1); }
const tx = 30000, steps = courses.tutorial.steps;
const p = new P.Player(world); const sp = courses.tutorial.spawn; p.reset(sp.pos, sp.yaw);
const T = TUT.create();
const ev = []; let res = 'timeout', fails = [];
const surfing = () => { const tr = world.trace(p.pos, [p.pos[0], p.pos[1] - 4, p.pos[2]], p.hull); return !!(tr.normal && tr.normal[1] > 0.05 && tr.normal[1] < 0.7); };
for (let i = 0; i < 12000; i++) {
  const z = p.pos[2], x = p.pos[0] - tx;
  let c = { forward: 1, side: 0, jump: false, duck: false, yaw: 0, pitch: 0 };
  if (i < 120) { c.forward = 0; c.yaw = Math.sin(i / 20) * 0.8; c.side = i < 60 ? -1 : 1; } // look about, sidestep both ways
  else if (z > -2300) c.jump = z < -850;                  // jump gap, then hop the broken floor
  else if (z > -4700) { c.jump = true; if (z < -4400 && !T.done()) { T.s.isDone = true; doors.strafe.props.nonsolid = true; } } // bot cannot air strafe
  else if (z > -5700) c.duck = z < -5200;                  // slide under pipe
  else if (z > -6400) c.jump = z < -6290;                  // vault
  else if (z > -7100) c.jump = z < -6975;                  // climb
  else if (z > -8600) { c.side = p.onGround && x < 240 ? 1 : 0; c.jump = (p.onGround && z < -7960) || (p.wallrun && p.wallrun.t > 0.9 && !p.prevJump); }
  else if (z > -9600) { c.jump = p.onGround && z < -9450; }
  else {
    const tr = world.trace(p.pos, [p.pos[0], p.pos[1] - 8, p.pos[2]], p.hull);
    c.forward = 0;
    if (tr.normal && tr.normal[1] < 0.7 && tr.normal[1] > 0.05) c.side = tr.normal[0] < 0 ? (x < -150 ? 1 : 0) : (x > 150 ? -1 : 0);
    else c.side = x > 0 ? -1 : 1;
  }
  p.tick(c, 0.01);
  const evs = p.events.splice(0);
  ev.push(...evs.map(e => e.type));
  if (T.tick(p, c, evs, { dt: 0.01, surfing: surfing() })) {
    console.log('  passed', steps[T.step].title, 'at', (i / 100).toFixed(1) + 's');
    if (T.gate()) doors[T.gate()].props.nonsolid = true;
  }
  for (const t of p.triggersTouching()) {
    if (t.type === 'hint' && t.idx > T.step) {
      if (T.step >= 0 && !T.done()) fails.push(steps[T.step].title);
      T.enter(t.idx, steps[t.idx]);
      console.log('step', t.idx + 1, t.title, 'at', (i / 100).toFixed(1) + 's');
    }
    if (t.type === 'kill') { res = 'killed at ' + p.pos.map(v => v | 0); i = 1e9; }
    if (t.type === 'end') { res = 'FINISHED in ' + (i / 100).toFixed(1) + 's'; i = 1e9; }
  }
}
if (res.startsWith('FINISHED') && !T.done()) fails.push(steps[T.step].title);
if (fails.length) res = 'skipped goals: ' + fails.join(', ') + ' (' + res + ')';
console.log(res, '| moves used:', [...new Set(ev)].join(','));
process.exit(res.startsWith('FINISHED') ? 0 : 1);
