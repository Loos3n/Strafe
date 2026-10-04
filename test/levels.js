// Bot runs over the newer levels using scripted inputs from brains.js.
require('../src/physics.js'); require('../src/map.js');
const P = globalThis.StrafePhysics; const { world, courses } = globalThis.StrafeMap.buildMap(P);
const brains = require('./brains.js');
let ok = true;
for (const name of Object.keys(brains)) {
  const p = new P.Player(world); const sp = courses[name].spawn; p.reset(sp.pos, sp.yaw);
  const seen = []; let res = 'timeout';
  for (let i = 0; i < 8000; i++) {
    p.tick(Object.assign({ forward: 0, side: 0, jump: false, duck: false, yaw: 0, pitch: 0 }, brains[name](p, i, world)), 0.01);
    p.events.length = 0;
    for (const t of p.triggersTouching()) if (!seen.includes(t) && t.type !== 'start') {
      seen.push(t);
      if (t.type === 'kill') { res = 'killed at ' + p.pos.map(v => v | 0); i = 1e9; }
      if (t.type === 'end') { res = 'FINISHED in ' + (i / 100).toFixed(1) + 's at ' + (p.hspeed() | 0) + ' u/s'; i = 1e9; }
    }
  }
  if (!res.startsWith('FINISHED')) ok = false;
  console.log(name + ':', res, '| checkpoints', seen.filter(t => t.type === 'checkpoint').map(t => t.idx).join(',') || 'none');
}
process.exit(ok ? 0 : 1);
