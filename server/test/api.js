// End to end test against a running server: npx wrangler dev, then
// node test/api.js [http://127.0.0.1:8787]
import fs from 'fs';
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const [run] = JSON.parse(fs.readFileSync(new URL('./run-g1.json', import.meta.url)));
let ok = true;
const check = (name, cond, info) => { console.log((cond ? 'PASS ' : 'FAIL ') + name, info ?? ''); if (!cond) ok = false; };
const call = async (path, body, tok) => {
  const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: Object.assign({ 'content-type': 'application/json' }, tok ? { authorization: 'Bearer ' + tok } : {}), body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const tag = Math.random().toString(36).slice(2, 7);

const a = await call('/api/register', { name: 'Ana ' + tag });
check('register', a.status === 200 && a.body.token, JSON.stringify(a.body));
const dup = await call('/api/register', { name: 'ANA ' + tag });
check('name taken (any case)', dup.status === 409);
check('bad name', (await call('/api/register', { name: 'x' })).status === 400);
const b = await call('/api/register', { name: 'Ben ' + tag });
check('no token', (await call('/api/run', { course: run.key, ticks: run.ticks, ghost: run.ghost })).status === 401);
check('wrong token', (await call('/api/me', null, a.body.id + '.' + '0'.repeat(32))).status === 401);

// cheats
const g = run.ghost, s = g.s.slice();
const fast = s.slice(); for (let i = 5 * 40; i < fast.length; i += 5) fast[i + 2] -= 600; // jumps 600 forward mid-run
check('reject teleport', (await call('/api/run', { course: run.key, ticks: run.ticks, ghost: { e: 4, s: fast } }, a.body.token)).status === 422);
check('reject short time', (await call('/api/run', { course: run.key, ticks: run.ticks - 400, ghost: g }, a.body.token)).status === 422);
check('reject no ghost', (await call('/api/run', { course: run.key, ticks: run.ticks }, a.body.token)).status === 422);
const late = s.slice(5 * 30); // starts part way in
check('reject not from start', (await call('/api/run', { course: run.key, ticks: (late.length / 5 - 1) * 4, ghost: { e: 4, s: late } }, a.body.token)).status === 422);
check('reject other level', (await call('/api/run', { course: 'g2_v2', ticks: run.ticks, ghost: g }, a.body.token)).status === 422);

// real runs
const r1 = await call('/api/run', { course: run.key, ticks: run.ticks, ghost: g }, a.body.token);
check('accept real run', r1.status === 200 && r1.body.best && r1.body.mine.ticks === run.ticks, JSON.stringify(r1.body));
const r2 = await call('/api/run', { course: run.key, ticks: run.ticks + 3, ghost: { e: 4, s: s.concat(s.slice(-5)) } }, b.body.token);
check('second player', r2.status === 200, JSON.stringify(r2.body));
const r3 = await call('/api/run', { course: run.key, ticks: run.ticks + 3, ghost: { e: 4, s: s.concat(s.slice(-5)) } }, a.body.token);
check('slower run keeps best', r3.status === 200 && !r3.body.best && r3.body.mine.ticks === run.ticks);
const board = await call('/api/board?course=' + run.key + '&me=' + b.body.id);
const mine = board.body.rows.filter(r => r.name.endsWith(tag));
check('board order', mine.length === 2 && mine[0].name === 'Ana ' + tag && mine[1].name === 'Ben ' + tag && board.body.mine.ticks === run.ticks + 3, JSON.stringify(mine));
const gh = await call('/api/ghost?course=' + run.key + '&id=' + a.body.id);
check('ghost download', gh.status === 200 && gh.body.ghost.s.length === s.length && gh.body.name === 'Ana ' + tag);

// the daily challenge (a local server run with --var DAILY_FORCE:g1_v2 pins it to this run's level)
const dl = await call('/api/daily?me=' + a.body.id);
check('daily', dl.status === 200 && /^\d{4}-\d\d-\d\d$/.test(dl.body.day) && typeof dl.body.course === 'string' && dl.body.ends > dl.body.now && Array.isArray(dl.body.rows), JSON.stringify(dl.body).slice(0, 200));
check('daily stays put', (await call('/api/daily')).body.course === dl.body.course);
if (dl.body.course === run.key) {
  check('run counts on the daily board', r1.body.daily && r1.body.daily.mine.ticks === run.ticks && dl.body.mine.ticks === run.ticks, JSON.stringify(r1.body.daily));
  const db = await call('/api/board?course=d:' + dl.body.day);
  check('daily board', db.status === 200 && db.body.rows.some(r => r.id === a.body.id));
  check('daily ghost', (await call('/api/ghost?course=d:' + dl.body.day + '&id=' + a.body.id)).status === 200);
} else check('other levels skip the daily board', r1.body.daily === null, JSON.stringify(r1.body.daily));
check('no posting to the daily board directly', (await call('/api/run', { course: 'd:' + dl.body.day, ticks: run.ticks, ghost: g }, a.body.token)).status === 400);

// rename and import
check('rename', (await call('/api/name', { name: 'Anna ' + tag }, a.body.token)).body.name === 'Anna ' + tag);
check('rename to taken', (await call('/api/name', { name: 'ben ' + tag }, a.body.token)).status === 409);
const im = await call('/api/import', { times: { roofs: 9000, [run.key]: run.ticks + 50, nope: 100 } }, a.body.token);
check('import older times', im.body.imported === 1, JSON.stringify(im.body));
check('import only once', (await call('/api/import', { times: { surf_v3: 9000 } }, a.body.token)).body.imported === 0);
const me = await call('/api/me', null, a.body.token);
check('me', me.body.name === 'Anna ' + tag && me.body.times.roofs === 9000 && me.body.times[run.key] === run.ticks && me.body.imported);
const rb = await call('/api/board?course=roofs');
check('imported time is marked', rb.body.rows.some(r => r.id === a.body.id && r.legacy && !r.ghost));

// a race between two players
const ws = (name) => new Promise((res, rej) => {
  const w = new WebSocket(BASE.replace('http', 'ws') + '/race/T' + tag.toUpperCase().replace(/[^A-Z0-9]/g, 'X'));
  w.msgs = []; w.onmessage = (e) => w.msgs.push(JSON.parse(e.data));
  w.onopen = () => { w.send(JSON.stringify({ t: 'hello', name })); res(w); }; w.onerror = rej;
  w.onclose = (e) => { if (!w.closing) console.log('socket closed by server', name, e.code, e.reason); };
});
const wait = (w, f, ms = 3000) => new Promise((res) => {
  const t0 = Date.now(), iv = setInterval(() => { const m = w.msgs.find(f); if (m || Date.now() - t0 > ms) { clearInterval(iv); res(m); } }, 20);
});
const h = await ws('Host ' + tag);
const you = await wait(h, m => m.t === 'you');
const j = await ws('Joiner ' + tag);
const both = await wait(h, m => m.t === 'room' && m.players.length === 2);
check('race room with two', both && both.host === you.id, JSON.stringify(both && both.players));
j.send(JSON.stringify({ t: 'level', course: 'g1', key: run.key }));
h.send(JSON.stringify({ t: 'level', course: 'g1', key: run.key }));
const lv = await wait(j, m => m.t === 'room' && m.course === 'g1');
check('only host picks level', lv && lv.host === you.id);
h.send(JSON.stringify({ t: 'start' }));
const go = await wait(j, m => m.t === 'room' && m.phase === 'race');
check('start with countdown', go && go.startAt - go.now > 3000, go && go.startAt - go.now);
h.send(JSON.stringify({ t: 's', p: [1, 2, 3], y: 157, d: 0, c: 1 }));
const st = await wait(j, m => m.t === 's');
check('positions relay', st && st.id === you.id && st.p[2] === 3);
h.send(JSON.stringify({ t: 'fin', ticks: 0 }));
check('no finishing before the go', !(await wait(j, m => m.t === 'room' && m.players.some(p => p.fin !== null), 500)));
await new Promise(r => setTimeout(r, go.startAt - go.now + 300));
h.send(JSON.stringify({ t: 'fin', ticks: 0 }));
await new Promise(r => setTimeout(r, 400));
j.send(JSON.stringify({ t: 'fin', ticks: 0 }));
const done = await wait(h, m => m.t === 'room' && m.phase === 'results');
const fins = done ? done.players.map(p => p.fin).sort((x, y) => x - y) : [];
check('results timed by the room', done && fins[0] >= 25 && fins[0] < 200 && fins[1] - fins[0] >= 35, JSON.stringify(fins));
if (!done) console.log('host saw', JSON.stringify(h.msgs.slice(-3)));
h.closing = true; h.close();
const handed = await wait(j, m => m.t === 'room' && m.players.length === 1);
check('host leaves, joiner takes over', handed && handed.host === handed.players[0].id);
j.closing = true; j.close();
// community levels: a start pad, a floor and a finish, and a run down it
const S0 = (name, rows) => 'S0' + Buffer.from(JSON.stringify([1, name, rows])).toString('base64url');
const rows = [[4, 0, 0, 0, 0, 384, 384, 48], [1, 0, 0, -640, 0, 384, 640, 64], [6, 0, 0, -1280 - tag.charCodeAt(0), 0, 384, 384, 48]];
const code = S0('Test ' + tag, rows);
const runDown = (step) => { const g = { e: 4, s: [] }; for (let z = 0; z >= -1280 - tag.charCodeAt(0); z -= step) g.s.push(600000, 1, z, 0, 0); return [g, (g.s.length / 5 - 1) * 4]; };
const [lrun, lticks] = runDown(10), [fastRun, fastTicks] = runDown(13);
check('publish needs a name', (await call('/api/levels/publish', { name: 'Test ' + tag, code, ticks: lticks, ghost: lrun })).status === 401);
check('publish needs a finish', (await call('/api/levels/publish', { name: 'Test ' + tag, code: S0('x', rows.slice(0, 2)), ticks: lticks, ghost: lrun }, a.body.token)).status === 400);
check('publish needs a clear', (await call('/api/levels/publish', { name: 'Test ' + tag, code, ticks: lticks, ghost: { e: 4, s: lrun.s.slice(0, -50) } }, a.body.token)).status === 422);
check('publish bad name', (await call('/api/levels/publish', { name: '<b>', code, ticks: lticks, ghost: lrun }, a.body.token)).status === 400);
const pub = await call('/api/levels/publish', { name: 'Test ' + tag, code, ticks: lticks, ghost: lrun }, a.body.token);
check('publish', pub.status === 200 && /^[A-Z0-9]{6}$/.test(pub.body.id), JSON.stringify(pub.body));
const lid = pub.body.id, lkey = 'c:' + lid;
// the newer editor pieces (curved ramp, lava, launch pad) read on the server too
const rows2 = rows.concat([[9, 0, 400, -600, 0, 448, 1600, 0, 60, 90], [16, 900, 0, -600, 0, 512, 512, 32], [17, -900, 24, -600, 0, 256, 256, 0, 45, 900]]);
const pub2 = await call('/api/levels/publish', { name: 'Pieces ' + tag, code: S0('Pieces ' + tag, rows2), ticks: lticks, ghost: lrun }, a.body.token);
check('publish with new pieces', pub2.status === 200, JSON.stringify(pub2.body));
if (pub2.status === 200) await call('/api/levels/delete', { id: pub2.body.id }, a.body.token);
check('publish same level twice', (await call('/api/levels/publish', { name: 'Again ' + tag, code: S0('Other', rows), ticks: lticks, ghost: lrun }, a.body.token)).status === 409);
const found = await call('/api/levels?sort=new&q=' + encodeURIComponent('test ' + tag) + '&me=' + b.body.id);
check('browse finds it', found.body.levels.length === 1 && found.body.levels[0].id === lid && found.body.levels[0].author === 'Anna ' + tag && found.body.levels[0].runners === 1, JSON.stringify(found.body));
check('search by author', (await call('/api/levels?by=' + a.body.id)).body.levels.some(l => l.id === lid));
const got = await call('/api/level?id=' + lid + '&play=1');
check('level with code and a play', got.body.code === code && got.body.plays === 1 && got.body.best === lticks && got.body.authorTicks === lticks, JSON.stringify(Object.assign({}, got.body, { code: undefined })));
check('own like refused', (await call('/api/levels/like', { id: lid, on: true }, a.body.token)).status === 403);
const lk = await call('/api/levels/like', { id: lid, on: true }, b.body.token);
check('like', lk.body.likes === 1 && lk.body.liked, JSON.stringify(lk.body));
check('like twice counts once', (await call('/api/levels/like', { id: lid, on: true }, b.body.token)).body.likes === 1);
check('liked shows', (await call('/api/level?id=' + lid + '&me=' + b.body.id)).body.liked === true);
check('top sort', (await call('/api/levels?sort=top')).body.levels[0].likes >= 1);
const lr = await call('/api/run', { course: lkey, ticks: fastTicks, ghost: fastRun }, b.body.token);
check('run on a community level', lr.status === 200 && lr.body.mine.rank === 1, JSON.stringify(lr.body));
check('community board', (await call('/api/board?course=' + lkey)).body.rows.length === 2);
check('community cheat refused', (await call('/api/run', { course: lkey, ticks: 200, ghost: { e: 4, s: lrun.s.slice(0, 255) } }, b.body.token)).status === 422);
check('unlike', (await call('/api/levels/like', { id: lid, on: false }, b.body.token)).body.likes === 0);
check('only the author takes it down', (await call('/api/levels/delete', { id: lid }, b.body.token)).status === 403);
check('take down', (await call('/api/levels/delete', { id: lid }, a.body.token)).body.deleted);
check('level gone', (await call('/api/level?id=' + lid)).status === 404 && (await call('/api/board?course=' + lkey)).status === 404);

// clean up: the test players remove themselves
for (const p of [a, b]) check('delete me', (await call('/api/delete-me', {}, p.body.token)).body.deleted);
check('gone from board', !(await call('/api/board?course=' + run.key)).body.rows.some(r => r.name.endsWith(tag)));
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
