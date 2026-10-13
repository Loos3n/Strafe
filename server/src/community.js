// Community levels: editor levels that players publish for everyone. A level
// is its editor share code; the server reads the code to find the start,
// checkpoint and finish pads, so runs on it are checked like any other level.
// This mirrors edDecode and edFaces in src/game.js: keep them in step.
export const EDO = [600000, 0, 0];
const TYPES = ['block', 'floor', 'ramp', 'wall', 'start', 'checkpoint', 'finish',
  'slope', 'half', 'curve', 'line', 'stairs', 'pillar', 'runwall', 'tunnel', 'beam', 'lava', 'boost', 'zip'];
const KEYS = ['t', 'x', 'y', 'z', 'r', 'w', 'l', 'h', 'a', 'd'];
const DEG = Math.PI / 180;

const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function inflate(u8) {
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
}

// share code -> { name, pieces }, or throws
export async function decodeLevel(code) {
  if (typeof code !== 'string' || code.length > 400000 || !/^S[01][A-Za-z0-9_-]+$/.test(code)) throw new Error('bad code');
  let raw = unb64(code.slice(2));
  if (code[1] === '1') raw = await inflate(raw);
  if (raw.length > 2000000) throw new Error('bad code');
  const [v, name, rows] = JSON.parse(new TextDecoder().decode(raw));
  if (v !== 1 || !Array.isArray(rows) || rows.length > 2000) throw new Error('bad code');
  const num = (x, lo, hi) => Math.max(lo, Math.min(hi, +x || 0));
  const pieces = rows.map(r => {
    const t = TYPES[Array.isArray(r) ? r[0] : -1];
    if (!t) throw new Error('bad piece');
    const p = { t };
    KEYS.slice(1).forEach((k, i) => { p[k] = num(r[i + 1], -200000, 200000); });
    p.w = num(p.w, 16, 8000); p.l = num(p.l, 16, 20000); p.h = num(p.h, 0, 8000);
    return p;
  });
  return { name: String(name || ''), pieces };
}

// where runs start, respawn and finish, in world space, in the same shape as
// levels.json (plus every finish pad, since a custom level can have several)
export function levelChecks(pieces) {
  let start = null;
  const spawns = [], ends = [];
  for (const pc of pieces) {
    if (pc.t !== 'start' && pc.t !== 'checkpoint' && pc.t !== 'finish') continue;
    const c = Math.cos(pc.r * DEG), s = Math.sin(pc.r * DEG), hw = pc.w / 2, hl = pc.l / 2;
    const xs = [], zs = [];
    for (const [lx, lz] of [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]]) { xs.push(EDO[0] + pc.x + lx * c + lz * s); zs.push(EDO[2] + pc.z - lx * s + lz * c); }
    const top = EDO[1] + pc.y;
    const box = [Math.min(...xs), top, Math.min(...zs), Math.max(...xs), top + 160, Math.max(...zs)].map(Math.round);
    const spawn = [EDO[0] + pc.x, EDO[1] + pc.y + 1, EDO[2] + pc.z].map(Math.round);
    if (pc.t === 'start') { if (!start) { start = box; spawns.unshift(spawn); } }
    else if (pc.t === 'checkpoint') spawns.push(spawn);
    else ends.push(box);
  }
  if (!start || !ends.length) return null;
  return { start, end: ends[0], ends, spawns };
}

// level names: 2 to 32 letters, digits, spaces and simple punctuation
export function cleanLevelName(v) {
  if (typeof v !== 'string') return null;
  const n = v.replace(/\s+/g, ' ').trim();
  return /^[A-Za-z0-9 _.,'!?&:#()\-]{2,32}$/.test(n) ? n : null;
}
