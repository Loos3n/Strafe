require('../src/physics.js'); require('../src/map.js');
const P = globalThis.StrafePhysics; const { world } = globalThis.StrafeMap.buildMap(P);
const p = new P.Player(world); p.reset([-150,-300,-10200], 0);
const c=(o)=>Object.assign({forward:0,side:0,jump:false,duck:false,yaw:0,pitch:0},o);
let ev=[], kicked=0, prevWr=null;
for (let i=0;i<600;i++){
  let jump = p.onGround && p.pos[2] < -10560;
  if (p.wallrun && p.wallrun.t > 0.55 && !p.prevJump) jump = true;
  const yaw = kicked ? -0.6 : 0; if (ev.some(e=>e.startsWith("walljump"))) kicked=1;
  p.tick(c({forward:1, jump, yaw}), 0.01);
  ev.push(...p.events.splice(0).map(e=>e.type+(e.side?e.side:'')+'@'+(p.pos[2]|0)+','+(p.pos[1]|0)));
  if (p.pos[1] < -900) { console.log('FELL at', p.pos.map(v=>v|0)); break; }
}
console.log(p.pos.map(v=>v|0), p.onGround, ev.join(' '));
