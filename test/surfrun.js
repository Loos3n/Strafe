// Bot: drop from the stage-1 platform, then surf each ramp's west face by
// holding D whenever it drifts below a target line on the face.
require('../src/physics.js'); require('../src/map.js');
const P = globalThis.StrafePhysics; const { world, courses } = globalThis.StrafeMap.buildMap(P);
const p = new P.Player(world); const sp = courses.surf.spawn; p.reset(sp.pos, sp.yaw);
const c=(o)=>Object.assign({forward:0,side:0,jump:false,duck:false,yaw:0,pitch:0},o);
const ramps = world.brushes.filter(b=>b.props.kind==='ramp');
let onRamp=false, hit=[];
for(let i=0; i<4000; i++){
  const tr = world.trace(p.pos,[p.pos[0]+8,p.pos[1]-8,p.pos[2]],p.hull);
  const ramp = tr.normal && tr.normal[1]<0.7 && tr.normal[1]>0.05;
  if (ramp) onRamp = true;
  let cmd;
  if (!onRamp) cmd = c({forward:1, yaw: sp.yaw});
  else {
    // the ramp under/ahead of us
    const r = ramps.find(b => p.pos[2] <= b.max[2]+400 && p.pos[2] >= b.min[2]-50) || ramps[ramps.length-1];
    const cx = (r.min[0]+r.max[0])/2;
    const yaw = Math.atan2(p.vel[0], -p.vel[2]) * -1; // face along velocity
    cmd = c({ side: p.pos[0] < cx - 200 ? 1 : 0, yaw: 0 });
  }
  p.tick(cmd, 0.01);
  for (const t of p.triggersTouching()) if (!hit.includes(t)) { hit.push(t); console.log('trigger', t.type, t.idx??'', 'tick', i, p.pos.map(v=>v|0).join(','), 'speed', Math.hypot(p.vel[0],p.vel[2])|0); if (t.type==='kill'||t.type==='end') i=1e9; }
  if (i%300===0) console.log(i, p.pos.map(v=>v|0).join(','), 'hs', Math.hypot(p.vel[0],p.vel[2])|0, ramp?'RAMP':'');
}
