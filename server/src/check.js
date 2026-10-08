// Basic checks on a posted run. The ghost is the run sampled every 4 ticks
// (100 ticks a second) as x, y, z, yaw*100, crouched. A real run starts at
// the start pad, ends in the finish, its sample count matches its time, and
// it never moves faster than the game's speed cap (3500 units a second on
// each axis) except when it respawns at a checkpoint.
export const EVERY = 4, CAP = 3500, TICK = 0.01;
const STEP = CAP * EVERY * TICK + 10; // most a sample can move on one axis
const near = (b, p, pad) => p[0] >= b[0] - pad && p[0] <= b[3] + pad && p[1] >= b[1] - pad && p[1] <= b[4] + pad && p[2] >= b[2] - pad && p[2] <= b[5] + pad;

export function checkRun(level, ticks, ghost) {
  if (!level) return 'unknown level';
  if (!Number.isInteger(ticks) || ticks < 100 || ticks > 360000) return 'bad time';
  if (!ghost || ghost.e !== EVERY || !Array.isArray(ghost.s) || ghost.s.length % 5) return 'missing replay';
  const s = ghost.s, n = s.length / 5;
  for (const v of s) if (!Number.isInteger(v) || Math.abs(v) > 3e6) return 'bad replay';
  const want = Math.floor(ticks / EVERY) + 1;
  if (n < want - 2 || n > want + 1) return 'replay does not match the time';
  const at = (i) => [s[i * 5], s[i * 5 + 1], s[i * 5 + 2]];
  if (!near(level.start, at(0), 80)) return 'run does not start at the start';
  if (!(level.ends || [level.end]).some(b => near(b, at(n - 1), STEP + 20))) return 'run does not reach the finish';
  for (let i = 1; i < n; i++) {
    const a = at(i - 1), b = at(i);
    if (Math.abs(b[0] - a[0]) <= STEP && Math.abs(b[1] - a[1]) <= STEP && Math.abs(b[2] - a[2]) <= STEP) continue;
    // a respawn: lands at one of the level's spawn points
    if (!level.spawns.some(p => Math.abs(b[0] - p[0]) <= STEP + 60 && Math.abs(b[1] - p[1]) <= STEP + 60 && Math.abs(b[2] - p[2]) <= STEP + 60)) return 'impossible speed';
  }
  return null;
}

// names people can pick: 2 to 16 letters, digits, spaces and _ . -
export function cleanName(v) {
  if (typeof v !== 'string') return null;
  const n = v.replace(/\s+/g, ' ').trim();
  return /^[A-Za-z0-9 _.\-]{2,16}$/.test(n) ? n : null;
}
