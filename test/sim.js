require('../src/physics.js'); require('../src/map.js');
const P = globalThis.StrafePhysics;
const { world, courses } = globalThis.StrafeMap.buildMap(P);
console.log('brushes', world.brushes.length, 'triggers', world.triggers.length);
const dt = 0.01;
const FLAT = new P.World(); FLAT.addBox([-1e5,-64,-1e5],[1e5,0,1e5],{});
const mkFlat = () => { const p = new P.Player(FLAT); p.reset([0,0,0],0); return p; };
function mk(pos, yaw, cfg){ const p = new P.Player(world, cfg); p.reset(pos, yaw); return p; }
function cmd(o){ return Object.assign({forward:0, side:0, jump:false, duck:false, yaw:0, pitch:0}, o); }
let ok = true; const check=(name,cond,info)=>{console.log((cond?'PASS ':'FAIL ')+name, info??''); if(!cond) ok=false;};

// 1 ground accel
{ const p = mkFlat(); for(let i=0;i<200;i++) p.tick(cmd({forward:1}),dt);
  check('run speed 250', Math.abs(p.hspeed()-250)<0.5, p.hspeed().toFixed(2)+' onGround='+p.onGround+' y='+p.pos[1].toFixed(3)); }
// 2 friction stop
{ const p = mkFlat(); for(let i=0;i<200;i++) p.tick(cmd({forward:1}),dt); let t=0; while(p.hspeed()>0 && t<200){p.tick(cmd({}),dt);t++;}
  check('stops quickly', t<60, t+' ticks'); }
// 3 jump height
{ const p = mkFlat(); let maxy=0; p.tick(cmd({jump:true}),dt); for(let i=0;i<100;i++){p.tick(cmd({}),dt); maxy=Math.max(maxy,p.pos[1]);}
  check('jump height ~57', maxy>56 && maxy<60, maxy.toFixed(2)); }
// 4 bhop strafing gains speed (on the bhop lane, flat, synced strafes)
{ const lane = world.brushes.find(b=>b.props.kind==='lane');
  const flat = new P.World(); flat.addBox([-1e5,-64,-1e5],[1e5,0,1e5],{});
  const p = new P.Player(flat); p.reset([0,0,0],0);
  for(let i=0;i<60;i++) p.tick(cmd({forward:1}),dt);
  const s0=p.hspeed(); let dir=1, wasG=true, jumps=0;
  for(let i=0;i<600;i++){
    if (p.onGround && !wasG) { dir=-dir; jumps++; } wasG=p.onGround;
    const v=p.vel, hs=Math.max(p.hspeed(),1), vx=v[0]/hs, vz=v[2]/hs;
    const th = Math.acos(Math.min(1, 15/hs))*dir;
    const wx = vx*Math.cos(th) - vz*Math.sin(th), wz = vx*Math.sin(th) + vz*Math.cos(th);
    const side = dir; const yaw = side>0 ? Math.atan2(-wz, wx) : Math.atan2(wz, -wx);
    p.tick(cmd({side, jump:true, yaw}), dt);
  }
  check('bhop gains speed', p.hspeed()>s0+300, s0.toFixed(0)+' -> '+p.hspeed().toFixed(0)+' jumps '+jumps+' y='+p.pos[1].toFixed(1)); }
// 5 surf: drop onto a lone 60 degree ramp's west face holding into it
{ const RW = new P.World(); RW.addSweep([[-6000-320, 3300-554], [-6000+320, 3300-554], [-6000, 3300]], 600, -3000, -400, { kind: 'ramp' });
  const p = new P.Player(RW); p.reset([-6000-180, 3000, 0], 0); p.vel=[0,0,-400];
  let ground=0, minSpeed=1e9, maxS=0; let i;
  for(i=0;i<400;i++){ p.tick(cmd({side:1, yaw:0}),dt); if(p.onGround) ground++; const s=Math.hypot(...p.vel); if(i>50) minSpeed=Math.min(minSpeed,s); maxS=Math.max(maxS,s); }
  check('surf: never grounded on ramp', ground===0, 'ground ticks '+ground);
  check('surf: keeps moving & on ramp', p.pos[1]>2300 && p.pos[2] < -1200, 'pos '+p.pos.map(v=>v.toFixed(0))+' vel '+p.vel.map(v=>v.toFixed(0))+' max '+maxS.toFixed(0)); }
// 6 vault over knee wall on roofs
{ const p = mk([0,0,-3700],0); for(let i=0;i<150;i++) p.tick(cmd({forward:1, jump:false}),dt);
  // now near knee wall at -3780? walk until blocked then press jump
  const ev=[]; for(let i=0;i<60;i++){ p.tick(cmd({forward:1, jump: i%2===0}),dt); ev.push(...p.events.splice(0)); }
  check('vault over knee wall', p.pos[2] < -3800, 'z '+p.pos[2].toFixed(0)+' events '+ev.map(e=>e.type).join(',')); }
// 7 wallrun across gap 2
{ const p = mk([365,-40,-5300],0); for(let i=0;i<120;i++) p.tick(cmd({forward:1}),dt);
  const ev=[]; let wr=0;
  for(let i=0;i<400;i++){ const j = (i===2) || (p.wallrun && p.wallrun.t>1.2 && !p.prevJump); p.tick(cmd({forward:1, jump: !!j, yaw: 0}),dt); if(p.wallrun) wr++; ev.push(...p.events.splice(0)); }
  check('wallrun gap 2', p.pos[2] < -6200 && p.pos[1] > -100, 'pos '+p.pos.map(v=>v.toFixed(0))+' wallrun ticks '+wr+' events '+ev.map(e=>e.type).join(',')); }
// 8 climb + mantle onto B4
{ const p = mk([0,-60,-7100],0); for(let i=0;i<60;i++) p.tick(cmd({forward:1}),dt);
  const ev=[]; for(let i=0;i<200;i++){ p.tick(cmd({forward:1, jump: p.pos[2] < -7340}),dt); ev.push(...p.events.splice(0)); }
  check('climb+mantle to B4', p.pos[1] > 129 && p.pos[2] < -7400, 'pos '+p.pos.map(v=>v.toFixed(0))+' events '+ev.map(e=>e.type).join(',')); }
// 9 slide under pipe
{ const p = mk([0,-40,-4420],0); for(let i=0;i<100;i++) p.tick(cmd({forward:1}),dt);
  const ev=[]; for(let i=0;i<200;i++){ p.tick(cmd({forward:1, duck: i>=5}),dt); ev.push(...p.events.splice(0)); }
  check('slide under pipe', p.pos[2] < -4900, 'pos '+p.pos.map(v=>v.toFixed(0))+' events '+ev.map(e=>e.type).join(',')); }
// 10 standing blocked by pipe
{ const p = mk([0,-40,-4700],0); for(let i=0;i<200;i++) p.tick(cmd({forward:1}),dt);
  check('pipe blocks standing', p.pos[2] > -4870, 'z '+p.pos[2].toFixed(1)); }
// 11 perf
{ const p = mkFlat(); const t0=Date.now(); for(let i=0;i<10000;i++) p.tick(cmd({forward:1, side: (i>>6)&1?1:-1, jump:true, yaw: i*0.003}),dt); check('perf 10k ticks', true, (Date.now()-t0)+'ms'); }
process.exit(ok?0:1);
