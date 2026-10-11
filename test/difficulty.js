// How forgiving is each level? Runs the level bots with aim noise (see
// noise.js) over many seeds, from the start and from every checkpoint, and
// reports how often each section is cleared. The bots are not players, so
// the numbers are only good for comparing levels with each other: a level
// later in a set should clear less often than the ones before it.
// Usage: node test/difficulty.js [levels,comma,separated] [seeds] [noise]
const { spawn } = require('child_process');
const path = require('path');
require('../src/physics.js'); require('../src/map.js');
const M = globalThis.StrafeMap.buildMap(globalThis.StrafePhysics);
const RUNNER = { roofs: 'city', downtown: 'city', cascade: 'advanced', spire: 'advanced', freerun: 'advanced' };
for (const n of M.gauntlet) RUNNER[n] = 'gauntlet';
for (const n of ['surf', 'bhop', 'canyon', 'stairway', 'crossover'].concat(M.night, M.harbor)) RUNNER[n] = 'routes';
const levels = process.argv[2] ? process.argv[2].split(',') : M.order.concat(M.gauntlet, M.night, M.harbor);
const SEEDS = +(process.argv[3] || 8), NOISE = process.argv[4] || '0.06';
const cps = (n) => M.world.triggers.filter(t => t.course === n && t.type === 'checkpoint').map(t => t.idx).sort((a, b) => a - b);
const jobs = [];
for (const n of levels) {
  const c = [0].concat(cps(n));
  c.forEach((s, i) => { for (let seed = 1; seed <= SEEDS; seed++) jobs.push({ n, s, next: c[i + 1] || null, seed }); });
}
const res = {};
let running = 0, done = 0;
function run(j) {
  return new Promise((ok) => {
    const ch = spawn(process.execPath, [path.join(__dirname, RUNNER[j.n] + '.js'), j.n, String(j.s)], { env: Object.assign({}, process.env, { NOISE, SEED: String(j.seed) }) });
    let out = ''; ch.stdout.on('data', d => out += d); ch.stderr.on('data', d => out += d);
    ch.on('close', () => {
      const line = out.split('\n').find(l => l.startsWith(j.n)) || '';
      const seen = ((line.match(/checkpoints ([\d,]+)/) || [])[1] || '').split(',').filter(Boolean).map(Number);
      const pass = j.next ? seen.includes(j.next) : /FINISHED/.test(line);
      ((res[j.n] = res[j.n] || {})[j.s] = res[j.n][j.s] || []).push(pass);
      ok();
    });
  });
}
(async () => {
  const q = jobs.slice(), workers = +(process.env.WORKERS || require('os').cpus().length || 2);
  await Promise.all(Array.from({ length: workers }, async () => { while (q.length) { await run(q.shift()); done++; if (process.env.V) process.stderr.write(done + '/' + jobs.length + '\r'); } }));
  console.log('level      sections cleared (start, cp1, ...)        whole run');
  for (const n of levels) {
    const secs = Object.keys(res[n] || {}).map(Number).sort((a, b) => a - b).map(s => res[n][s].filter(Boolean).length / res[n][s].length);
    const whole = secs.reduce((a, b) => a * b, 1);
    console.log(n.padEnd(10), secs.map(x => (Math.round(x * 100) + '%').padStart(5)).join(' ').padEnd(42), (Math.round(whole * 100) + '%').padStart(5), '  ' + M.courses[n].name + ' (' + M.courses[n].difficulty + ')');
  }
})();
