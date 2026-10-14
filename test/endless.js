// Endless: build a course from a seed and have the route bot ride every
// section, each from its start (or the gate before it) to its own gate.
// Usage: node test/endless.js [first seed] [seeds] [sections]
const { run, M } = require('./routes.js');
const seed0 = +(process.argv[2] || 1), seeds = +(process.argv[3] || 3), N = +(process.argv[4] || 12);
const { world, courses } = M;
let ok = true, fails = [];
for (let sd = seed0; sd < seed0 + seeds; sd++) {
  const E = M.endless(sd);
  const built = [];
  for (let k = 0; k < N; k++) built.push(E.section());
  const rk = E.builder;
  let lo = Infinity;
  for (const s of built) for (const b of s.brushes) if (!b.props.nonsolid && !b.props.far) lo = Math.min(lo, b.min[1]);
  const kill = world.addTrigger([-1e6, lo - 4000, -1e6], [1e6, lo - 600, 1e6], { type: 'kill', course: 'endless' });
  const legOf = (lg) => ({ ox: lg.ox, oz: lg.oz, h: lg.h, items: lg.items, curveIn: !!lg.curveIn });
  courses.endless = { spawn: rk.spawn, stages: N + 1, legs: rk.legs.map(lg => ({ ox: lg.ox, oz: lg.oz, h: lg.h, items: lg.items, curveIn: !!lg.curveIn })) };
  const gates = world.triggers.filter(t => t.course === 'endless' && t.type === 'checkpoint');
  // the game keeps the section behind you and two ahead: ride with just those
  const base = { brushes: world.brushes.filter(b => b.endless === undefined), triggers: world.triggers.filter(t => t.endless === undefined),
    ziplines: world.ziplines.filter(z => z.endless === undefined) };
  for (let c = 0; c < N; c++) {
    const near = built.filter(x => x.k >= c - 1 && x.k <= c + 2);
    for (const key of ['brushes', 'triggers', 'ziplines']) world[key] = base[key].concat(...near.map(x => x[key]));
    for (const g of gates) g.type = g.idx === c + 1 ? 'end' : 'checkpoint';
    // and the bot only knows the legs of those sections
    courses.endless.legs = rk.legs.slice(near[0].legs[0], near[near.length - 1].legs[1]).map(legOf);
    // falls end at the level of the lowest piece around, as fellOff() in the game
    let nlo = Infinity; for (const x of near) for (const b of x.brushes) if (!b.props.nonsolid && !b.props.far) nlo = Math.min(nlo, b.min[1]);
    kill.max[1] = nlo - 700; kill.min[1] = nlo - 5000;
    const tiers = built[c].tier;
    process.stdout.write('seed ' + sd + ' section ' + c + ' (tier ' + tiers + ', y ' + Math.round(built[c].brushes[0].min[1]) + ') ');
    const r = run('endless', c || undefined);
    if (!r) { ok = false; fails.push(sd + ':' + c); }
  }
  // clear this seed's course out of the world
  for (const key of ['brushes', 'ziplines']) world[key] = base[key];
  world.triggers = base.triggers.filter(t => t !== kill);
}
console.log(ok ? 'all sections finished' : 'FAILED: ' + fails.join(' '));
process.exit(ok ? 0 : 1);
