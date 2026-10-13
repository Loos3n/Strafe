// Strafe online: one leaderboard for the browser, desktop and phone builds,
// and live race rooms. A Cloudflare Worker in front of two kinds of
// Durable Object: Board (one, holds players, times and ghosts in SQLite)
// and Race (one per room code, websockets between the racers).
import { DurableObject } from 'cloudflare:workers';
import { checkRun, cleanName } from './check.js';
import { decodeLevel, levelChecks, cleanLevelName } from './community.js';
import LEVELS from './levels.json';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });
const fail = (error, status = 400) => json({ error }, status);

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    if (url.pathname === '/') return json({ ok: true, game: 'strafe' });
    const race = url.pathname.match(/^\/race\/([A-Z0-9]{4,8})$/);
    if (race) {
      if (req.headers.get('upgrade') !== 'websocket') return fail('websocket only', 426);
      return env.RACE.get(env.RACE.idFromName(race[1])).fetch(req);
    }
    if (url.pathname.startsWith('/api/')) return env.BOARD.get(env.BOARD.idFromName('main')).fetch(req);
    return fail('not found', 404);
  },
};

const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const token = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
// community level ids: six letters and digits that can't be mixed up
const LEVEL_ID = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const levelId = () => [...crypto.getRandomValues(new Uint8Array(6))].map(b => LEVEL_ID[b % 32]).join('');
const PAGE = 30;
const DAILY_LIKES = 2, DAILY_COMMUNITY = 10;
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
// a week starts on Monday, UTC, and is named by that date
const weekOf = (ms) => { const d = new Date(ms); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); };
const dayHash = (day) => { let h = 2166136261; for (const c of day) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };

export class Board extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL, lname TEXT NOT NULL UNIQUE, key TEXT NOT NULL, created INTEGER NOT NULL, imported INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS times (course TEXT NOT NULL, player TEXT NOT NULL, ticks INTEGER NOT NULL, at INTEGER NOT NULL, legacy INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (course, player));
      CREATE INDEX IF NOT EXISTS times_rank ON times (course, ticks);
      CREATE TABLE IF NOT EXISTS ghosts (course TEXT NOT NULL, player TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (course, player));
      CREATE TABLE IF NOT EXISTS levels (id TEXT PRIMARY KEY, name TEXT NOT NULL, author TEXT NOT NULL, code TEXT NOT NULL, sig TEXT NOT NULL UNIQUE, chk TEXT NOT NULL,
        pieces INTEGER NOT NULL, created INTEGER NOT NULL, plays INTEGER NOT NULL DEFAULT 0, likes INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS levels_top ON levels (likes DESC, plays DESC, created DESC);
      CREATE INDEX IF NOT EXISTS levels_new ON levels (created DESC);
      CREATE INDEX IF NOT EXISTS levels_author ON levels (author);
      CREATE TABLE IF NOT EXISTS likes (level TEXT NOT NULL, player TEXT NOT NULL, PRIMARY KEY (level, player));
      CREATE TABLE IF NOT EXISTS daily (day TEXT PRIMARY KEY, course TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS weekly (week TEXT PRIMARY KEY, course TEXT NOT NULL);
    `);
    this.force = env && env.DAILY_FORCE; // local tests pin the daily level
    this.checks = new Map(); // community level run checks, parsed once
    this.hits = new Map(); // rate limits, kept in memory
    // once: clear the test players posted while setting the server up
    if (!this.one("SELECT 1 FROM sqlite_master WHERE name = 'wiped1'")) {
      this.sql.exec('DELETE FROM players; DELETE FROM times; DELETE FROM ghosts; CREATE TABLE wiped1 (x INTEGER);');
    }
  }
  limited(key, max, ms) {
    const now = Date.now(), h = (this.hits.get(key) || []).filter(t => now - t < ms);
    h.push(now); this.hits.set(key, h);
    if (this.hits.size > 5000) this.hits.clear();
    return h.length > max;
  }
  one(q, ...a) { const r = this.sql.exec(q, ...a).toArray(); return r[0] || null; }
  async auth(req) {
    const m = (req.headers.get('authorization') || '').match(/^Bearer ([0-9a-f]{16})\.([0-9a-f]{32})$/);
    if (!m) return null;
    const p = this.one('SELECT id, name, key, imported FROM players WHERE id = ?', m[1]);
    return p && p.key === await sha(m[2]) ? p : null;
  }
  standing(course, player) {
    const mine = this.one('SELECT ticks FROM times WHERE course = ? AND player = ?', course, player);
    if (!mine) return null;
    const ahead = this.one('SELECT COUNT(*) AS n FROM times WHERE course = ? AND ticks < ?', course, mine.ticks).n;
    return { rank: ahead + 1, ticks: mine.ticks };
  }
  // the run checks for a built-in level, or a community level ("c:<id>")
  levelFor(course) {
    if (typeof course !== 'string') return null;
    if (LEVELS[course]) return LEVELS[course];
    const d = course.match(/^d:(\d{4}-\d\d-\d\d)$/);
    if (d) { const r = this.one('SELECT course FROM daily WHERE day = ?', d[1]); return r ? this.levelFor(r.course) : null; }
    const w = course.match(/^w:(\d{4}-\d\d-\d\d)$/);
    if (w) { const r = this.one('SELECT course FROM weekly WHERE week = ?', w[1]); return r ? this.levelFor(r.course) : null; }
    if (!/^c:[A-Z0-9]{6}$/.test(course)) return null;
    if (!this.checks.has(course)) {
      const r = this.one('SELECT chk FROM levels WHERE id = ?', course.slice(2));
      if (!r) return null;
      this.checks.set(course, JSON.parse(r.chk));
    }
    return this.checks.get(course);
  }
  // a community level as the browser lists it
  levelRows(where, args, order, limit, offset, me) {
    return this.sql.exec(`SELECT l.id, l.name, l.author AS authorId, p.name AS author, l.likes, l.plays, l.created, l.pieces,
        (SELECT COUNT(*) FROM times t WHERE t.course = 'c:' || l.id) AS runners,
        (SELECT MIN(ticks) FROM times t WHERE t.course = 'c:' || l.id) AS best,
        (SELECT ticks FROM times t WHERE t.course = 'c:' || l.id AND t.player = l.author) AS authorTicks,
        EXISTS (SELECT 1 FROM likes k WHERE k.level = l.id AND k.player = ?) AS liked
      FROM levels l JOIN players p ON p.id = l.author ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, me || '', ...args, limit, offset).toArray()
      .map(r => Object.assign(r, { liked: !!r.liked }));
  }
  // The daily challenge: one level per UTC day, the same for everyone, with
  // its own board under "d:<day>". It's picked the first time anyone asks
  // that day, from the built-in levels and the top rated community levels,
  // by a hash of the date (never the same level two days running), then kept.
  dailyFor(day) {
    const have = this.one('SELECT course FROM daily WHERE day = ?', day);
    if (have) return have.course;
    const pool = Object.keys(LEVELS).filter(k => k !== 'tutorial')
      .concat(this.sql.exec('SELECT id FROM levels WHERE likes >= ? ORDER BY likes DESC, plays DESC, created LIMIT ?', DAILY_LIKES, DAILY_COMMUNITY).toArray().map(r => 'c:' + r.id));
    const prev = this.one('SELECT course FROM daily WHERE day = ?', dayOf(Date.parse(day) - 86400000));
    let i = dayHash(day) % pool.length;
    if (prev && pool[i] === prev.course) i = (i + 1) % pool.length;
    const course = this.force && this.levelFor(this.force) ? this.force : pool[i];
    this.sql.exec('INSERT INTO daily (day, course) VALUES (?, ?)', day, course);
    return course;
  }
  // The weekly challenge: the same idea over a week (Monday to Monday, UTC),
  // on board "w:<monday>". Never last week's level, nor today's daily.
  weeklyFor(week) {
    const have = this.one('SELECT course FROM weekly WHERE week = ?', week);
    if (have) return have.course;
    const pool = Object.keys(LEVELS).filter(k => k !== 'tutorial')
      .concat(this.sql.exec('SELECT id FROM levels WHERE likes >= ? ORDER BY likes DESC, plays DESC, created LIMIT ?', DAILY_LIKES, DAILY_COMMUNITY).toArray().map(r => 'c:' + r.id));
    const prev = this.one('SELECT course FROM weekly WHERE week = ?', weekOf(Date.parse(week) - 86400000));
    const today = this.dailyFor(dayOf(Date.now()));
    let i = dayHash('w' + week) % pool.length;
    for (let n = 0; n < 2 && ((prev && pool[i] === prev.course) || pool[i] === today); n++) i = (i + 1) % pool.length;
    const course = this.force && this.levelFor(this.force) ? this.force : pool[i];
    this.sql.exec('INSERT INTO weekly (week, course) VALUES (?, ?)', week, course);
    return course;
  }
  // a run on this week's level also goes on the weekly board
  weeklyRun(course, player, ticks, ghost) {
    const week = weekOf(Date.now());
    if (this.weeklyFor(week) !== course) return null;
    return this.challengeTime('w:' + week, player, ticks, ghost, { week });
  }
  challengeTime(key, player, ticks, ghost, out) {
    const cur = this.one('SELECT ticks FROM times WHERE course = ? AND player = ?', key, player);
    if (!cur || ticks < cur.ticks) {
      this.sql.exec('INSERT OR REPLACE INTO times (course, player, ticks, at, legacy) VALUES (?, ?, ?, ?, 0)', key, player, ticks, Date.now());
      this.sql.exec('INSERT OR REPLACE INTO ghosts (course, player, data) VALUES (?, ?, ?)', key, player, JSON.stringify({ e: ghost.e, s: ghost.s }));
    }
    return Object.assign(out, { best: !cur || ticks < cur.ticks, total: this.total(key), mine: this.standing(key, player) });
  }
  // a challenge (daily or weekly) as the game shows it: the level and its board
  challenge(key, course, me, out) {
    if (course.startsWith('c:')) {
      const [row] = this.levelRows('WHERE l.id = ?', [course.slice(2)], 'l.id', 1, 0, me);
      if (row) { row.code = this.one('SELECT code FROM levels WHERE id = ?', row.id).code; out.level = row; }
    } else out.name = LEVELS[course].name;
    out.rows = this.sql.exec(`SELECT t.player AS id, p.name, t.ticks, g.player IS NOT NULL AS ghost
      FROM times t JOIN players p ON p.id = t.player LEFT JOIN ghosts g ON g.course = t.course AND g.player = t.player
      WHERE t.course = ? ORDER BY t.ticks, t.at LIMIT 50`, key).toArray()
      .map((r, i) => ({ rank: i + 1, id: r.id, name: r.name, ticks: r.ticks, ghost: !!r.ghost }));
    out.total = this.total(key);
    out.mine = me ? this.standing(key, me) : null;
    return out;
  }
  // a run on today's daily level also goes on the daily board
  dailyRun(course, player, ticks, ghost) {
    const day = dayOf(Date.now());
    if (this.dailyFor(day) !== course) return null;
    return this.challengeTime('d:' + day, player, ticks, ghost, { day });
  }
  dropLevel(id) {
    // a daily that was this level goes too, so today's gets picked again
    for (const r of this.sql.exec('SELECT day FROM daily WHERE course = ?', 'c:' + id).toArray()) {
      for (const q of ['DELETE FROM times WHERE course = ?', 'DELETE FROM ghosts WHERE course = ?']) this.sql.exec(q, 'd:' + r.day);
      this.sql.exec('DELETE FROM daily WHERE day = ?', r.day);
    }
    for (const r of this.sql.exec('SELECT week FROM weekly WHERE course = ?', 'c:' + id).toArray()) {
      for (const q of ['DELETE FROM times WHERE course = ?', 'DELETE FROM ghosts WHERE course = ?']) this.sql.exec(q, 'w:' + r.week);
      this.sql.exec('DELETE FROM weekly WHERE week = ?', r.week);
    }
    for (const q of ['DELETE FROM times WHERE course = ?', 'DELETE FROM ghosts WHERE course = ?']) this.sql.exec(q, 'c:' + id);
    this.sql.exec('DELETE FROM likes WHERE level = ?', id);
    this.sql.exec('DELETE FROM levels WHERE id = ?', id);
    this.checks.delete('c:' + id);
  }
  total(course) { return this.one('SELECT COUNT(*) AS n FROM times WHERE course = ?', course).n; }

  async fetch(req) {
    const url = new URL(req.url), path = url.pathname.slice(4);
    const ip = req.headers.get('cf-connecting-ip') || 'local';
    if (this.limited('ip:' + ip, 240, 60000)) return fail('slow down', 429);
    let body = {};
    if (req.method === 'POST') {
      const text = await req.text();
      if (text.length > 1500000) return fail('too big', 413);
      try { body = JSON.parse(text || '{}'); } catch (e) { return fail('bad json'); }
    }

    if (path === '/board' && req.method === 'GET') {
      const course = url.searchParams.get('course');
      if (!this.levelFor(course)) return fail('unknown level', 404);
      const rows = this.sql.exec(`SELECT t.player AS id, p.name, t.ticks, t.legacy, g.player IS NOT NULL AS ghost
        FROM times t JOIN players p ON p.id = t.player LEFT JOIN ghosts g ON g.course = t.course AND g.player = t.player
        WHERE t.course = ? ORDER BY t.ticks, t.at LIMIT 50`, course).toArray()
        .map((r, i) => ({ rank: i + 1, id: r.id, name: r.name, ticks: r.ticks, ghost: !!r.ghost, legacy: !!r.legacy }));
      const me = url.searchParams.get('me');
      return json({ course, total: this.total(course), rows, mine: me ? this.standing(course, me) : null });
    }
    if (path === '/ghost' && req.method === 'GET') {
      const course = url.searchParams.get('course'), id = url.searchParams.get('id');
      const g = this.one(`SELECT g.data, p.name, t.ticks FROM ghosts g JOIN players p ON p.id = g.player JOIN times t ON t.course = g.course AND t.player = g.player
        WHERE g.course = ? AND g.player = ?`, course, id);
      if (!g) return fail('no ghost', 404);
      return json({ name: g.name, ticks: g.ticks, ghost: JSON.parse(g.data) });
    }
    // browse community levels: sort=top|new, q=search, by=author id, page
    if (path === '/levels' && req.method === 'GET') {
      // hard: the fewest finishers per play, once a level has a few plays
      const SORTS = { new: 'l.created DESC', played: 'l.plays DESC, l.likes DESC, l.created DESC',
        hard: '(l.plays < 3), (SELECT COUNT(*) FROM times t WHERE t.course = \'c:\' || l.id) * 1.0 / MAX(l.plays, 1), l.plays DESC' };
      const sort = SORTS[url.searchParams.get('sort')] || 'l.likes DESC, l.plays DESC, l.created DESC';
      const q = (url.searchParams.get('q') || '').trim().slice(0, 32);
      // by: one maker's id, or several (comma separated) for the makers you follow
      const by = (url.searchParams.get('by') || '').split(',').filter(x => /^[0-9a-f]{16}$/.test(x)).slice(0, 100);
      const page = Math.max(0, Math.min(100, parseInt(url.searchParams.get('page'), 10) || 0));
      const conds = [], args = [];
      if (q) { conds.push("(l.name LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\')"); const like = '%' + q.replace(/[\\%_]/g, c => '\\' + c) + '%'; args.push(like, like); }
      if (by.length) { conds.push('l.author IN (' + by.map(() => '?').join(',') + ')'); args.push(...by); }
      else if (url.searchParams.get('by')) return json({ levels: [], more: false, page });
      const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
      const rows = this.levelRows(where, args, sort, PAGE + 1, page * PAGE, url.searchParams.get('me'));
      return json({ levels: rows.slice(0, PAGE), more: rows.length > PAGE, page });
    }
    // one community level with its code; play=1 counts a play
    if (path === '/level' && req.method === 'GET') {
      const id = url.searchParams.get('id') || '';
      const [row] = this.levelRows('WHERE l.id = ?', [id], 'l.id', 1, 0, url.searchParams.get('me'));
      if (!row) return fail('That level is gone.', 404);
      if (url.searchParams.get('play') === '1' && !this.limited('play:' + ip + ':' + id, 1, 3600000)) {
        this.sql.exec('UPDATE levels SET plays = plays + 1 WHERE id = ?', id);
        row.plays++;
      }
      row.code = this.one('SELECT code FROM levels WHERE id = ?', id).code;
      return json(row);
    }
    // today's daily challenge with its board
    if (path === '/daily' && req.method === 'GET') {
      const now = Date.now(), day = dayOf(now), course = this.dailyFor(day);
      return json(this.challenge('d:' + day, course, url.searchParams.get('me'), { day, course, ends: Date.parse(day) + 86400000, now }));
    }
    // this week's challenge with its board; "day" is the Monday it started
    if (path === '/weekly' && req.method === 'GET') {
      const now = Date.now(), week = weekOf(now), course = this.weeklyFor(week);
      return json(this.challenge('w:' + week, course, url.searchParams.get('me'), { day: week, week: true, course, ends: Date.parse(week) + 7 * 86400000, now }));
    }
    if (path === '/register' && req.method === 'POST') {
      const name = cleanName(body.name);
      if (!name) return fail('Names are 2 to 16 letters, numbers, spaces, dots, dashes or underscores.');
      if (this.limited('reg:' + ip, 5, 3600000)) return fail('Too many new names from here. Try again later.', 429);
      if (this.one('SELECT id FROM players WHERE lname = ?', name.toLowerCase())) return fail('That name is taken.', 409);
      const id = token(8), key = token(16);
      this.sql.exec('INSERT INTO players (id, name, lname, key, created) VALUES (?, ?, ?, ?, ?)', id, name, name.toLowerCase(), await sha(key), Date.now());
      return json({ id, name, token: id + '.' + key });
    }

    const me = await this.auth(req);
    if (!me) return fail('sign in first', 401);
    if (path === '/me' && req.method === 'GET') {
      const times = {};
      for (const r of this.sql.exec('SELECT course, ticks FROM times WHERE player = ?', me.id)) times[r.course] = r.ticks;
      return json({ id: me.id, name: me.name, times, imported: !!me.imported });
    }
    if (path === '/name' && req.method === 'POST') {
      const name = cleanName(body.name);
      if (!name) return fail('Names are 2 to 16 letters, numbers, spaces, dots, dashes or underscores.');
      const taken = this.one('SELECT id FROM players WHERE lname = ?', name.toLowerCase());
      if (taken && taken.id !== me.id) return fail('That name is taken.', 409);
      this.sql.exec('UPDATE players SET name = ?, lname = ? WHERE id = ?', name, name.toLowerCase(), me.id);
      return json({ name });
    }
    if (path === '/run' && req.method === 'POST') {
      const { course, ticks, ghost } = body;
      if (this.limited('run:' + me.id, 30, 60000)) return fail('slow down', 429);
      if (typeof course === 'string' && /^[dw]:/.test(course)) return fail('Post the level, not the challenge board.');
      const err = checkRun(this.levelFor(course), ticks, ghost);
      if (err) return fail('Run not accepted: ' + err + '.', 422);
      const cur = this.one('SELECT ticks, legacy FROM times WHERE course = ? AND player = ?', course, me.id);
      const better = !cur || ticks < cur.ticks || (cur.legacy && ticks <= cur.ticks);
      if (better) {
        this.sql.exec('INSERT OR REPLACE INTO times (course, player, ticks, at, legacy) VALUES (?, ?, ?, ?, 0)', course, me.id, ticks, Date.now());
        this.sql.exec('INSERT OR REPLACE INTO ghosts (course, player, data) VALUES (?, ?, ?)', course, me.id, JSON.stringify({ e: ghost.e, s: ghost.s }));
      }
      return json({ best: better, total: this.total(course), mine: this.standing(course, me.id), daily: this.dailyRun(course, me.id, ticks, ghost), weekly: this.weeklyRun(course, me.id, ticks, ghost) });
    }
    // once per player: bring over best times set before the online board
    // existed, which have no replay to check. They show as older times.
    if (path === '/import' && req.method === 'POST') {
      if (me.imported) return json({ imported: 0 });
      let n = 0;
      for (const [course, ticks] of Object.entries(body.times || {})) {
        if (!LEVELS[course] || !Number.isInteger(ticks) || ticks < 100 || ticks > 360000) continue;
        const cur = this.one('SELECT ticks FROM times WHERE course = ? AND player = ?', course, me.id);
        if (cur && cur.ticks <= ticks) continue;
        this.sql.exec('INSERT OR REPLACE INTO times (course, player, ticks, at, legacy) VALUES (?, ?, ?, ?, 1)', course, me.id, ticks, Date.now());
        this.sql.exec('DELETE FROM ghosts WHERE course = ? AND player = ?', course, me.id);
        n++;
      }
      this.sql.exec('UPDATE players SET imported = 1 WHERE id = ?', me.id);
      return json({ imported: n });
    }
    // publish an editor level. It must come with a run that finishes it, so
    // every published level can be beaten; that run is the first on its board.
    if (path === '/levels/publish' && req.method === 'POST') {
      const name = cleanLevelName(body.name);
      if (!name) return fail('Level names are 2 to 32 letters, numbers, spaces or simple punctuation.');
      if (this.limited('pub:' + me.id, 10, 3600000) || this.limited('pubip:' + ip, 20, 3600000)) return fail('That is a lot of levels. Try again later.', 429);
      let level;
      try { level = await decodeLevel(body.code); } catch (e) { return fail('That level code did not read.'); }
      const chk = levelChecks(level.pieces);
      if (!chk) return fail('A level needs a Start and a Finish pad.');
      const err = checkRun(chk, body.ticks, body.ghost);
      if (err) return fail('Finish your level in a test run first (' + err + ').', 422);
      const sig = await sha(JSON.stringify(level.pieces));
      const dup = this.one('SELECT id, name FROM levels WHERE sig = ?', sig);
      if (dup) return fail('This level is already published as "' + dup.name + '" (' + dup.id + ').', 409);
      let id;
      do id = levelId(); while (this.one('SELECT 1 FROM levels WHERE id = ?', id));
      const now = Date.now();
      this.sql.exec('INSERT INTO levels (id, name, author, code, sig, chk, pieces, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        id, name, me.id, body.code, sig, JSON.stringify(chk), level.pieces.length, now);
      this.sql.exec('INSERT INTO times (course, player, ticks, at, legacy) VALUES (?, ?, ?, ?, 0)', 'c:' + id, me.id, body.ticks, now);
      this.sql.exec('INSERT INTO ghosts (course, player, data) VALUES (?, ?, ?)', 'c:' + id, me.id, JSON.stringify({ e: body.ghost.e, s: body.ghost.s }));
      return json({ id, name });
    }
    // thumbs up (on) or take it back (off)
    if (path === '/levels/like' && req.method === 'POST') {
      const lv = this.one('SELECT author FROM levels WHERE id = ?', String(body.id || ''));
      if (!lv) return fail('That level is gone.', 404);
      if (lv.author === me.id) return fail('You can\'t rate your own level.', 403);
      if (this.limited('like:' + me.id, 60, 60000)) return fail('slow down', 429);
      const had = !!this.one('SELECT 1 FROM likes WHERE level = ? AND player = ?', body.id, me.id);
      if (body.on && !had) this.sql.exec('INSERT INTO likes (level, player) VALUES (?, ?)', body.id, me.id);
      if (!body.on && had) this.sql.exec('DELETE FROM likes WHERE level = ? AND player = ?', body.id, me.id);
      this.sql.exec('UPDATE levels SET likes = (SELECT COUNT(*) FROM likes WHERE level = ?) WHERE id = ?', body.id, body.id);
      return json({ liked: !!body.on, likes: this.one('SELECT likes FROM levels WHERE id = ?', body.id).likes });
    }
    // authors can take their own levels down, with their boards
    if (path === '/levels/delete' && req.method === 'POST') {
      const lv = this.one('SELECT author FROM levels WHERE id = ?', String(body.id || ''));
      if (!lv) return fail('That level is gone.', 404);
      if (lv.author !== me.id) return fail('Only the author can take a level down.', 403);
      this.dropLevel(body.id);
      return json({ deleted: true });
    }
    // takes the player, their times, ghosts and levels off the board for good
    if (path === '/delete-me' && req.method === 'POST') {
      for (const r of this.sql.exec('SELECT id FROM levels WHERE author = ?', me.id).toArray()) this.dropLevel(r.id);
      for (const r of this.sql.exec('SELECT level FROM likes WHERE player = ?', me.id).toArray()) {
        this.sql.exec('DELETE FROM likes WHERE level = ? AND player = ?', r.level, me.id);
        this.sql.exec('UPDATE levels SET likes = (SELECT COUNT(*) FROM likes WHERE level = ?) WHERE id = ?', r.level, r.level);
      }
      this.sql.exec('DELETE FROM times WHERE player = ?', me.id);
      this.sql.exec('DELETE FROM ghosts WHERE player = ?', me.id);
      this.sql.exec('DELETE FROM players WHERE id = ?', me.id);
      return json({ deleted: true });
    }
    return fail('not found', 404);
  }
}

// A race room. Players join by code; the first in is the host, who picks
// the level and starts. Everyone gets the same start moment, sends where
// they are about ten times a second, and the room passes that on so each
// player sees the others as live ghosts. Times are counted from the go.
const MAX_PLAYERS = 8, COUNTDOWN = 4000, RACE_LIMIT = 20 * 60000;
export class Race extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.room = { host: null, phase: 'lobby', course: null, startAt: 0, round: 0 };
    ctx.blockConcurrencyWhile(async () => { Object.assign(this.room, (await ctx.storage.get('room')) || {}); });
  }
  async fetch(req) {
    const code = new URL(req.url).pathname.split('/').pop();
    if (this.ctx.getWebSockets().length >= MAX_PLAYERS) return fail('Room is full.', 409);
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ id: token(4), name: '', ready: false, racing: false, fin: null, code });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  players() {
    return this.ctx.getWebSockets().map(ws => ({ ws, a: ws.deserializeAttachment() })).filter(p => p.a && p.a.name);
  }
  async save() { await this.ctx.storage.put('room', this.room); }
  send(ws, msg) { try { ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch (e) { /* closing */ } }
  broadcast(msg, except) { const s = JSON.stringify(msg); for (const ws of this.ctx.getWebSockets()) if (ws !== except) this.send(ws, s); }
  state() {
    const ps = this.players();
    return {
      t: 'room', host: this.room.host, phase: this.room.phase, course: this.room.course, startAt: this.room.startAt, round: this.room.round, now: Date.now(),
      players: ps.map(({ a }) => ({ id: a.id, name: a.name, ready: a.ready, racing: a.racing, fin: a.fin })),
    };
  }
  async update() {
    const ps = this.players();
    if (!ps.some(p => p.a.id === this.room.host)) this.room.host = ps.length ? ps[0].a.id : null;
    // the race ends when every racer has finished, given up or left
    if (this.room.phase === 'race') {
      const racing = ps.filter(p => p.a.racing);
      if (!racing.length || racing.every(p => p.a.fin !== null) || Date.now() - this.room.startAt > RACE_LIMIT) this.room.phase = 'results';
    }
    if (!ps.length) { this.room = { host: null, phase: 'lobby', course: null, startAt: 0, round: 0 }; await this.ctx.storage.deleteAll(); return; }
    await this.save();
    this.broadcast(this.state());
  }
  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 2000) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const a = ws.deserializeAttachment();
    if (!a) return;
    const host = a.id === this.room.host;
    const set = (patch) => { Object.assign(a, patch); ws.serializeAttachment(a); };
    switch (m.t) {
      case 's': // where I am: pass it straight on
        if (this.room.phase === 'race' && a.racing && Array.isArray(m.p) && m.p.length === 3) {
          const out = JSON.stringify({ t: 's', id: a.id, p: m.p.map(v => Math.round(+v || 0)), y: Math.round(+m.y || 0), d: m.d ? 1 : 0, c: m.c | 0 });
          for (const o of this.ctx.getWebSockets()) if (o !== ws) this.send(o, out);
        }
        return;
      case 'hello': {
        const name = cleanName(m.name) || 'Runner';
        set({ name, ready: false });
        this.send(ws, { t: 'you', id: a.id });
        break;
      }
      case 'level':
        if (!host || this.room.phase === 'race' || !LEVELS[m.key] || typeof m.course !== 'string') return;
        this.room.course = m.course; this.room.key = m.key;
        for (const p of this.players()) { p.a.ready = false; p.ws.serializeAttachment(p.a); }
        break;
      case 'ready':
        if (this.room.phase === 'race') return;
        set({ ready: !!m.on });
        break;
      case 'start':
        if (!host || this.room.phase === 'race' || !this.room.course) return;
        this.room.phase = 'race'; this.room.startAt = Date.now() + COUNTDOWN; this.room.round++;
        for (const p of this.players()) { Object.assign(p.a, { racing: true, fin: null, ready: false }); p.ws.serializeAttachment(p.a); }
        break;
      case 'fin': // finished: the room times it from the go, in hundredths; -1 gave up
        if (this.room.phase !== 'race' || !a.racing || a.fin !== null || Date.now() < this.room.startAt) return;
        set({ fin: m.ticks < 0 ? -1 : Math.round((Date.now() - this.room.startAt) / 10) });
        break;
      case 'lobby':
        if (!host || this.room.phase === 'race') return;
        this.room.phase = 'lobby';
        for (const p of this.players()) { Object.assign(p.a, { racing: false, fin: null }); p.ws.serializeAttachment(p.a); }
        break;
      case 'ping':
        this.send(ws, { t: 'pong', now: Date.now(), at: m.at });
        return;
      default: return;
    }
    await this.update();
  }
  async webSocketClose(ws) {
    const a = ws.deserializeAttachment();
    if (a) { a.name = ''; ws.serializeAttachment(a); } // gone: drop from the list straight away
    try { ws.close(1000, 'bye'); } catch (e) { /* already closed */ }
    await this.update();
  }
  async webSocketError(ws) { await this.webSocketClose(ws); }
}
