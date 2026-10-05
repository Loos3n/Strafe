// Bhop line probe. For every block line in every level it asks: if you hold
// one steady speed and aim each jump at the next block, which speeds get you
// from the pad before the line to whatever comes after it? Landing further on
// (skipping a block) is fine, and a player who is fast aims for the block
// they will reach; landing in a gap is not. The share of speeds
// from 300 to 600 that work is the line's speed tolerance. Low tolerance means
// the line is hard because of speed control (strafe a little too much and you
// land in a gap), which is the kind of hard to keep out of early levels.
// Usage: node test/hoplines.js [level]      prints one row per line
require('../src/physics.js'); require(process.env.MAP || '../src/map.js');
const P = globalThis.StrafePhysics;
const M = globalThis.StrafeMap.buildMap(P), { world, courses } = M;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// every level's pieces in order, as world boxes {t, x, y, z, hx, hz}
function itemsOf(name) {
  const c = courses[name];
  if (c.plan) return c.plan.map(q => q.t === 'ramp' ? { t: 'other' } : q.t === 'block'
    ? { t: 'block', x: q.x, y: q.y, z: q.cz, hx: q.w / 2, hz: (q.d || q.w) / 2 }
    : { t: 'pad', x: q.x, y: q.y, z: (q.z0 + q.z1) / 2, hx: q.w / 2, hz: Math.abs(q.z0 - q.z1) / 2 })
    .concat([]);
  if (c.legs) {
    const out = [];
    for (const lg of c.legs) {
      const f = DIRS[lg.h], r = DIRS[(lg.h + 1) % 4];
      const at = (x, z) => [lg.ox + r[0] * x + f[0] * -z, lg.oz + r[1] * x + f[1] * -z];
      for (const it of lg.items) {
        if (it.t === 'block' || it.t === 'pad' || it.t === 'lane') {
          const zc = it.t === 'block' ? it.cz : (it.z0 + it.z1) / 2, hw = it.w / 2, hd = it.t === 'block' ? (it.d || it.w) / 2 : Math.abs(it.z0 - it.z1) / 2;
          const [x, z] = at(it.x, zc), swap = lg.h % 2 === 1;
          out.push({ t: it.t === 'lane' ? 'pad' : it.t, x, y: it.y, z, hx: swap ? hd : hw, hz: swap ? hw : hd });
        } else out.push({ t: 'other' });
      }
    }
    return out;
  }
  if (name === 'spire') {
    return world.brushes.filter(b => (b.props.kind === 'block' || b.props.kind === 'pad') && b.min[0] < -30000 && b.min[0] > -50000)
      .map(b => ({ t: b.props.kind, x: (b.min[0] + b.max[0]) / 2, y: b.max[1], z: (b.min[2] + b.max[2]) / 2, hx: (b.max[0] - b.min[0]) / 2, hz: (b.max[2] - b.min[2]) / 2 }));
  }
  return [];
}
// block lines: a standing piece, then blocks, then what follows (if it is something to stand on)
function linesOf(name) {
  const it = itemsOf(name), lines = [];
  for (let i = 1; i < it.length; i++) {
    if (it[i].t !== 'block' || it[i - 1].t === 'block') continue;
    let j = i; while (j < it.length && it[j].t === 'block') j++;
    if (it[i - 1].t !== 'pad') continue;
    lines.push({ from: it[i - 1], blocks: it.slice(i, j), to: it[j] && it[j].t === 'pad' ? it[j] : null });
  }
  return lines;
}
const on = (p, b) => Math.abs(p.pos[0] - b.x) <= b.hx + 16 && Math.abs(p.pos[2] - b.z) <= b.hz + 16 && Math.abs(p.pos[1] - b.y) < 3;
// hold speed v, steer perfectly at the next block's centre, hop on every landing
function tryLine(L, v) {
  const p = new P.Player(L.world || world);
  const a = L.from, b0 = L.blocks[0];
  const dx = b0.x - a.x, dz = b0.z - a.z, d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d;
  // the edge of the start pad toward the first block
  const t = Math.min(a.hx / Math.max(Math.abs(ux), 1e-6), a.hz / Math.max(Math.abs(uz), 1e-6));
  const sx = a.x + ux * (t - 30), sz = a.z + uz * (t - 30);
  p.reset([sx, a.y, sz], Math.atan2(-ux, -uz));
  p.vel = [ux * v, 0, uz * v];
  const targets = L.blocks.concat(L.to ? [L.to] : []);
  let k = 0, air = false, aim = null;
  const lo = Math.min(a.y, ...targets.map(q => q.y)) - 120;
  for (let i = 0; i < 4000; i++) {
    // on the ground, pick the block this speed will carry you to (a player
    // who is a bit fast goes for a further block) and aim at its centre; in
    // the air keep that heading
    if (p.onGround || !aim) {
      let tg = targets[Math.min(k, targets.length - 1)], err = Infinity;
      for (let j = k; j < Math.min(targets.length, k + 3); j++) {
        const q = targets[j], fall = p.pos[1] - q.y, vj = 302;
        const T = (vj + Math.sqrt(Math.max(0, vj * vj + 1600 * fall))) / 800, e = Math.abs(Math.hypot(q.x - p.pos[0], q.z - p.pos[2]) - v * T);
        if (e < err - 1) { err = e; tg = q; }
      }
      const hx = tg.x - p.pos[0], hz = tg.z - p.pos[2], hd = Math.hypot(hx, hz) || 1; aim = [hx / hd, hz / hd];
    }
    p.tick({ forward: 0, side: 0, jump: true, duck: false, yaw: Math.atan2(-aim[0], -aim[1]), pitch: 0 }, 0.01);
    p.events.length = 0;
    // the probe: exactly speed v along the aim
    p.vel[0] = aim[0] * v; p.vel[2] = aim[1] * v;
    if (!p.onGround) { air = true; }
    else if (air) {
      air = false;
      // landed: on which piece?
      let hit = -1;
      // overshooting onto a later block is fine: you just carry on from there
      for (let j = k; j < Math.min(targets.length, k + 4); j++) if (on(p, targets[j])) { hit = j; break; }
      if (hit < 0 && k === 0 && on(p, L.from)) continue; // still on the start pad
      if (hit < 0 && k > 0 && on(p, targets[k - 1])) hit = k - 1; // landed short on the same block: fine
      if (process.env.DBG) console.log('land', k, p.pos.map(v => v | 0).join(','), 'target', targets[k] && [targets[k].x, targets[k].y, targets[k].z].join(','), hit);
      if (hit < 0) return false;
      if (hit === targets.length - 1 && L.to) return true;
      k = hit + 1;
    }
    if (!L.to && k >= targets.length) return true;  // off the last block, toward a ramp
    if (p.pos[1] < lo) return false;
  }
  return false;
}
// speed tolerance: of the steady speeds from 300 to 600 (what a player
// carries after a few strafes), the share that gets through
const SPEEDS = []; for (let v = 300; v <= 600; v += 10) SPEEDS.push(v);
function windowOf(L) {
  const ok = SPEEDS.map(v => [v, tryLine(L, v)]);
  // the widest run of working speeds
  let best = null, cur = null;
  for (const [v, g] of ok) { if (g) { cur = cur ? [cur[0], v] : [v, v]; if (!best || cur[1] - cur[0] > best[1] - best[0]) best = cur.slice(); } else cur = null; }
  return { best, share: ok.filter(o => o[1]).length / ok.length };
}
module.exports = { linesOf, windowOf, itemsOf, P };
if (require.main === module) {
  const only = process.argv[2];
  const names = ['bhop', 'stairway', 'crossover', 'spire'].concat(M.gauntlet, M.night);
  for (const name of names) {
    if (only && !only.split(',').includes(name)) continue;
    linesOf(name).forEach((L, i) => {
      const sizes = L.blocks.map(b => Math.min(b.hx, b.hz) * 2);
      const steps = L.blocks.slice(1).map((b, j) => Math.hypot(b.x - L.blocks[j].x, b.z - L.blocks[j].z));
      const w = windowOf(L);
      console.log([name, 'line ' + (i + 1), 'n ' + L.blocks.length, 'size ' + Math.min(...sizes), 'step ' + (steps.length ? Math.round(Math.max(...steps)) : '-'),
        'tolerance ' + Math.round(w.share * 100) + '%', 'widest ' + (w.best ? w.best[0] + '-' + w.best[1] : 'none')].join('  '));
    });
  }
}
