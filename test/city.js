// Bot runs over the long city levels, which are laid out in legs that turn
// corners. Each plan works in the current leg's frame: u across (right +),
// v forward. Usage: node test/city.js [level] [checkpoint]   (V=50 to trace)
require('../src/physics.js'); require('../src/map.js');
const P = globalThis.StrafePhysics; const { world, courses } = globalThis.StrafeMap.buildMap(P);
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const frame = ({ ox, oz, h }) => {
  const f = DIRS[h], r = DIRS[(h + 1) % 4];
  return { yaw: Math.atan2(-f[0], -f[1]), local: (x, z) => [(x - ox) * r[0] + (z - oz) * r[1], (x - ox) * f[0] + (z - oz) * f[1]] };
};
const inR = (v, a, b) => v >= a && v < b;

// Each leg: { end: v where the next leg takes over, step(u, v, p) -> cmd }.
// A cmd may carry u (lateral target, steered by yaw), air (yaw offset in the
// air), and the usual forward/jump/duck/side.
const plans = {
  roofs: [
    { end: 12250, step: (u, v, p) => {
      if (inR(v, 5300, 6300)) {
        if (p.wallrun) return { yaw0: true, jump: p.wallrun.t > 1.2 && !p.prevJump };
        return { u: 365, jump: inR(v, 5540, 5598) && p.onGround, air: -0.3 };
      }
      if (inR(v, 10500, 11800) && !p.onGround) {
        if (p.wallrun) return { yaw0: true, jump: (p.wallrun.side < 0 ? p.wallrun.t > 0.45 : v > 11550) && !p.prevJump };
        return { air: p.wallSide === -1 ? -0.35 : 0.35 };
      }
      return {
        u: v > 10300 && v < 11800 ? -150 : v > 11800 ? -100 : 0,
        jump: inR(v, 3745, 3778) || inR(v, 4140, 4198) || inR(v, 7340, 7398) || inR(v, 9360, 9400) || inR(v, 10540, 10598),
        duck: inR(v, 4800, 4920) || inR(v, 8350, 9365),
      };
    } },
    { end: 3400, step: (u, v, p) => {
      if (inR(v, 1950, 3100)) {
        if (p.wallrun) return { yaw0: true, jump: p.wallrun.t > 1.2 && !p.prevJump };
        return { u: 365, jump: inR(v, 2540, 2598) && p.onGround, air: -0.3 };
      }
      return { u: v < 2200 ? 0 : -100, jump: inR(v, 866, 896) || inR(v, 1340, 1398), duck: inR(v, 1790, 1910) };
    } },
    { end: 4100, step: (u, v) => ({
      u: v > 3400 ? -100 : 0,
      jump: inR(v, 1340, 1396) || inR(v, 3270, 3300),
      duck: inR(v, 1900, 2010) || inR(v, 2350, 3275),
    }) },
    { end: 1e9, step: (u, v) => ({
      u: v < 2000 ? 0 : v < 2450 ? 60 : v < 2700 ? -40 : 0,
      jump: inR(v, 1440, 1498) || inR(v, 1910, 1958) || inR(v, 2370, 2418) || inR(v, 2826, 2876),
    }) },
  ],
  downtown: [
    { end: 3400, step: (u, v) => ({
      u: v < 700 ? -120 : v < 2700 ? 0 : 400,
      jump: inR(v, 440, 500) || inR(v, 1340, 1398) || inR(v, 1950, 1996) || inR(v, 2540, 2598),
      duck: inR(v, 880, 1000),
    }) },
    { end: 4800, step: (u, v, p) => {
      if (inR(v, 60, 1400)) {
        if (p.wallrun) return { yaw0: true, jump: v > 960 };
        return { u: -330, side: u > -360 ? -1 : 0, jump: inR(v, 560, 598) && p.onGround, air: 0.3 };
      }
      if (inR(v, 2700, 3800)) {
        if (p.wallrun) return { yaw0: true };
        return { u: 505, jump: inR(v, 3260, 3298), air: -0.25, duck: inR(v, 2880, 3000) };
      }
      return {
        u: v > 3750 ? 300 : 0,
        jump: inR(v, 2236, 2300) || inR(v, 2566, 2596) || inR(v, 3940, 3996),
        duck: inR(v, 2880, 3000),
      };
    } },
    { end: 6300, step: (u, v) => ({
      u: v > 5500 ? 500 : 0,
      jump: inR(v, 940, 996) || inR(v, 1340, 1396) || inR(v, 1740, 1796) || inR(v, 5370, 5400),
      duck: inR(v, 4380, 5375),
    }) },
    { end: 1e9, step: (u, v, p) => {
      if (inR(v, 600, 1900) && !p.onGround) {
        if (p.wallrun) return { yaw0: true, jump: (p.wallrun.side < 0 ? p.wallrun.t > 0.45 : v > 1650) && !p.prevJump };
        return { air: p.wallSide === -1 ? -0.35 : 0.35 };
      }
      return { u: v < 1900 ? -150 : v < 2600 ? -120 : 0, jump: inR(v, 640, 698) || inR(v, 2150, 2196) || inR(v, 2740, 2796) };
    } },
  ],
};

function run(name, cp) {
  const legs = courses[name].legs.map(frame), plan = plans[name];
  const p = new P.Player(world);
  let sp = courses[name].spawn;
  if (cp) sp = world.triggers.find(t => t.course === name && t.type === 'checkpoint' && t.idx === cp).spawn;
  p.reset(sp.pos, sp.yaw);
  // start in the leg whose frame we are furthest along without passing its end
  let k = 0;
  while (k < legs.length - 1) {
    const [, v] = legs[k].local(sp.pos[0], sp.pos[2]);
    const [, v2] = legs[k + 1].local(sp.pos[0], sp.pos[2]);
    if (v > plan[k].end || (v2 > -50 && Math.abs(sp.yaw - legs[k + 1].yaw) < 0.01)) k++; else break;
  }
  const seen = []; let res = 'timeout';
  for (let i = 0; i < 30000; i++) {
    let L = legs[k], [u, v] = L.local(p.pos[0], p.pos[2]);
    if (v > plan[k].end && k < legs.length - 1) { k++; L = legs[k]; [u, v] = L.local(p.pos[0], p.pos[2]); }
    const c = plan[k].step(u, v, p);
    let yaw = L.yaw;
    if (!c.yaw0) {
      if (!p.onGround && c.air !== undefined) yaw = L.yaw + c.air;
      else if (c.u !== undefined) yaw = L.yaw - Math.atan2(Math.max(-400, Math.min(400, c.u - u)), 260);
    }
    const cmd = { forward: 1, side: c.side || 0, jump: !!c.jump, duck: !!c.duck, yaw, pitch: 0 };
    if (process.env.OUT) (run.cmds || (run.cmds = [])).push(cmd);
    p.tick(cmd, 0.01);
    p.prevJump = cmd.jump;
    for (const e of p.events) if (e.type === 'wallrun') p.wallSide = e.side;
    if (process.env.V && i % +process.env.V === 0) console.log(i, 'leg', k, 'u', u | 0, 'v', v | 0, 'y', p.pos[1] | 0, 'hs', p.hspeed() | 0, p.onGround ? 'G' : '', p.wallrun ? 'WR' : '', p.climb ? 'CL' : '', p.slide ? 'SL' : '', p.mantle ? 'MA' : '', p.events.map(e => e.type).join(' '));
    p.events.length = 0;
    for (const t of p.triggersTouching()) if (!seen.includes(t) && t.type !== 'start') {
      seen.push(t);
      if (t.type === 'kill') { res = 'killed at leg ' + k + ' u ' + (u | 0) + ' v ' + (v | 0) + ' y ' + (p.pos[1] | 0); i = 1e9; }
      if (t.type === 'end') { res = 'FINISHED in ' + (i / 100).toFixed(1) + 's at ' + (p.hspeed() | 0) + ' u/s'; i = 1e9; }
    }
  }
  if (res === 'timeout') { const [u, v] = legs[k].local(p.pos[0], p.pos[2]); res = 'timeout at leg ' + k + ' u ' + (u | 0) + ' v ' + (v | 0) + ' y ' + (p.pos[1] | 0); }
  console.log(name + (cp ? ' from cp ' + cp : '') + ':', res, '| checkpoints', seen.filter(t => t.type === 'checkpoint').map(t => t.idx).join(',') || 'none');
  if (process.env.OUT) require('fs').writeFileSync(process.env.OUT, JSON.stringify(run.cmds)), run.cmds = null;
  return res.startsWith('FINISHED');
}

const only = process.argv[2], cpArg = +(process.argv[3] || 0);
let ok = true;
for (const name of Object.keys(plans)) if (!only || only === name) ok = run(name, cpArg) && ok;
process.exit(ok ? 0 : 1);
