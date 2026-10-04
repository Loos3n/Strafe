// One bot for all six Gauntlet levels. It reads each level's plan (pads,
// bhop blocks and ramps in order along -Z) and rides or hops each piece.
// Usage: node test/gauntlet.js [level] [checkpoint]   V=50 for a trace
require('../src/physics.js'); require('../src/map.js');
const P = globalThis.StrafePhysics; const { world, courses, gauntlet } = globalThis.StrafeMap.buildMap(P);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const face = (p) => {
  const tr = world.trace(p.pos, [p.pos[0], p.pos[1] - 8, p.pos[2]], p.hull);
  return tr.normal && tr.normal[1] < 0.7 && tr.normal[1] > 0.05 ? tr.normal : null;
};
function strafeTo(p, i, tx, tz) {
  const vdir = Math.atan2(-p.vel[0], -p.vel[2]);
  const err = wrap(Math.atan2(-(tx - p.pos[0]), -(tz - p.pos[2])) - vdir);
  let side = err > 0 ? -1 : 1;
  if (Math.abs(err) < 0.06) side = (i >> 4) & 1 ? 1 : -1;
  return { forward: 0, side, yaw: vdir, err };
}
// a point on a ramp's near face, on the side we are coming from
const rampAim = (p, r) => [r.cx + (p.pos[0] < r.cx ? -200 : 200), Math.min(r.z0 - 300, p.pos[2] - 600)];

function brain(plan) {
  const st = { ramp: -1 };
  return (p, i) => {
    const n = face(p), z = p.pos[2];
    if (n) st.ramp = plan.findIndex(q => q.t === 'ramp' && z <= q.z0 + 50 && z >= q.z1 - 50);
    if (p.onGround) st.ramp = -1;
    if (n && st.ramp >= 0) {
      const r = plan[st.ramp];
      const into = n[0] < 0 ? 1 : -1;
      const off = (p.pos[0] - r.cx) * into;
      return { side: off < -170 ? into : 0, yaw: 0 };
    }
    if (st.ramp >= 0) {
      // flying off or between ramps: hold the current one until its end, then aim at what follows
      const r = plan[st.ramp];
      if (z > r.z1 + 900) { const [ax, az] = rampAim(p, r); return strafeTo(p, i, ax, az); }
      const nx = plan[st.ramp + 1];
      if (nx.t === 'ramp') { const [ax, az] = rampAim(p, nx); return strafeTo(p, i, ax, az); }
      return strafeTo(p, i, nx.x, Math.min(nx.z0 - 500, z - 600));
    }
    // on foot: the next piece is the first one starting ahead of us
    const cur = plan.findIndex(q => q.t !== 'ramp' && z <= q.z0 + 2 && z >= q.z1 - 2 && Math.abs(p.pos[1] - q.y) < 4 && p.onGround);
    let k = plan.findIndex(q => q.z0 < z - (q.t === 'block' ? 0 : 2));
    if (cur >= 0) k = cur + 1;
    const t = plan[Math.min(k, plan.length - 1)];
    if (t.t === 'ramp') {
      const [ax, az] = rampAim(p, t);
      if (!p.onGround) return strafeTo(p, i, ax, az);
      const here = plan[cur] || {};
      const edge = here.t === 'block' ? z < here.cz - 10 : z < here.z1 + 80;
      return { forward: 1, yaw: Math.atan2(-(ax - p.pos[0]), -(t.z0 - 200 - z)), jump: edge };
    }
    const tz = t.t === 'block' ? t.cz : Math.max(t.z1 + 100, Math.min(t.z0 - 120, z - 300));
    const dx = t.x - p.pos[0], dz = tz - z;
    const yaw = Math.atan2(-dx, -dz);
    if (p.onGround && cur >= 0 && plan[cur].t === 'pad' && p.hspeed() > 420) return { yaw: Math.atan2(-p.vel[0], -p.vel[2]) }; // brake
    if (!p.onGround) {
      // solve for the velocity that lands on the target, then push toward it:
      // pressing into the change works for braking and turning, gaining speed needs strafes
      const g = 800, dy = p.pos[1] - t.y, vy = p.vel[1];
      const disc = vy * vy + 2 * g * dy;
      if (disc < 0) return strafeTo(p, i, t.x, tz);
      const T = (vy + Math.sqrt(disc)) / g;
      if (T < 0.02) return { forward: 1, yaw };
      const wx = dx / T, wz = dz / T;
      const want = Math.hypot(wx, wz), have = p.hspeed();
      if (want > have + 15) return strafeTo(p, i, t.x, tz);
      const ex = wx - p.vel[0], ez = wz - p.vel[2];
      if (Math.hypot(ex, ez) < 6) return {};
      return { forward: 1, yaw: Math.atan2(-ex, -ez) };
    }
    const here = plan[cur];
    let take = true;
    if (here) {
      const hx = -Math.sin(yaw), hz = -Math.cos(yaw);
      // slow on a block: use the whole top as runway before jumping for the next one
      const runway = here.t === 'block' && t.t === 'block' && p.hspeed() < 250 ? here.w / 2 - 22 : 12;
      const along = here.t === 'block' ? (p.pos[0] - here.x) * hx + (z - here.cz) * hz > runway : z < here.z1 + 90;
      take = along;
      if (t.t === 'pad' && here.t === 'pad') take = false;
    }
    return { forward: 1, yaw, jump: take };
  };
}

const only = process.argv[2], cpArg = +(process.argv[3] || 0);
let ok = true;
for (const name of gauntlet) {
  if (only && only !== name) continue;
  const c = courses[name];
  const p = new P.Player(world);
  let sp = c.spawn;
  if (cpArg) sp = world.triggers.find(t => t.course === name && t.type === 'checkpoint' && t.idx === cpArg).spawn;
  p.reset(sp.pos, sp.yaw);
  const b = brain(c.plan);
  const seen = []; let res = 'timeout';
  for (let i = 0; i < 30000; i++) {
    const cmd = Object.assign({ forward: 0, side: 0, jump: false, duck: false, yaw: 0, pitch: 0 }, b(p, i));
    p.tick(cmd, 0.01);
    if (process.env.V && i % +process.env.V === 0) console.log(i, p.pos.map(v => v | 0).join(','), 'hs', p.hspeed() | 0, p.onGround ? 'G' : '', JSON.stringify(cmd));
    p.events.length = 0;
    for (const t of p.triggersTouching()) if (!seen.includes(t) && t.type !== 'start') {
      seen.push(t);
      if (t.type === 'kill') { res = 'killed at ' + p.pos.map(v => v | 0); i = 1e9; }
      if (t.type === 'end') { res = 'FINISHED in ' + (i / 100).toFixed(1) + 's at ' + (p.hspeed() | 0) + ' u/s'; i = 1e9; }
    }
  }
  if (res === 'timeout') res = 'timeout at ' + p.pos.map(v => v | 0);
  if (!res.startsWith('FINISHED')) ok = false;
  console.log(name + ' ' + c.name + (cpArg ? ' from cp ' + cpArg : '') + ':', res, '| checkpoints', seen.filter(t => t.type === 'checkpoint').map(t => t.idx).join(',') || 'none');
}
process.exit(ok ? 0 : 1);
