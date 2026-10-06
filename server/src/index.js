// Strafe online: one leaderboard for the browser, desktop and phone builds,
// and live race rooms. A Cloudflare Worker in front of two kinds of
// Durable Object: Board (one, holds players, times and ghosts in SQLite)
// and Race (one per room code, websockets between the racers).
import { DurableObject } from 'cloudflare:workers';
import { checkRun, cleanName } from './check.js';
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

export class Board extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL, lname TEXT NOT NULL UNIQUE, key TEXT NOT NULL, created INTEGER NOT NULL, imported INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS times (course TEXT NOT NULL, player TEXT NOT NULL, ticks INTEGER NOT NULL, at INTEGER NOT NULL, legacy INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (course, player));
      CREATE INDEX IF NOT EXISTS times_rank ON times (course, ticks);
      CREATE TABLE IF NOT EXISTS ghosts (course TEXT NOT NULL, player TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (course, player));
    `);
    this.hits = new Map(); // rate limits, kept in memory
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
      if (!LEVELS[course]) return fail('unknown level', 404);
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
      const err = checkRun(LEVELS[course], ticks, ghost);
      if (err) return fail('Run not accepted: ' + err + '.', 422);
      const cur = this.one('SELECT ticks, legacy FROM times WHERE course = ? AND player = ?', course, me.id);
      const better = !cur || ticks < cur.ticks || (cur.legacy && ticks <= cur.ticks);
      if (better) {
        this.sql.exec('INSERT OR REPLACE INTO times (course, player, ticks, at, legacy) VALUES (?, ?, ?, ?, 0)', course, me.id, ticks, Date.now());
        this.sql.exec('INSERT OR REPLACE INTO ghosts (course, player, data) VALUES (?, ?, ?)', course, me.id, JSON.stringify({ e: ghost.e, s: ghost.s }));
      }
      return json({ best: better, total: this.total(course), mine: this.standing(course, me.id) });
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
      case 'fin': // race ticks from the go, or -1 for gave up
        if (this.room.phase !== 'race' || !a.racing || a.fin !== null || !Number.isInteger(m.ticks)) return;
        set({ fin: m.ticks < 0 ? -1 : m.ticks });
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
