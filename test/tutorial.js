// Bot walks the tutorial station by station (door opened manually at the
// strafe gate, as the game does when you reach 350 u/s).
require('../src/physics.js'); require('../src/map.js');
const P = globalThis.StrafePhysics; const { world, courses } = globalThis.StrafeMap.buildMap(P);
const door = world.brushes.find(b => b.props.door === 'strafe');
const tx = 30000;
const p = new P.Player(world); const sp = courses.tutorial.spawn; p.reset(sp.pos, sp.yaw);
const ev = []; let res = 'timeout', hint = -1;
for (let i = 0; i < 12000; i++) {
  const z = p.pos[2], x = p.pos[0] - tx;
  let c = { forward: 1, side: 0, jump: false, duck: false, yaw: 0, pitch: 0 };
  if (z > -2300) c.jump = z < -850;                       // jump gap, then hop the broken floor
  else if (z > -4700) { c.jump = true; if (z < -4400) door.props.nonsolid = true; } // bot cannot air strafe; open the gate for it
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
  ev.push(...p.events.splice(0).map(e => e.type));
  for (const t of p.triggersTouching()) {
    if (t.type === 'hint' && t.idx > hint) { hint = t.idx; console.log('step', t.idx + 1, t.title, 'at', (i / 100).toFixed(1) + 's'); }
    if (t.type === 'kill') { res = 'killed at ' + p.pos.map(v => v | 0); i = 1e9; }
    if (t.type === 'end') { res = 'FINISHED in ' + (i / 100).toFixed(1) + 's'; i = 1e9; }
  }
}
console.log(res, '| moves used:', [...new Set(ev)].join(','));
process.exit(res.startsWith('FINISHED') ? 0 : 1);
