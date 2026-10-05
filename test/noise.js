// Optional aim noise for the bots: NOISE=0.05 SEED=3 node test/routes.js surf
// Wobbles the view yaw on a slow random walk (about 0.6 x NOISE radians
// typical), so a run needs some margin rather than one perfect line. Running
// a level over many seeds gives a rough "how forgiving is this" number that
// can be compared between levels (test/difficulty.js does that).
module.exports = function makeNoise() {
  const amp = +(process.env.NOISE || 0);
  if (!amp) return (c) => c;
  let seed = (+(process.env.SEED || 1) * 7919) % 2147483647 || 1, w = 0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return (c) => { w = w * 0.97 + (rnd() - 0.5) * amp * 0.5; c.yaw = (c.yaw || 0) + w; return c; };
};
