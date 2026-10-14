// Moving pieces: platforms carry you, lifts lift you, moving walls shove you.
require('../src/physics.js');
const P = globalThis.StrafePhysics;
const dt = 0.01;
let ok = true; const check = (name, cond, info) => { console.log((cond ? 'PASS ' : 'FAIL ') + name, info ?? ''); if (!cond) ok = false; };
const cmd = (o) => Object.assign({ forward: 0, side: 0, jump: false, duck: false, yaw: 0, pitch: 0 }, o);
function run(W, start, steps, f) {
  const p = new P.Player(W); p.reset(start, 0);
  for (let i = 0; i < steps; i++) { W.setTime(i * dt); p.tick(f(i, p), dt); p.events.length = 0; }
  return p;
}
// a platform sliding 1000 along x and back over 2 s each way
{
  const W = new P.World();
  const b = W.addBox([-200, -32, -200], [200, 0, 200], {});
  W.addMover([b], [1000, 0, 0], 2);
  let maxX = 0;
  const p = run(W, [0, 0, 0], 200, (i, p) => { maxX = Math.max(maxX, p.pos[0]); return cmd({}); });
  check('platform carries you', p.onGround && Math.abs(p.pos[0] - 1000) < 5 && maxX > 990, p.pos.map(v => v.toFixed(1)).join(','));
  const q = run(W, [0, 0, 0], 400, () => cmd({}));
  check('and brings you back', q.onGround && Math.abs(q.pos[0]) < 5, q.pos[0].toFixed(1));
}
// a lift rising 600
{
  const W = new P.World();
  W.addBox([-1000, -64, -1000], [1000, 0, 1000], {});
  const b = W.addBox([-150, 0, -150], [150, 32, 150], {});
  W.addMover([b], [0, 600, 0], 1.5);
  const p = run(W, [0, 32, 0], 150, () => cmd({}));
  check('lift raises you', p.onGround && Math.abs(p.pos[1] - 632) < 3, p.pos[1].toFixed(1));
  const q = run(W, [0, 32, 0], 300, () => cmd({}));
  check('and lowers you', q.onGround && Math.abs(q.pos[1] - 32) < 3, q.pos[1].toFixed(1));
  // jump at the top
  const r = run(W, [0, 32, 0], 260, (i) => cmd({ jump: i === 150 }));
  check('jumping off the top', r.pos[1] > 32 - 1, r.pos[1].toFixed(1));
}
// a wall sliding through where you stand shoves you along
{
  const W = new P.World();
  W.addBox([-2000, -64, -1000], [2000, 0, 1000], {});
  const b = W.addBox([-400, 0, -300], [-368, 300, 300], {});
  W.addMover([b], [800, 0, 0], 1);
  const p = run(W, [0, 0, 0], 100, () => cmd({}));
  check('a moving wall pushes you', p.pos[0] > 400 + 16 - 2 && p.onGround, p.pos[0].toFixed(1));
}
// a gate: shut it blocks the way, rising it lets you run under
function gateWorld(time) {
  const W = new P.World();
  W.addBox([-500, -64, -3000], [500, 0, 500], {});
  const g = W.addBox([-500, 0, -1032], [500, 400, -1000], {});
  W.addMover([g], [0, 600, 0], time);
  return W;
}
{
  const shut = run(gateWorld(100), [0, 0, 0], 600, () => cmd({ forward: 1 }));
  check('a shut gate blocks you', shut.pos[2] > -1000, shut.pos[2].toFixed(1));
  const open = run(gateWorld(4), [0, 0, 0], 600, () => cmd({ forward: 1 }));
  check('a rising gate lets you through', open.pos[2] < -1100, open.pos[2].toFixed(1));
}
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
