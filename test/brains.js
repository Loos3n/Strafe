// Scripted bot inputs for whole-level runs. Crude, but if a bot can finish
// a level a person certainly can.
const cx = -14000;
const BANKS = [{ side: -1, z0: 600, z1: -4400 }, { side: 1, z0: -2400, z1: -7400 }, { side: -1, z0: -5400, z1: -10400 }, { side: 1, z0: -8400, z1: -13400 }];
const surfFace = (p, world) => {
  const tr = world.trace(p.pos, [p.pos[0], p.pos[1] - 8, p.pos[2]], p.hull);
  return tr.normal && tr.normal[1] < 0.7 && tr.normal[1] > 0.05 ? tr.normal : null;
};
module.exports = {
  canyon(p, i, world) {
    if (!p.started) p.started = !!surfFace(p, world);
    if (!p.started) return { forward: 1, yaw: -0.9 };
    const look = p.pos[2] - 150;
    let tgt = BANKS[0];
    for (const b of BANKS) if (look <= b.z0 && look >= b.z1) tgt = b;
    const dist = (p.pos[0] - cx) * tgt.side;
    return { side: dist < 300 ? tgt.side : 0, yaw: 0 };
  },
  crossover(p, i, world) {
    const n = surfFace(p, world);
    const z = p.pos[2], x = p.pos[0];
    if (z > 15000) return { forward: 1, jump: z < 15420 };
    if (z > 13500) return { forward: 1, duck: true };
    if (n) return { side: n[0] < 0 ? (x < -150 ? 1 : 0) : (x > 150 ? -1 : 0) };
    if (z > 9200) return { side: x > 100 ? -1 : x < -100 ? 1 : (p.onGround ? -1 : 0) };
    if (z > 6700) return { forward: 1, side: x < -30 ? 1 : x > 30 ? -1 : 0, jump: true };
    const j = (p.onGround && z < 6020) || (p.wallrun && p.wallrun.t > 0.9 && !p.prevJump);
    return { forward: 1, side: p.onGround && x < 250 ? 1 : 0, jump: !!j };
  },
};
// Stairway: aim at the next block or island along the route and hop.
let route = null;
module.exports.stairway = function (p, i, world) {
  if (!route) route = world.brushes.filter(b => (b.props.kind === 'block' || b.props.kind === 'pad') && b.min[0] > 9000)
    .map(b => [(b.min[0] + b.max[0]) / 2, b.max[1], (b.min[2] + b.max[2]) / 2, b.props.kind]);
  if (p.wp === undefined) p.wp = 1;
  const t = route[Math.min(p.wp, route.length - 1)];
  const dx = t[0] - p.pos[0], dz = t[2] - p.pos[2];
  if (Math.hypot(dx, dz) < 60 || (p.onGround && Math.abs(p.pos[1] - t[1]) < 2 && Math.hypot(dx, dz) < 100)) p.wp++;
  const yaw = Math.atan2(-dx, -dz);
  // On corner islands, settle and turn before hopping on.
  const prev = route[p.wp - 1];
  const onIsland = prev && prev[3] === 'pad' && p.onGround;
  const vdir = Math.atan2(-p.vel[0], -p.vel[2]);
  const aligned = Math.abs(Math.atan2(Math.sin(vdir - yaw), Math.cos(vdir - yaw))) < 0.15 && p.hspeed() > 200;
  // hop from the far half of the block we stand on
  let farHalf = true;
  if (p.onGround && prev) {
    const hx = -Math.sin(yaw), hz = -Math.cos(yaw);
    farHalf = (p.pos[0] - prev[0]) * hx + (p.pos[2] - prev[2]) * hz > (prev[3] === 'pad' ? 60 : 10);
  }
  return { forward: 1, jump: t[3] === 'pad' ? !p.onGround : ((!onIsland || aligned) && farHalf), yaw };
};
