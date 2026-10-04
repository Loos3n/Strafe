// Bot runs over the three advanced levels (Cascade, Spire, Freerun).
// Usage: node test/advanced.js [level] [checkpoint]
require('../src/physics.js'); require('../src/map.js');
const P = globalThis.StrafePhysics; const { world, courses } = globalThis.StrafeMap.buildMap(P);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const face = (p) => {
  const tr = world.trace(p.pos, [p.pos[0], p.pos[1] - 8, p.pos[2]], p.hull);
  return tr.normal && tr.normal[1] < 0.7 && tr.normal[1] > 0.05 ? tr.normal : null;
};
// Air strafe toward a point: face along velocity and strafe to the side that
// turns us toward it. Zigzag when lined up, which is where speed comes from.
function strafeTo(p, i, tx, tz) {
  const vdir = Math.atan2(-p.vel[0], -p.vel[2]);
  const err = wrap(Math.atan2(-(tx - p.pos[0]), -(tz - p.pos[2])) - vdir);
  let side = err > 0 ? -1 : 1;
  if (Math.abs(err) < 0.06) side = (i >> 4) & 1 ? 1 : -1;
  return { side, yaw: vdir };
}


function clone(p) {
  const q = Object.assign(Object.create(Object.getPrototypeOf(p)), p);
  for (const k of Object.keys(q)) if (Array.isArray(q[k])) q[k] = q[k].slice();
  q.events = []; q.plan = null;
  return q;
}
const cascadeR = courses.cascade.ramps;
const cascadeFloor = world.triggers.find(t => t.course === 'cascade' && t.type === 'kill').max[1];
const rampAt = (p) => cascadeR.findIndex(r => p.pos[2] <= r.z0 && p.pos[2] >= r.z1 && Math.abs(p.pos[0] - r.cx) <= r.W + 40);
function cascadePolicy(p, i, o) {
  const R = cascadeR, n = face(p);
  let k = R.findIndex(r => p.pos[2] <= r.z0 + 300 && p.pos[2] >= r.z1);
  if (k < 0) k = R.findIndex(r => p.pos[2] > r.z0);
  if (k < 0) k = R.length - 1;
  const r = R[k];
  if (n) {
    // ride a line below the apex on whichever face we are on
    const into = n[0] < 0 ? 1 : -1;
    const off = (p.pos[0] - r.cx) * into;
    return { side: off < -o.ride * r.W ? into : 0, yaw: 0 };
  }
  // in the air: steer to a point on the target ramp's near face
  const t = p.pos[2] > r.z1 + 900 ? r : (R[k + 1] || r);
  const nx = t.cx + (p.pos[0] < t.cx ? -1 : 1) * o.aim * t.W;
  return strafeTo(p, i, nx, Math.min(t.z0 - 300, p.pos[2] - 600));
}
const brains = {
  // Cascade: a simple ride-and-aim policy, steered by a planner that tries a
  // few aim points every quarter second and keeps the one whose rollout gets
  // furthest down the ramps. Fine aim is what the narrow ramps ask of a player.
  cascade(p, i) {
    if (!p.started) p.started = !!face(p);
    if (!p.started) return { forward: 1, yaw: -1.05 };
    if (!p.plan || (i % 25 === 0 && !face(p))) {
      let best = -Infinity;
      for (const aim of [-0.4, 0, 0.3, 0.6, 0.9, 1.2]) for (const ride of [0.3, 0.6]) {
        const q = clone(p), o = { aim, ride };
        let j = 0, top = -1;
        for (; j < 320; j++) {
          q.tick(Object.assign({ forward: 0, side: 0, jump: false, duck: false, yaw: 0, pitch: 0 }, cascadePolicy(q, i + j, o)), 0.01);
          q.events.length = 0;
          const n = face(q);
          if (n) top = Math.max(top, rampAt(q));
          if (q.pos[1] < cascadeFloor) break;
        }
        const score = top * 1e6 + (q.pos[1] < cascadeFloor ? j : 1e4) - q.pos[2] * 0.01;
        if (score > best) { best = score; p.plan = o; }
      }
    }
    return cascadePolicy(p, i, p.plan);
  },
  spire(p, i) {
    if (!this.route) this.route = world.brushes.filter(b => (b.props.kind === 'block' || b.props.kind === 'pad') && b.min[0] < -30000)
      .map(b => [(b.min[0] + b.max[0]) / 2, b.max[1], (b.min[2] + b.max[2]) / 2, b.props.kind, (b.max[0] - b.min[0]) / 2]);
    const route = this.route;
    if (p.wp === undefined) {
      p.wp = 1; let best = 1e9;
      route.forEach((t, j) => { const d = Math.hypot(t[0] - p.pos[0], t[2] - p.pos[2]) + Math.abs(t[1] - p.pos[1]); if (d < best) { best = d; p.wp = j + 1; } });
    }
    const t = route[Math.min(p.wp, route.length - 1)];
    const dx = t[0] - p.pos[0], dz = t[2] - p.pos[2];
    if (p.onGround && Math.abs(p.pos[1] - t[1]) < 2 && Math.hypot(dx, dz) < 90) p.wp++;
    const yaw = Math.atan2(-dx, -dz);
    const prev = route[p.wp - 1];
    let farHalf = true;
    if (p.onGround && prev) {
      const hx = -Math.sin(yaw), hz = -Math.cos(yaw);
      farHalf = (p.pos[0] - prev[0]) * hx + (p.pos[2] - prev[2]) * hz > (prev[3] === 'pad' ? 100 : 15);
    }
    // gain speed with air strafes until the landing is in reach, then steer in
    if (!p.onGround && p.hspeed() < 360 && Math.hypot(dx, dz) > 150) {
      const s = strafeTo(p, i, t[0], t[2]);
      return { forward: 0, side: s.side, yaw: s.yaw, jump: true };
    }
    return { forward: 1, jump: farHalf, yaw };
  },
  freerun(p, i) {
    const fx = 44000, z = p.pos[2], x = p.pos[0] - fx, y = p.pos[1];
    const n = face(p);
    const jumpOnce = (c) => { const j = c && !p.prevJump; return j; };
    if (z > -1500) return { forward: 1, jump: (z < -560 && z > -640) || (z < -1030 && z > -1080) || z < -1330 };
    if (z > -2200) return { forward: 1, duck: z < -1900, side: z < -2130 && x > -360 ? -1 : 0 };
    if (z > -3300 && !p.wallrun && !p.ranBoard) return { forward: 1, side: x > -360 ? -1 : 0, jump: z < -2560 && p.onGround, yaw: p.onGround ? 0 : 0.3 };
    if (z > -3300) { p.ranBoard = true; return { forward: 1, yaw: 0, jump: !!(p.wallrun && p.wallrun.t > 1.2 && !p.prevJump) }; }
    if (z > -4500) return { forward: 1, jump: z < -4330, side: x > 30 ? -1 : x < -30 ? 1 : 0 };
    if (z > -5450) return { forward: 1, jump: z < -5340 && p.onGround, side: p.onGround ? (x < 120 ? 1 : 0) : 0, yaw: p.onGround ? 0 : 0 };
    if (z > -6950) {
      const j = p.wallrun && p.wallrun.t > 0.45;
      return { forward: 1, jump: !!j, yaw: p.wallrun ? 0 : (p.lastWall && p.lastWall[0] < 0 ? 0.35 : -0.35) };
    }
    if (z > -9050) return { forward: 1, duck: z < -7900, jump: false, side: x > 30 ? -1 : x < -30 ? 1 : 0 };
    if (n) return { side: n[0] < 0 ? (x < -150 ? 1 : 0) : (x > 150 ? -1 : 0) };
    if (z > -12800) return { side: x > 100 ? -1 : x < -100 ? 1 : (p.onGround ? -1 : 0) };
    if (z > -15700) {
      // aim at the next vent ahead
      const lat = [0, 70, -70, 60, -60, 0, 0];
      const k = Math.max(0, Math.min(6, Math.ceil((-13800 - z + 40) / 300)));
      const tz = k < 6 ? -13800 - k * 300 : -15900;
      const on = Math.round((-13800 - z) / 300), lip = on >= 5 ? 55 : 20; // the last vent: jump from its edge for the long gap
      const far = !p.onGround || z < -13800 - on * 300 - lip || z > -13700;
      return { forward: 1, jump: z < -13530 && far, side: lat[k] - x > 15 ? 1 : lat[k] - x < -15 ? -1 : 0, yaw: 0 };
    }
    if (z > -16950) {
      const j = (p.onGround && z < -16330) || (p.wallrun && p.wallrun.t > 0.9 && !p.prevJump);
      return { forward: 1, side: x < 330 && !p.wallrun ? 1 : 0, jump: !!j, yaw: p.onGround || p.wallrun ? 0 : -0.3 };
    }
    return { forward: 1, side: x > 30 ? -1 : x < -30 ? 1 : 0, jump: z < -17700 };
  },
};

const only = process.argv[2], cpArg = +(process.argv[3] || 0);
let ok = true;
for (const name of Object.keys(brains)) {
  if (only && only !== name) continue;
  const p = new P.Player(world);
  let sp = courses[name].spawn;
  if (cpArg) sp = world.triggers.find(t => t.course === name && t.type === 'checkpoint' && t.idx === cpArg).spawn;
  p.reset(sp.pos, sp.yaw);
  const brain = brains[name].bind({});
  const seen = []; let res = 'timeout at ' + 0;
  let i = 0;
  for (; i < 20000; i++) {
    const cmd = Object.assign({ forward: 0, side: 0, jump: false, duck: false, yaw: 0, pitch: 0 }, brain(p, i));
    p.tick(cmd, 0.01);
    p.prevJump = cmd.jump;
    if (process.env.V && i % (+process.env.V || 50) === 0) console.log(i, p.pos.map(v => v | 0).join(','), 'hs', p.hspeed() | 0, p.onGround ? 'G' : '', p.wallrun ? 'WR' : '', p.climb ? 'CL' : '', p.slide ? 'SL' : '', p.events.map(e => e.type).join(' '));
    if (process.env.D && i >= +process.env.D && i < +process.env.D + 40) console.log(i, p.pos.map(v => v | 0).join(','), JSON.stringify(cmd), p.wallrun && JSON.stringify(p.wallrun), p.events.map(e => e.type).join(' '));
    p.events.length = 0;
    for (const t of p.triggersTouching()) if (!seen.includes(t) && t.type !== 'start') {
      seen.push(t);
      if (t.type === 'kill') { res = 'killed at ' + p.pos.map(v => v | 0); i = 1e9; }
      if (t.type === 'end' && name === 'cascade' && p.pos[1] < -200) { res = 'finish is under the water at ' + p.pos.map(v => v | 0); i = 1e9; }
      else if (t.type === 'end') { res = 'FINISHED in ' + (i / 100).toFixed(1) + 's at ' + (p.hspeed() | 0) + ' u/s'; i = 1e9; }
    }
  }
  if (res.startsWith('timeout')) res = 'timeout at ' + p.pos.map(v => v | 0);
  if (!res.startsWith('FINISHED')) ok = false;
  console.log(name + (cpArg ? ' from cp ' + cpArg : '') + ':', res, '| checkpoints', seen.filter(t => t.type === 'checkpoint').map(t => t.idx).join(',') || 'none');
}
process.exit(ok ? 0 : 1);
