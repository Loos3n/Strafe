// One bot for every route-kit level (Surf, Bhop, Canyon, Stairway,
// Crossover). Each level is a list of legs that turn corners; the bot works
// in the current leg's frame (x right, forward is -z) and rides whatever
// piece is ahead: pads, block lines, speed lanes, ramps, banks, slides and
// wallrun gaps, and the Night City's curved ramps. Usage: node test/routes.js [level] [checkpoint]   V=50 traces
require('../src/physics.js'); require('../src/map.js');
const noisy = require('./noise.js')();
const P = globalThis.StrafePhysics; const M = globalThis.StrafeMap.buildMap(P), { world, courses } = M;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const LEVELS = ['surf', 'bhop', 'canyon', 'stairway', 'crossover'].concat(globalThis.StrafeMap.buildMap(P).gauntlet.filter(n => courses[n].route), globalThis.StrafeMap.buildMap(P).night, globalThis.StrafeMap.buildMap(P).harbor, globalThis.StrafeMap.buildMap(P).skyline);

function frameOf(lg) {
  const f = DIRS[lg.h], r = DIRS[(lg.h + 1) % 4];
  const yaw = Math.atan2(-f[0], -f[1]);
  // world -> local: x = along right, z = -(along forward)
  const vec = (wx, wz) => [wx * r[0] + wz * r[1], -(wx * f[0] + wz * f[1])];
  const pt = (wx, wz) => vec(wx - lg.ox, wz - lg.oz);
  return { yaw, vec, pt, items: lg.items, curveIn: lg.curveIn };
}
function strafeTo(q, i, tx, tz) {
  const vdir = Math.atan2(-q.vel[0], -q.vel[2]);
  const err = wrap(Math.atan2(-(tx - q.pos[0]), -(tz - q.pos[2])) - vdir);
  let side = err > 0 ? -1 : 1;
  if (Math.abs(err) < 0.06) side = (i >> 4) & 1 ? 1 : -1;
  return { forward: 0, side, yaw: vdir };
}
const rampAim = (q, r) => r.t === 'curve' ? [r.cx + r.dir * 200, Math.min(r.z0 - 300, q.pos[2] - 600)]
  : [r.cx + (q.pos[0] < r.cx ? -200 : 200), Math.min(r.z0 - 300, q.pos[2] - 600)];
const isRamp = (it) => it.t === 'ramp' || it.t === 'curve';
// where a block stands at time t: swaying blocks slide out and back
const ease = (t, T) => (1 - Math.cos(Math.PI * t / T)) / 2;
const bx = (it, t) => it.sway ? it.base + it.sway * ease(t, it.time) : it.x;
// is a gate's door up clear of your head over [t0, t1]?
const gateOpen = (g, t0, t1) => { for (let t = t0; t <= t1; t += 0.02) if (g.up * ease(t, g.time) < 110) return false; return true; };
// curved ramps are ridden in world coordinates, piece by piece
function curveAt(curves, p, slack) {
  for (const c of curves) for (let j = 0; j < c.chords.length; j++) {
    const r = c.chords[j], dx = p.pos[0] - r.x, dz = p.pos[2] - r.z;
    const a = dx * r.fx + dz * r.fz, l = dx * r.rx + dz * r.rz;
    if (a >= -12 && a <= r.len + 12 && Math.abs(l) <= r.W + slack && p.pos[1] > r.apex - r.H - 300 && p.pos[1] < r.apex + 400) return { c, j, r, l };
  }
  return null;
}

function brain(F, st) {
  // q: the player seen in this leg's frame
  return (p, q, n, i) => {
    const plan = F.items, z = q.pos[2], now = i * 0.01;
    if (p.wallrun) st.lastSide = p.wallrun.side; else if (p.onGround) st.lastSide = 0;
    // climbing a wall or pulling up onto it: keep pushing in
    if (p.climb || p.mantle) return { forward: 1, yaw: 0 };
    // a zipline: let it carry you, then fly for the pad under its end
    if (p.zip) return { yaw: 0 };
    const zp = plan.find(it => it.t === 'zip' && z <= it.z0 + 200 && z >= it.z1);
    if (zp && !p.onGround && !p.wallrun && z > zp.z0 - 300) {
      // under the cable's line where we'll meet it
      const u = Math.min(1, Math.max(0, (zp.z0 - z + 300) / (zp.z0 - zp.z1))), cx = zp.x + (zp.ex - zp.x) * u;
      return { forward: 1, yaw: Math.atan2(-(cx - q.pos[0]), 300) };
    }
    if (n) st.ramp = plan.findIndex(it => it.t === 'ramp' && z <= it.z0 + 50 && z >= it.z1 - 50);
    if (p.onGround) st.ramp = -1;
    if (n && st.ramp >= 0) {
      const r = plan[st.ramp];
      const into = n[0] < 0 ? 1 : -1;
      const off = (q.pos[0] - r.cx) * into;
      return { side: off < -170 ? into : 0, yaw: 0 };
    }
    if (st.ramp >= 0) {
      const r = plan[st.ramp];
      if (z > r.z1 + 900) { const [ax, az] = rampAim(q, r); return strafeTo(q, i, ax, az); }
      const nx = plan[st.ramp + 1];
      if (isRamp(nx)) { const [ax, az] = rampAim(q, nx); return strafeTo(q, i, ax, az); }
      return strafeTo(q, i, nx.x, Math.min(nx.z0 - 500, z - 600));
    }
    // a slide roof: crouch down it
    const sl = plan.find(it => it.t === 'slide' && z <= it.z0 + 5 && z >= it.z1);
    if (sl && p.onGround) return { forward: 1, duck: true, yaw: Math.atan2(-(sl.x - q.pos[0]) * 0.5, 300) };
    // a wallrun gap: hold the line, kick off the wall late
    const wl = plan.find(it => it.t === 'wall' && z <= it.z0 + 5 && z >= it.z1 - 60);
    // kicked off the wall: fly for whatever comes after it
    const kicked = wl && !p.onGround && !p.wallrun && st.lastSide && (plan[plan.indexOf(wl) + 1] || {}).t === 'block' ? plan.indexOf(wl) + 1 : 0;
    if (wl && !p.onGround && !kicked) {
      // < 0: short of the wall. Steer for it only on the way in
      const off = (q.pos[0] - wl.x - wl.side * 285) * wl.side, seek = !p.wallrun && !st.lastSide;
      return { forward: seek && off < -50 ? 0 : 1, yaw: 0, side: seek && off < 0 ? wl.side : 0, jump: !!(p.wallrun && p.wallrun.t > (wl.kick || 0.9) && !p.prevJump) };
    }
    // wall to wall: strafe for the wall ahead, run it, kick across near its end
    const ww = plan.find(it => it.t === 'w2w' && z <= it.z0 + 5 && z >= it.z1 - 60);
    if (ww && !p.onGround) {
      const j = p.wallrun ? ww.walls.findIndex(w => w.side === p.wallrun.side) : -1;
      if (p.wallrun) {
        const w = ww.walls.reduce((a, b) => (b.side === p.wallrun.side && z <= b.z0 + 40 && z >= b.z1 - 40) ? b : a, null) || ww.walls[j];
        const last = w === ww.walls[ww.walls.length - 1];
        return { forward: 1, yaw: 0, jump: !p.prevJump && z < w.z1 + (last ? (ww.lastKick || 200) : (ww.kickAt || 330)) };
      }
      // the next wall: the first one not behind us whose side is not the wall we just left
      const nw = ww.walls.find(w => z > w.z1 + 150 && w.side !== st.lastSide);
      // side key alone gains sideways speed in the air; W again once beside the wall
      if (nw) return (nw.wx - q.pos[0]) * nw.side > 70 ? { forward: 0, yaw: 0, side: nw.side } : { forward: 1, yaw: 0, side: nw.side };
      return { forward: 1, yaw: 0, side: 0 };
    }
    const cur = plan.findIndex(it => (it.t === 'pad' || it.t === 'lane' || it.t === 'block') && z <= it.z0 + 2 && z >= it.z1 - 2 && Math.abs(q.pos[1] - it.y) < 4 && p.onGround);
    let k = plan.findIndex(it => it.z0 < z - (it.t === 'block' ? 0 : 2));
    if (cur >= 0) k = cur + 1;
    if (kicked && plan[kicked] && plan[kicked].t === 'block') k = kicked;
    if (k < 0) k = plan.length - 1;
    const t = plan[Math.min(k, plan.length - 1)];
    const here = plan[cur];
    // a gate ahead on this pad: wait short of it until it will be open as we pass
    const gt = here && here.gates && p.onGround && here.gates.find(g => z > g.z + 10);
    if (gt) {
      const d = z - gt.z, tA = d / Math.max(q.hspeed, 230) + (q.hspeed < 150 ? 0.3 : 0);
      if (!gateOpen(gt, now + tA - 0.12, now + tA + 0.2) && d < 420) return { yaw: Math.atan2(-q.vel[0], -q.vel[2]) };
      if (d < 420) return { forward: 1, yaw: Math.atan2(-(here.x - q.pos[0]), 300) };
    }
    // a slot: crouch into a slide under it
    if (here && here.slots && here.slots.some(sz => z - sz < 320 && z > sz - 80)) return { forward: 1, duck: true, yaw: Math.atan2(-(here.x - q.pos[0]), 300) };
    // vault rails: hop them as they come
    if (here && here.vaults && p.onGround && here.vaults.some(vz => z - vz < 38 && z - vz > 0)) return { forward: 1, jump: true, yaw: Math.atan2(-(here.x - q.pos[0]), 300) };
    // the next thing is a zipline: run straight under it and jump off the edge
    if (t.t === 'zip' && p.onGround) return { forward: 1, yaw: Math.atan2(-(t.x - q.pos[0]), Math.max(120, Math.min(400, z - (here ? here.z1 : z)))), jump: !!here && z < here.z1 + 40 };
    // after a slide the next thing is a ramp below: fly at it
    if (isRamp(t)) {
      const [ax, az] = rampAim(q, t);
      if (!p.onGround) return strafeTo(q, i, ax, az);
      if (here && here.t === 'block') return { forward: 1, yaw: Math.atan2(-(ax - q.pos[0]), -(t.z0 - 200 - z)), jump: z < here.cz - 10 };
      // line up with the ramp before the edge, then hop on
      const edgeZ = here ? here.z1 : z - 100;
      const lined = Math.abs(q.pos[0] - ax) < 120;
      const aimZ = lined ? t.z0 - 200 : Math.max(edgeZ + 60, Math.min(z - 150, edgeZ + Math.abs(q.pos[0] - ax)));
      return { forward: 1, yaw: Math.atan2(-(ax - q.pos[0]), -(aimZ - z)), jump: lined && z < edgeZ + 80 };
    }
    if (t.t === 'slide') return { forward: 1, yaw: Math.atan2(-(t.x - q.pos[0]), 300) };
    // a climb: run square at the wall and jump into it
    if (t.climb && (here || !p.onGround) && z < t.z0 + 400) return { forward: 1, yaw: Math.atan2(-(t.x - q.pos[0]) * 0.3, 300), jump: z < t.z0 + 34 };
    if (t.t === 'w2w') {
      const w0 = t.walls[0], want = t.x + w0.side * (t.half - (t.inset || 30));
      return { forward: 1, yaw: 0, side: !p.onGround ? w0.side : (q.pos[0] - want) * w0.side < -5 ? w0.side : (q.pos[0] - want) * w0.side > 5 ? -w0.side : 0, jump: p.onGround && here && z < here.z1 + 40 };
    }
    if (t.t === 'wall' && here && here.t === 'block') {
      // off the last block of a line: hop at the wall's near end
      const want = t.x + t.side * 270;
      return { forward: 1, yaw: Math.atan2(-(want - q.pos[0]), -(t.z0 - 250 - z)), jump: (z - here.cz) < 10 };
    }
    if (t.t === 'wall') {
      const s = t.side, want = t.x + s * 280;
      return { forward: 1, yaw: 0, side: !p.onGround ? 0 : (q.pos[0] - want) * s < -5 ? s : (q.pos[0] - want) * s > 5 ? -s : 0, jump: p.onGround && here && z < here.z1 + 40 };
    }
    // a speed lane: hop the whole way and strafe up speed for the long jump
    const over = !p.onGround && plan.find(it => it.t === 'lane' && z <= it.z0 && z >= it.z1);
    if (here && here.t === 'lane' || over || (!p.onGround && t.t === 'lane')) {
      const ln = here && here.t === 'lane' ? here : over || t;
      const nxt = plan[plan.indexOf(ln) + 1];
      const hop = true;
      if (!p.onGround && z > ln.z1 + 150 && (q.hspeed < 560 || Math.abs(q.pos[0] - ln.x) > 40)) return Object.assign(strafeTo(q, i, ln.x, Math.max(ln.z1 - 200, z - 700)), { jump: hop });
      if (!p.onGround) return { forward: 1, yaw: Math.atan2(-(ln.x - q.pos[0]), -(ln.z1 - 400 - z)), jump: hop };
      return { forward: 1, yaw: Math.atan2(-(ln.x - q.pos[0]), 400), jump: hop };
    }
    // off an updraft: aim well onto the roof, not its front edge
    let tx = bx(t, now);
    if (t.sway && !p.onGround) {
      const dy0 = q.pos[1] - t.y, disc0 = q.vel[1] * q.vel[1] + 1600 * dy0;
      if (disc0 >= 0) tx = bx(t, now + (q.vel[1] + Math.sqrt(disc0)) / 800);
    } else if (t.sway) tx = bx(t, now + 0.6);
    const tz = t.t === 'block' ? t.cz : Math.max(t.z1 + 100, Math.min(t.z0 - (here && here.launch || (!p.onGround && plan[k - 1] && plan[k - 1].launch) ? 700 : 120), z - 300));
    const dx = tx - q.pos[0], dz = tz - z;
    const yaw = Math.atan2(-dx, -dz);
    if (p.onGround && here && here.t === 'pad' && q.hspeed > 420) return { yaw: Math.atan2(-q.vel[0], -q.vel[2]) }; // brake
    if (!p.onGround) {
      const g = 800, dy = q.pos[1] - t.y, vy = q.vel[1];
      const disc = vy * vy + 2 * g * dy;
      if (disc < 0) return strafeTo(q, i, tx, tz);
      const T = (vy + Math.sqrt(disc)) / g;
      if (T < 0.02) return { forward: 1, yaw };
      const wx = dx / T, wz = dz / T;
      if (Math.hypot(wx, wz) > q.hspeed + 15) return strafeTo(q, i, tx, tz);
      const ex = wx - q.vel[0], ez = wz - q.vel[2];
      if (Math.hypot(ex, ez) < 6) return {};
      return { forward: 1, yaw: Math.atan2(-ex, -ez) };
    }
    let take = true;
    if (here) {
      const hx = -Math.sin(yaw), hz = -Math.cos(yaw);
      take = here.t === 'block' ? (q.pos[0] - bx(here, now)) * hx + (z - here.cz) * hz > 12 : z < here.z1 + 90;
      if (t.t === 'pad' && here.t === 'pad' && t.y <= here.y + 1 && t.z0 >= here.z1 - 5) take = false;
      if (t.t === 'lane' && here.t !== 'block') take = z < here.z1 + 90;
    }
    return { forward: 1, yaw, jump: take };
  };
}

function run(name, cpArg) {
  const c = courses[name];
  const frames = c.legs.map(frameOf);
  const p = new P.Player(world);
  let sp = c.spawn;
  if (cpArg) sp = world.triggers.find(t => t.course === name && t.type === 'checkpoint' && t.idx === cpArg).spawn;
  p.reset(sp.pos, sp.yaw);
  // the leg whose first pad holds the spawn, or the last one whose heading matches
  let k = 0;
  frames.forEach((F, j) => { const [lx, lz] = F.pt(sp.pos[0], sp.pos[2]); if (Math.abs(wrap(F.yaw - sp.yaw)) < 0.01 && F.items.some(it => it.t !== 'ramp' && lz <= it.z0 + 1 && lz >= it.z1 - 1 && Math.abs(lx - it.x) <= it.w / 2 + 1 && Math.abs(sp.pos[1] - it.y) < 2)) k = j; });
  const states = frames.map(() => ({ ramp: -1 }));
  const curves = [].concat(...c.legs.map(lg => lg.items.filter(it => it.t === 'curve')));
  const brains = frames.map((F, j) => brain(F, states[j]));
  const seen = []; let res = 'timeout';
  for (let i = 0; i < (+process.env.MAXT || 30000); i++) {
    // step onto the next leg once standing on its corner pad
    if (k < frames.length - 1 && frames[k + 1].curveIn) {
      // past a bend's exit
      const [lx, lz] = frames[k + 1].pt(p.pos[0], p.pos[2]);
      if (lz < 0 && Math.abs(lx) < 1500) k++;
    } else if (k < frames.length - 1 && p.onGround) {
      const N = frames[k + 1], [lx, lz] = N.pt(p.pos[0], p.pos[2]), c0 = N.items[0];
      if (lz <= c0.z0 && lz >= c0.z1 && Math.abs(lx - c0.x) <= c0.w / 2 && Math.abs(p.pos[1] - c0.y) < 4) k++;
    }
    const F = frames[k];
    const [lx, lz] = F.pt(p.pos[0], p.pos[2]), [vx, vz] = F.vec(p.vel[0], p.vel[2]);
    const q = { pos: [lx, p.pos[1], lz], vel: [vx, p.vel[1], vz], hspeed: Math.hypot(vx, vz) };
    const tr = world.trace(p.pos, [p.pos[0], p.pos[1] - 8, p.pos[2]], p.hull);
    let n = tr.normal && tr.normal[1] < 0.7 && tr.normal[1] > 0.05 ? tr.normal : null;
    if (n) { const [nx, nz] = F.vec(n[0], n[2]); n = [nx, n[1], nz]; }
    let c0;
    const cv = curves.length && curveAt(curves, p, 80);
    if (cv && !(k < frames.length - 1 && frames[k + 1].curveIn && frames[k + 1].pt(p.pos[0], p.pos[2])[1] < 0)) {
      const { c: cu, j, r, l } = cv;
      const nw = tr.normal && tr.normal[1] < 0.7 && tr.normal[1] > 0.05 ? tr.normal : null;
      states[k].ramp = -1;
      if (nw) {
        // on the face: look down this piece, push toward the ridge when low
        const into = nw[0] * r.rx + nw[2] * r.rz < 0 ? 1 : -1;
        c0 = { side: l * into < -(+process.env.RIDE || 0.5) * r.W ? into : 0, yaw: r.hd - F.yaw };
      } else {
        // above it: steer back onto the inside face a little way on
        const t = cu.chords[Math.min(cu.chords.length - 1, j + 3)], u = cu.dir * 0.5 * t.W;
        const s = strafeTo(p, i, t.x + t.rx * u, t.z + t.rz * u);
        c0 = { side: s.side, yaw: s.yaw - F.yaw };
      }
    } else c0 = brains[k](p, q, n, i);
    const cmd = { forward: c0.forward || 0, side: c0.side || 0, jump: !!c0.jump, duck: !!c0.duck, yaw: (c0.yaw === undefined ? 0 : c0.yaw) + F.yaw, pitch: 0 };
    noisy(cmd);
    if (world.movers.length) world.setTime(i * 0.01);
    p.tick(cmd, 0.01);
    p.prevJump = cmd.jump;
    if (process.env.V && i % +process.env.V === 0) console.log(i, 'leg', k, 'x', lx | 0, 'y', p.pos[1] | 0, 'z', lz | 0, 'hs', p.hspeed() | 0, p.onGround ? 'G' : '', p.wallrun ? 'WR' : '', p.slide ? 'SL' : '', p.mantle ? 'MA' : '', p.climb ? 'CL' : '', p.events.map(e => e.type).join(' '));
    p.events.length = 0;
    for (const t of p.triggersTouching()) if (!seen.includes(t) && t.type !== 'start') {
      seen.push(t);
      if (t.type === 'kill') { res = 'killed at leg ' + k + ' x ' + (lx | 0) + ' z ' + (lz | 0) + ' y ' + (p.pos[1] | 0); i = 1e9; }
      if (t.type === 'end') { res = 'FINISHED in ' + (i / 100).toFixed(1) + 's at ' + (p.hspeed() | 0) + ' u/s'; i = 1e9; }
    }
  }
  if (res === 'timeout') { const [lx, lz] = frames[k].pt(p.pos[0], p.pos[2]); res = 'timeout at leg ' + k + ' x ' + (lx | 0) + ' z ' + (lz | 0) + ' y ' + (p.pos[1] | 0); }
  console.log(name + (cpArg ? ' from cp ' + cpArg : '') + ':', res, '| checkpoints', seen.filter(t => t.type === 'checkpoint').map(t => t.idx).join(',') || 'none');
  return res.startsWith('FINISHED');
}

module.exports = { run, M, P };
if (require.main === module) {
// no checkpoint given: run from the start and then from every checkpoint
const only = process.argv[2], cpArg = process.argv[3];
let ok = true;
for (const name of LEVELS) {
  if (only && only !== name) continue;
  const cps = cpArg !== undefined ? [+cpArg] : [0].concat(world.triggers.filter(t => t.course === name && t.type === 'checkpoint').map(t => t.idx));
  for (const cp of cps) ok = run(name, cp) && ok;
}
process.exit(ok ? 0 : 1);
}
