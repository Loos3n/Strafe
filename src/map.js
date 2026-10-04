// Strafe map: the tutorial, ten levels and the six-level Gauntlet.
// All coordinates are Hammer units, Y up, courses run toward -Z.
(function (root) {
  'use strict';

  const COLORS = {
    hub: 0xd9dcdf, hubTrim: 0x9aa3ab,
    roof: 0xefeee9, roofSide: 0xe4e2db, route: 0xdb2f2a,
    glass: 0x8fc4dd, street: 0x3b3f45,
    surf: [0x2fb5c7, 0x4f74ee, 0x8f55e0, 0xe0457b],
    surfPad: 0xc9d2da,
    bhop: 0xf08a24, bhopPad: 0xffc56b,
    water: 0x1f78b0, lava: 0xff5a1f,
    canyon: [0x3fa7a0, 0xd9844a, 0x5b8fd9, 0xc4566e], canyonRock: 0xb7a99a,
    stair: [0xf08a24, 0xe5533d, 0xf2b630, 0xd9663a, 0xf08a24],
  };

  function buildMap(StrafePhysics) {
    const world = new StrafePhysics.World();
    const box = (min, max, color, extra) => world.addBox(min, max, Object.assign({ color }, extra));
    const courses = {};
    const route = (min, max) => box(min, max, COLORS.route, { kind: 'route' });

    // where the player waits while no level is loaded (only the menu is showing)
    const hubSpawn = { pos: [0, 0, 600], yaw: 0 };

    // ------------------------------------------------------------ rooftops
    {
      const B = -1600; // street level
      const roof = (z0, z1, top, x0 = -600, x1 = 600) => box([x0, B, z1], [x1, top, z0], COLORS.roof, { kind: 'building' });

      roof(-3000, -4200, 0);
      route([-220, 0, -3500], [-60, 48, -3420]);          // AC unit to vault
      route([100, 0, -3460], [260, 30, -3380]);
      route([-600, 0, -3800], [600, 40, -3780]);          // knee wall
      roof(-4400, -5600, -40);                            // gap 1: 200
      route([-600, 20, -4900], [600, 60, -4860]);         // pipe: duck or slide under
      roof(-6200, -7400, -60);                            // gap 2: 600, wallrun across
      route([400, -420, -5500], [440, 260, -6300]);       // billboard wall (right side)
      roof(-7400, -8400, 130);                            // climb wall: 190 up
      route([-140, -60, -7402], [140, 130, -7399]);       // red panel marks the climb
      world.addPrism('x', [[-8400, 130], [-9400, -170], [-9400, B], [-8400, B]], -600, 600,
        { color: COLORS.roof, kind: 'building' });        // sloped roof to slide down
      roof(-9800, -10600, -300);                          // gap 3: 400 drop
      route([-220, -700, -10700], [-180, -40, -11240]);   // wall-to-wall: left
      route([180, -700, -11100], [220, -40, -11700]);     // then right
      roof(-11800, -12800, -340);
      world.addTrigger([-600, 0, -3300], [600, 200, -3000], { type: 'start', course: 'roofs' });

      const cp1 = { pos: [0, -60, -6350], yaw: 0 };
      const cp2 = { pos: [0, -300, -9950], yaw: 0 };
      world.addTrigger([-600, -60, -6500], [600, 200, -6200], { type: 'checkpoint', course: 'roofs', idx: 1, spawn: cp1 });
      world.addTrigger([-600, -300, -10100], [600, -100, -9800], { type: 'checkpoint', course: 'roofs', idx: 2, spawn: cp2 });

      // skyline filler (solid, so it is all fair game)
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let z = -2600; z > -11000; z -= 700) {
        for (const side of [-1, 1]) {
          const x0 = side * (900 + rnd() * 300);
          const wdt = 500 + rnd() * 600;
          const top = -500 + rnd() * 1400;
          const xa = side > 0 ? x0 : x0 - wdt, xb = side > 0 ? x0 + wdt : x0;
          box([xa, B, z - 500 - rnd() * 100], [xb, top, z], rnd() < 0.25 ? COLORS.glass : COLORS.roofSide, { kind: 'building', far: true });
        }
      }
      box([-3000, B - 20, -11000], [3000, B, -2600], COLORS.street, { kind: 'street' });
      world.addTrigger([-3000, B - 2000, -11000], [3000, -900, -2600], { type: 'kill', course: 'roofs' });

      // The run carries on round three corners: east, north, then west.
      const kit = cityKit('roofs', B);
      const LA = kit.leg(0, 0, 0);                                     // the stretch above, as a frame
      LA.reserve(-700, 700, 9700, 12900);
      LA.trigger(-700, 700, B - 2000, -900, 9700, 12900, { type: 'kill' });
      // east: vault, slide, wallrun the billboard
      const LB = kit.leg(0, -12300, 1);
      LB.roof(-500, 500, 600, 1400, -340);                             // the end roof becomes a corner
      LB.red(-200, 200, -340, -296, 900, 940);
      LB.roof(-500, 500, 1600, 2600, -340);
      LB.red(-500, 500, -280, -240, 1850, 1890);                       // pipe: slide under
      LB.box(-520, -500, -340, -240, 1850, 1890, COLORS.hubTrim, {}); LB.box(500, 520, -340, -240, 1850, 1890, COLORS.hubTrim, {});
      LB.red(400, 440, -800, -100, 2550, 3050);                        // billboard (right)
      LB.box(408, 432, B, -800, 2620, 2650, COLORS.hubTrim, {}); LB.box(408, 432, B, -800, 2950, 2980, COLORS.hubTrim, {});
      LB.roof(-1400, 500, 3000, 4000, -380);                           // corner roof
      LB.reserve(-1500, 600, 500, 4100);
      LB.trigger(-1500, 600, B - 2000, -900, 1400, 4100, { type: 'kill' });
      // north: climb, a covered walkway with a low beam, slide the pitched roof
      const LC = kit.leg(...LB.at(0, 3500), 0);
      LC.red(-140, 140, -380, -200, 1396, 1400);
      LC.roof(-500, 500, 1400, 2400, -200);
      LC.box(-520, 520, -20, 0, 1700, 2250, COLORS.hub, { kind: 'interior' });          // canopy
      for (const u of [-500, 480]) for (const v of [1700, 2230]) LC.box(u, u + 20, -200, -20, v, v + 20, COLORS.hubTrim, {});
      LC.red(-500, 500, -140, -20, 1960, 2000);                        // low beam: slide
      LC.slope(-500, 500, 2400, 3300, -200, -500);
      LC.roof(-1500, 500, 3600, 4700, -560);                           // corner roof
      LC.reserve(-1600, 600, 1300, 4800);
      LC.trigger(-1600, 600, B - 2000, -1000, 1300, 4800, { type: 'kill' });
      // west: skylight hops, climb to the finish
      const LD = kit.leg(...LC.at(0, 4200), 3);
      [[1640, 1960, 0], [2100, 2420, 60], [2560, 2880, -40]].forEach(([v0, v1, u]) => LD.box(u - 150, u + 150, B, -560, v0, v1, COLORS.roofSide, { kind: 'building' }));
      LD.red(-140, 140, -560, -400, 2876, 2880);
      LD.roof(-500, 500, 2880, 4000, -400);
      LD.red(-250, 250, -400, -396, 3550, 3950);                       // finish pad
      LD.trigger(-500, 500, -400, -200, 3500, 4000, { type: 'end' });
      LD.reserve(-600, 600, 1400, 4100);
      LD.trigger(-600, 600, B - 2000, -1000, 1500, 4100, { type: 'kill' });
      const more = [LB.spawn(0, -340, 1700), LC.spawn(0, -200, 1500), LC.spawn(0, -560, 3750)];
      more.forEach((spawn, i) => {
        const L = [LB, LC, LC][i], [, v] = L.local(spawn.pos[0], spawn.pos[2]);
        L.trigger(-500, 500, spawn.pos[1], spawn.pos[1] + 200, v - 100, v + 200, { type: 'checkpoint', idx: i + 3, spawn });
      });
      kit.skyline(-2800, -18200, 5200, -11000, -1300, 600, 5, false);
      box([-4800, B - 20, -20200], [7200, B, -11000], COLORS.street, { kind: 'street' });
      courses.roofs = { name: 'Rooftops', type: 'Parkour', difficulty: 2, color: COLORS.route,
        desc: 'Vault, slide under pipes, wallrun two billboards, go wall to wall over an alley, then turn three corners to a climb at the finish.',
        spawn: { pos: [0, 0, -3100], yaw: 0 }, stages: 6, legs: kit.legs.map(L => ({ ox: L.ox, oz: L.oz, h: L.h })) };
    }


    // ------------------------------------------------------------ cascade (long surf)
    // Thirteen short ramps that flip from side to side across wide gaps, so
    // every transfer is a long air strafe that has to keep its height. Two
    // ramps climb, two steep ones build speed for them, and the faces are
    // mostly the narrow 65 degree kind. Two checkpoints, each on a long steep
    // ramp you drop onto from a high ledge.
    {
      const cx = -26000;
      const R60 = [320, 554], R55 = [380, 543], R65 = [280, 600];
      const defs = [
        { dx: 0, len: 4200, drop: 1300, face: R60, gap: 1000 },   // a long steep start for speed
        { dx: -420, len: 2600, drop: 450, face: R65, gap: 1200 },
        { dx: 450, len: 2400, drop: 400, face: R65, gap: 1300 },
        { dx: -450, len: 2400, drop: 400, face: R65, gap: 1300},
        { dx: 0, len: 3400, drop: 1500, face: R55, gap: 1000, cp: true },   // steep: build speed (checkpoint)
        { dx: 520, len: 2600, drop: -250, face: R60, gap: 1500, fall: 0.3 }, // climbs
        { dx: -490, len: 2200, drop: 350, face: R65, gap: 1400 },
        { dx: 480, len: 2200, drop: 350, face: R65, gap: 1400 },
        { dx: -200, len: 3400, drop: 1500, face: R55, gap: 1000, cp: true }, // steep again (checkpoint)
        { dx: -600, len: 2600, drop: -300, face: R60, gap: 1600, fall: 0.3 }, // climbs
        { dx: 370, len: 2000, drop: 400, face: R65, gap: 1500 },
        { dx: -380, len: 2000, drop: 400, face: R65, gap: 1500 },
        { dx: 0, len: 3000, drop: 500, face: R60, gap: 1200 },
      ];
      // the next ramp sits lower by what you fall crossing the gap, give or take
      const STAGE_LIFT = 2100, STAGE_OUT = 200;
      const fall = (d) => d.gap * (d.fall || 0.6);
      let apex = 14000, z = 600;
      const spawns = [];
      defs.forEach((d, i) => {
        const rx = cx + d.dx, [W, H] = d.face;
        world.addSweep([[rx - W, apex - H], [rx + W, apex - H], [rx, apex]], z, z - d.len, -d.drop,
          { color: COLORS.surf[i % COLORS.surf.length], kind: 'ramp' });
        d.cx = rx; d.z0 = z; d.z1 = z - d.len; d.apex = apex;
        if (i === 0 || d.cp) {
          // later stages start from a ledge high above the ramp: the drop in
          // gives back the speed a full run would be carrying
          const lift = i ? STAGE_LIFT : 60, out = i ? STAGE_OUT : 0;
          const top = apex + lift;
          box([rx - W - 520 - out, top - 40, z - 700], [rx - W - 80 - out, top, z - 100], COLORS.surfPad, { kind: 'pad' });
          const spawn = { pos: [rx - W - 300 - out, top, z - 300], yaw: -1.05 };
          spawns.push(spawn);
          if (i > 0) world.addTrigger([cx - 3000, apex - 3000, z - 200], [cx + 3000, apex + 2000, z + 300],
            { type: 'checkpoint', course: 'cascade', idx: spawns.length - 1, spawn });
        }
        apex = apex - d.drop - fall(d);
        z = z - d.len - d.gap;
      });
      const last = defs[defs.length - 1];
      const fy = last.apex - last.drop - 700;
      box([last.cx - 900, fy - 60, last.z1 - 1900], [last.cx + 900, fy, last.z1 - 500], COLORS.surfPad, { kind: 'pad' });
      world.addTrigger([last.cx - 900, fy, last.z1 - 1900], [last.cx + 900, fy + 200, last.z1 - 500], { type: 'end', course: 'cascade' });
      const s0 = defs[0];
      world.addTrigger([s0.cx - 320 - 520, s0.apex + 60, s0.z0 - 700], [s0.cx - 320 - 80, s0.apex + 300, s0.z0 - 100], { type: 'start', course: 'cascade' });
      const zEnd = last.z1 - 3000;
      box([cx - 4000, -260, zEnd], [cx + 4000, -200, 2500], COLORS.water, { nonsolid: true, water: true });
      world.addTrigger([cx - 4000, -3000, zEnd], [cx + 4000, fy - 400, 2500], { type: 'kill', course: 'cascade' });
      courses.cascade = { preview: { pos: [cx - 900, 14200, 1400], yaw: -0.25 }, name: 'Cascade', type: 'Surf', difficulty: 5, color: 0x2bd1a8,
        desc: 'Thirteen narrow ramps that switch sides across wide gaps, with two climbs that bleed your speed. Only two checkpoints, each a drop from a high ledge.',
        spawn: spawns[0], stages: spawns.length, ramps: defs };
    }

    // ------------------------------------------------------------ spire (long bhop)
    // Small blocks, corners without islands, zigzags and long falling gaps.
    {
      const ox = -40000;
      box([ox - 256, -1300, -256], [ox + 256, 0, 256], COLORS.bhopPad, { kind: 'pad' });
      world.addTrigger([ox - 256, 0, -256], [ox + 256, 160, 256], { type: 'start', course: 'spire' });
      const HB = 56;
      // n blocks, step length, rise per block, zigzag offset, heading change after, island after
      const segs = [
        { n: 7, step: 260, dy: 0, zig: 0, turn: 0 },
        { n: 6, step: 280, dy: 34, zig: 0, turn: Math.PI / 4 },
        { n: 6, step: 300, dy: -50, zig: 0, turn: -Math.PI / 2, island: true },
        { n: 7, step: 290, dy: 0, zig: 90, turn: -Math.PI / 4 },
        { n: 5, step: 330, dy: -70, zig: 0, turn: Math.PI / 2, island: true },
        { n: 6, step: 280, dy: 30, zig: 0, turn: Math.PI / 4 },
        { n: 4, step: 400, dy: -130, zig: 0, turn: -Math.PI / 4, island: true },
        { n: 8, step: 290, dy: 0, zig: 100, turn: 0 },
      ];
      const pal = [0xa55cf0, 0xe0457b, 0x8f55e0, 0xf08a24, 0xc94fd6];
      let x = ox, z = -256 - 150, y = 0, head = 0, idx = 0, lo = 0;
      segs.forEach((sg, si) => {
        for (let k = 0; k < sg.n; k++) {
          y += sg.dy; lo = Math.min(lo, y);
          const zz = sg.zig ? (k % 2 ? sg.zig : -sg.zig) : 0;
          const px = x + Math.cos(head) * zz, pz = z - Math.sin(head) * zz;
          box([px - HB, y - 1300, pz - HB], [px + HB, y, pz + HB], pal[si % pal.length], { kind: 'block' });
          x += -Math.sin(head) * sg.step; z += -Math.cos(head) * sg.step;
        }
        head += sg.turn;
        if (sg.island) {
          box([x - 150, y - 1300, z - 150], [x + 150, y, z + 150], COLORS.bhopPad, { kind: 'pad' });
          idx++;
          const spawn = { pos: [x, y, z], yaw: head };
          world.addTrigger([x - 150, y, z - 150], [x + 150, y + 160, z + 150], { type: 'checkpoint', course: 'spire', idx, spawn });
          x += -Math.sin(head) * 330; z += -Math.cos(head) * 330;
        }
      });
      // long jump down to the finish
      y -= 160;
      x += -Math.sin(head) * 190; z += -Math.cos(head) * 190;
      box([x - 320, y - 1300, z - 320], [x + 320, y, z + 320], COLORS.bhopPad, { kind: 'pad' });
      world.addTrigger([x - 320, y, z - 320], [x + 320, y + 200, z + 320], { type: 'end', course: 'spire' });
      box([ox - 6000, lo - 1700, -14000], [ox + 6000, lo - 1660, 2000], COLORS.lava, { nonsolid: true, lava: true });
      world.addTrigger([ox - 6000, -4000, -14000], [ox + 6000, lo - 700, 2000], { type: 'kill', course: 'spire' });
      courses.spire = { name: 'Spire', type: 'Bhop', difficulty: 5, color: 0xa55cf0,
        desc: 'A long line of small blocks. Corners with no island to stop on, zigzags and long falling gaps.',
        spawn: { pos: [ox, 0, 150], yaw: 0 }, stages: idx + 1 };
    }

    // ------------------------------------------------------------ freerun (long parkour)
    // A full Mirror's Edge run: vaults, a slide, a long wallrun, a three-wall
    // shaft, climbs, a slide into a surf ramp, vent hops, a wallrun to a mantle
    // and a last climb to the finish.
    {
      const fx = 44000, B = -3000;
      const roof = (z0, z1, top, hw = 500) => box([fx - hw, B, z1], [fx + hw, top, z0], COLORS.roof, { kind: 'building' });
      // route piece from x0..x1, y0..y1, z0 (near) .. z1 (far), x relative to the course line
      const R = (x0, y0, z0, x1, y1, z1) => route([fx + x0, y0, z1], [fx + x1, y1, z0]);
      // 1: start roof, vaults
      roof(0, -1400, 0);
      R(-200, 0, -620, -40, 46, -680); R(80, 0, -660, 240, 40, -720);
      R(-500, 0, -1080, 500, 42, -1110);
      // 2: short gap, slide under the pipe
      roof(-1640, -2600, -60);
      R(-500, -4, -2080, 500, 36, -2120);
      // 3: long gap, wallrun on the left billboard
      R(-440, -520, -2500, -400, 240, -3250);
      roof(-3300, -4400, -100);
      // 4: climb
      roof(-4400, -5400, 80);
      R(-140, -100, -4398, 140, 80, -4402);
      // 5: three-wall shaft
      R(180, -700, -5500, 220, 320, -5980);
      R(-220, -760, -5880, -180, 320, -6380);
      R(180, -820, -6280, 220, 320, -6760);
      roof(-6950, -7900, -250);
      // 6: slide the slope, launch onto the surf ramp
      world.addPrism('x', [[-7900, -250], [-9000, -650], [-9000, B], [-7900, B]], fx - 500, fx + 500, { color: COLORS.roof, kind: 'building' });
      world.addSweep([[fx - 320, -950 - 554], [fx + 320, -950 - 554], [fx, -950]], -9400, -12600, -400, { color: COLORS.surf[2], kind: 'ramp' });
      box([fx - 450, B, -13550], [fx + 450, -1850, -12850], COLORS.bhopPad, { kind: 'pad' });
      // 7: vent hops
      [0, 70, -70, 60, -60, 0].forEach((l, i) => {
        const bz = -13800 - i * 300;
        box([fx + l - 80, B, bz - 80], [fx + l + 80, -1850, bz + 80], COLORS.bhop, { kind: 'block' });
      });
      // 8: roof, right billboard wallrun, mantle up
      roof(-15560, -16400, -1850);
      R(380, -2250, -16250, 420, -1050, -17100);
      roof(-16950, -17800, -1730);
      R(-140, -1860, -16952, 140, -1730, -16949);
      // 9: final climb to the finish
      roof(-17800, -18700, -1550, 400);
      R(-140, -1730, -17798, 140, -1550, -17802);
      world.addTrigger([fx - 400, -1550, -18700], [fx + 400, -1350, -18000], { type: 'end', course: 'freerun' });
      world.addTrigger([fx - 500, 0, -350], [fx + 500, 200, 0], { type: 'start', course: 'freerun' });
      const cps = [
        { z: [-3600, -3300], y: -100, sz: -3450 },
        { z: [-7250, -6950], y: -250, sz: -7100 },
        { z: [-13550, -12850], y: -1850, sz: -13050 },
        { z: [-15860, -15560], y: -1850, sz: -15710 },
      ];
      cps.forEach((c, i) => {
        const spawn = { pos: [fx, c.y, c.sz], yaw: 0 };
        world.addTrigger([fx - 500, c.y, c.z[0]], [fx + 500, c.y + 200, c.z[1]], { type: 'checkpoint', course: 'freerun', idx: i + 1, spawn });
      });
      // skyline
      let seed = 11;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let z = 400; z > -19500; z -= 800) {
        for (const side of [-1, 1]) {
          const x0 = fx + side * (950 + rnd() * 400), wdt = 500 + rnd() * 700;
          const top = -1600 + rnd() * 1800 - (z < -9000 ? 1200 : 0);
          box([side > 0 ? x0 : x0 - wdt, B, z - 500 - rnd() * 150], [side > 0 ? x0 + wdt : x0, top, z], rnd() < 0.3 ? COLORS.glass : COLORS.roofSide, { kind: 'building', far: true });
        }
      }
      box([fx - 4000, B - 20, -20000], [fx + 4000, B, 1000], COLORS.street, { kind: 'street' });
      world.addTrigger([fx - 4000, B - 2000, -9200], [fx + 4000, -1000, 1000], { type: 'kill', course: 'freerun' });
      world.addTrigger([fx - 4000, B - 2000, -20000], [fx + 4000, -2200, -9200], { type: 'kill', course: 'freerun' });
      courses.freerun = { name: 'Freerun', type: 'Parkour', difficulty: 5, color: 0xff4f3a,
        desc: 'A long rooftop run that chains everything: vaults, a long wallrun, a three-wall shaft, a slide into a surf ramp and two climbs.',
        spawn: { pos: [fx, 0, -150], yaw: 0 }, stages: cps.length + 1 };
    }

    // ------------------------------------------------------------ city kit
    // Long parkour runs are laid out in legs. Each leg has its own frame so a
    // run can turn corners: u is across (right +), v is forward, y is up.
    // Everything placed through a leg reserves its footprint, so the skyline
    // filler never drops a building into the route or its gaps.
    function cityKit(course, B) {
      const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      const reserved = [];
      const legs = [];
      function leg(ox, oz, h) {
        const f = DIRS[h], r = DIRS[(h + 1) % 4];
        const at = (u, v) => [ox + r[0] * u + f[0] * v, oz + r[1] * u + f[1] * v];
        const rect = (u0, u1, v0, v1) => {
          const a = at(u0, v0), b = at(u1, v1);
          return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
        };
        const L = {
          ox, oz, h, yaw: Math.atan2(-f[0], -f[1]), at,
          local: (x, z) => [(x - ox) * r[0] + (z - oz) * r[1], (x - ox) * f[0] + (z - oz) * f[1]],
          reserve(u0, u1, v0, v1) { reserved.push(rect(u0, u1, v0, v1)); },
          box(u0, u1, y0, y1, v0, v1, color, extra) {
            const q = rect(u0, u1, v0, v1);
            reserved.push(q);
            return world.addBox([q[0], y0, q[1]], [q[2], y1, q[3]], Object.assign({ color }, extra));
          },
          roof(u0, u1, v0, v1, top, color) { return L.box(u0, u1, B, top, v0, v1, color || COLORS.roof, { kind: 'building' }); },
          red(u0, u1, y0, y1, v0, v1) { return L.box(u0, u1, y0, y1, v0, v1, COLORS.route, { kind: 'route' }); },
          // a roof that falls from y0 at v0 to y1 at v1, for slides
          slope(u0, u1, v0, v1, y0, y1) {
            const c = (u, v, y) => { const p = at(u, v); return [p[0], y, p[1]]; };
            const a = c(u0, v0, y0), b = c(u1, v0, y0), cc = c(u1, v1, y1), d = c(u0, v1, y1);
            const a2 = c(u0, v0, B), b2 = c(u1, v0, B), c2 = c(u1, v1, B), d2 = c(u0, v1, B);
            reserved.push(rect(u0, u1, v0, v1));
            return world.addHull([[a, b, cc, d], [a2, b2, c2, d2], [a, b, b2, a2], [b, cc, c2, b2], [cc, d, d2, c2], [d, a, a2, d2]],
              { color: COLORS.roof, kind: 'building' });
          },
          trigger(u0, u1, y0, y1, v0, v1, data) {
            const q = rect(u0, u1, v0, v1);
            return world.addTrigger([q[0], y0, q[1]], [q[2], y1, q[3]], Object.assign({ course }, data));
          },
          spawn(u, y, v) { const p = at(u, v); return { pos: [p[0], y, p[1]], yaw: L.yaw }; },
        };
        legs.push(L);
        return L;
      }
      // fill the rest of a rectangle with city blocks around the route
      function skyline(x0, z0, x1, z1, lo, hi, seed, street = true) {
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        const hits = (a) => reserved.some(q => a[0] < q[2] + 160 && a[2] > q[0] - 160 && a[1] < q[3] + 160 && a[3] > q[1] - 160);
        for (let x = x0; x < x1; x += 760) {
          for (let z = z0; z < z1; z += 760) {
            const w = 380 + rnd() * 320, d = 380 + rnd() * 320;
            const ax = x + rnd() * (700 - w), az = z + rnd() * (700 - d);
            const a = [ax, az, ax + w, az + d];
            const top = lo + rnd() * (hi - lo), glass = rnd() < 0.3;
            if (hits(a)) continue;
            world.addBox([a[0], B, a[1]], [a[2], top, a[3]], { color: glass ? COLORS.glass : COLORS.roofSide, kind: 'building', far: true });
          }
        }
        if (street) world.addBox([x0 - 2000, B - 20, z0 - 2000], [x1 + 2000, B, z1 + 2000], { color: COLORS.street, kind: 'street' });
      }
      return { leg, legs, skyline };
    }

    // ------------------------------------------------------------ downtown (long parkour)
    // A courier run across the city that turns three corners: rooftops, a
    // billboard wallrun, through an office floor and over its atrium, up a
    // scaffold and out along a crane jib, a slide down a pitched roof, then
    // wall-to-wall over an alley to the finish.
    {
      const B = -2400, kit = cityKit('downtown', B);
      const CRANE = 0xf2b630;
      // leg 1: south to north (-Z) over three roofs to a corner
      const L1 = kit.leg(60000, 0, 0);
      L1.roof(-500, 500, 0, 1400, 0);
      L1.red(-200, -40, 0, 46, 500, 560); L1.red(80, 240, 0, 40, 540, 600);   // AC units to vault
      L1.red(-500, 500, 60, 100, 950, 990);                                   // pipe: slide under
      L1.box(-520, -500, 0, 100, 950, 990, COLORS.hubTrim, {}); L1.box(500, 520, 0, 100, 950, 990, COLORS.hubTrim, {});
      L1.roof(-500, 500, 1640, 2600, -60);
      L1.red(-500, 500, -60, -20, 2000, 2030);                                // knee wall
      L1.roof(-500, 1000, 2800, 4000, -360);                                  // drop onto the corner roof
      L1.box(-500, 1000, -360, -310, 3960, 4000, COLORS.roofSide, { kind: 'parapet' });
      L1.reserve(-600, 1100, 0, 4100);
      // leg 2: turn right (east), billboard over the street, into the office
      const L2 = kit.leg(...L1.at(400, 3500), 1);
      L2.red(-150, 150, -360, -316, 300, 340);
      L2.red(-440, -400, -1000, -120, 520, 1150);                             // billboard (left)
      L2.box(-432, -408, B, -1000, 600, 630, COLORS.hubTrim, {}); L2.box(-432, -408, B, -1000, 1080, 1110, COLORS.hubTrim, {});
      L2.roof(-600, 600, 1100, 2300, -300);
      const GL = COLORS.glass;
      // the office: floor at -120, ceiling at 110, a lightwell across the middle
      L2.roof(-600, 600, 2300, 3300, -120);
      L2.roof(-600, 600, 3700, 4000, -120);
      L2.box(-560, 560, 150, 160, 2340, 3960, COLORS.hub, { kind: 'interior' });       // ceiling
      L2.box(-600, 600, 160, 760, 2300, 4000, GL, { kind: 'building' });
      L2.box(-600, -200, -120, 160, 2300, 2340, GL, { kind: 'building' }); L2.box(200, 600, -120, 160, 2300, 2340, GL, { kind: 'building' });
      L2.box(-600, -300, -120, 160, 3960, 4000, GL, { kind: 'building' });
      L2.box(-600, -560, -120, 160, 2340, 3960, GL, { kind: 'building' }); L2.box(560, 600, -1200, 160, 2340, 3960, GL, { kind: 'building' });
      L2.red(-140, 140, -300, -120, 2296, 2300);                              // climb in through the window
      L2.red(-560, 560, -120, -78, 2600, 2650);                               // desks to vault
      L2.box(-280, -240, -120, 160, 2780, 2820, COLORS.hubTrim, { kind: 'interior' }); L2.box(240, 280, -120, 160, 2780, 2820, COLORS.hubTrim, { kind: 'interior' });
      L2.red(-560, 560, -60, 160, 2950, 2990);                                // half-shut shutter: slide
      L2.red(540, 560, -400, 160, 3250, 3750);                                // wallrun panel over the lightwell
      L2.trigger(-560, 560, -1300, -500, 3300, 3700, { type: 'kill' });
      L2.roof(-1000, 500, 4220, 5500, -500);                                  // corner roof
      L2.reserve(-1100, 700, 0, 5600);
      // leg 3: turn left (north), scaffold, crane jib, pitched roof
      const L3 = kit.leg(...L2.at(0, 4900), 0);
      const SC = COLORS.hubTrim;
      L3.roof(-300, 300, 1000, 1400, -320, SC); L3.red(-140, 140, -500, -320, 996, 1000);
      L3.roof(-300, 300, 1400, 1800, -140, SC); L3.red(-140, 140, -320, -140, 1396, 1400);
      L3.roof(-300, 300, 1800, 2200, 40, SC); L3.red(-140, 140, -140, 40, 1796, 1800);
      L3.box(-30, 30, 0, 40, 2200, 3500, CRANE, { kind: 'crane' });         // the jib
      L3.box(-50, 50, B, 0, 2560, 2660, CRANE, { kind: 'crane' });          // mast
      L3.box(40, 120, -110, 0, 2560, 2660, CRANE, { kind: 'crane' });       // cab under the jib
      L3.roof(-500, 500, 3700, 4400, -500);
      L3.slope(-500, 500, 4400, 5400, -500, -850);
      L3.roof(-500, 1200, 5730, 7000, -950);                                  // corner roof
      L3.reserve(-600, 1300, 900, 7100);
      // leg 4: turn right (east), wall to wall over the alley, the finish
      const L4 = kit.leg(...L3.at(500, 6400), 1);
      L4.red(-220, -180, -1350, -690, 800, 1340);
      L4.red(180, 220, -1450, -690, 1200, 1800);
      L4.roof(-500, 500, 1850, 2800, -990);
      L4.red(-200, -40, -990, -946, 2200, 2260); L4.red(60, 220, -990, -950, 2350, 2410);
      L4.roof(-600, 600, 3100, 4100, -1300);
      L4.red(-300, 300, -1300, -1296, 3500, 3900);                            // finish pad
      L4.trigger(-600, 600, -1300, -1100, 3450, 4100, { type: 'end' });
      L4.box(-500, 500, B, 2600, 4300, 5300, COLORS.glass, { kind: 'building' }); // the tower you were running at
      L4.reserve(-600, 600, 0, 4200);
      L1.trigger(-500, 500, 0, 200, 0, 350, { type: 'start' });
      const cps = [L2.spawn(0, -300, 1500), L2.spawn(0, -500, 4500), L3.spawn(0, -950, 5900), L4.spawn(0, -990, 2000)];
      cps.forEach((spawn, i) => {
        const L = [L2, L2, L3, L4][i];
        const [u, v] = L.local(spawn.pos[0], spawn.pos[2]);
        L.trigger(-500, 500, spawn.pos[1], spawn.pos[1] + 200, v - 100, v + 200, { type: 'checkpoint', idx: i + 1, spawn });
      });
      // falling between roofs: each leg's own floor of death, then a catch-all
      L1.trigger(-600, 1100, -2000, -900, 0, 4100, { type: 'kill' });
      L2.trigger(-1100, 700, -2000, -1000, 400, 4300, { type: 'kill' });
      L3.trigger(-600, 1300, -2000, -1500, 1000, 7100, { type: 'kill' });
      L4.trigger(-600, 600, -2200, -1800, 600, 4200, { type: 'kill' });
      kit.skyline(57400, -12600, 72000, 2600, -1400, 900, 23);
      courses.downtown = { name: 'Downtown', type: 'Parkour', difficulty: 4, color: 0x2f7de1,
        desc: 'A courier run that turns three corners: a billboard wallrun, through an office and over its lightwell, up a scaffold, out along a crane and down to the finish.',
        spawn: L1.spawn(0, 0, 150), stages: cps.length + 1, legs: kit.legs.map(L => ({ ox: L.ox, oz: L.oz, h: L.h })) };
    }

    // ------------------------------------------------------------ tutorial
    // A corridor of stations, one mechanic each. Every station has a hint
    // zone (which is also its checkpoint) and the obstacle that needs the move.
    {
      const tx = 30000, WALL = COLORS.hubTrim, FLOOR = COLORS.hub;
      const floor = (z0, z1, top = 0, hw = 300) => box([tx - hw, top - 400, z1], [tx + hw, top, z0], FLOOR, { kind: 'floor' });
      const sides = (z0, z1, bottom, top, hw = 300) => {
        box([tx - hw - 40, bottom, z1], [tx - hw, top, z0], WALL, { kind: 'wall' });
        box([tx + hw, bottom, z1], [tx + hw + 40, top, z0], WALL, { kind: 'wall' });
      };
      const steps = [];
      const hint = (z0, z1, y, spawnZ, data) => {
        const idx = steps.length;
        const spawn = { pos: [tx, y, spawnZ], yaw: 0 };
        steps.push(Object.assign({ spawn }, data));
        world.addTrigger([tx - 700, y - 50, z1], [tx + 700, y + 400, z0], Object.assign({ type: 'hint', course: 'tutorial', idx, spawn }, data));
      };

      box([tx - 340, -400, 0], [tx + 340, 300, 40], WALL, { kind: 'wall' }); // back wall
      // 1 move
      floor(0, -900); sides(0, -900, -400, 260);
      hint(0, -500, 0, -150, { title: 'Move', body: 'WASD moves, the mouse looks. Head down the corridor.', keys: ['W', 'A', 'S', 'D'], done: 'move' });
      // 2 jump the gap
      hint(-500, -900, 0, -600, { title: 'Jump', body: 'Press Space to jump the gap. Fall in and you go back to the last step.', keys: ['Space'], done: 'jump' });
      // 3 bhop across a broken floor
      floor(-1100, -1300); floor(-1420, -1620); floor(-1740, -1940); floor(-2060, -2260);
      sides(-900, -2380, -400, 260);
      hint(-1100, -2260, 0, -1150, { title: 'Bunnyhop', body: 'Hold Space through the landings. You jump again the moment you touch down, so you never lose speed to ground friction.', keys: ['Hold Space'], done: 'bhop' });
      // 4 air strafe room with a speed gate
      floor(-2380, -4840, 0, 700); sides(-2380, -4840, -400, 320, 700);
      box([tx - 700, -400, -2420], [tx - 300, 320, -2380], WALL, {});
      box([tx + 300, -400, -2420], [tx + 700, 320, -2380], WALL, {});
      box([tx - 700, 0, -4840], [tx + 700, 320, -4800], COLORS.route, { door: 'strafe', kind: 'door' });
      hint(-2420, -4800, 0, -2500, { title: 'Air strafe', body: 'Let go of W. In the air, hold D while turning the mouse right, then A while turning left. Smooth turns add speed. Reach 350 u/s to open the gate.', keys: ['A + mouse left', 'D + mouse right'], done: 'strafe' });
      // 5 slide under the pipe
      floor(-4840, -6100); sides(-4840, -6100, -400, 260);
      box([tx - 300, 60, -5560], [tx + 300, 100, -5520], COLORS.route, { kind: 'route' });
      box([tx - 300, 100, -5560], [tx + 300, 260, -5520], WALL, {});
      hint(-4840, -5500, 0, -4950, { title: 'Slide', body: 'Run, then press Shift or C to slide under the pipe. Holding crouch as you land from a jump also slides.', keys: ['Shift', 'C'], done: 'slide' });
      // 6 vault
      box([tx - 300, 0, -6380], [tx + 300, 44, -6340], COLORS.route, { kind: 'route' });
      floor(-6100, -7000); sides(-6100, -7000, -400, 300);
      hint(-6100, -6340, 0, -6150, { title: 'Vault', body: 'Run at the low wall and press Space just before it. You hop over without losing speed.', keys: ['W', 'Space'], done: 'vault' });
      // 7 climb and mantle onto a higher floor
      floor(-7000, -8000, 160); sides(-7000, -8000, -400, 460);
      box([tx - 120, 0, -7000], [tx + 120, 160, -6997], COLORS.route, { kind: 'route', nonsolid: true });
      hint(-6400, -7000, 0, -6500, { title: 'Climb', body: 'Run straight at the wall and press Space to run up it. Keep holding W to pull yourself onto the ledge.', keys: ['W', 'Space'], done: 'mantle' });
      // 8 wallrun across a gap
      sides(-8000, -8600, -400, 520);
      floor(-8600, -9500, 160); sides(-8600, -9500, -400, 460);
      hint(-7100, -8000, 160, -7200, { title: 'Wallrun', body: 'Run along a wall at a slight angle and jump toward it while holding W to run on it. Press Space again to kick off.', keys: ['W', 'Space'], done: 'wallrun' });
      // 9 surf
      world.addSweep([[tx - 320, 100 - 554], [tx + 320, 100 - 554], [tx, 100]], -9580, -12800, -340, { color: COLORS.surf[0], kind: 'ramp' });
      hint(-8600, -9500, 160, -8700, { title: 'Surf', body: 'Jump onto the ramp. Hold A or D toward it to ride the slope and keep W off. Aim a little down the ramp to go faster.', keys: ['A', 'D'], done: 'surf' });
      box([tx - 900, -700, -14000], [tx + 900, -640, -13000], COLORS.surfPad, { kind: 'pad' });
      world.addTrigger([tx - 900, -640, -14000], [tx + 900, -440, -13000], { type: 'end', course: 'tutorial' });
      box([tx - 3000, -1260, -15000], [tx + 3000, -1200, 1000], COLORS.water, { nonsolid: true, water: true });
      world.addTrigger([tx - 3000, -3000, -9500], [tx + 3000, -250, 1000], { type: 'kill', course: 'tutorial' });
      world.addTrigger([tx - 3000, -3000, -15000], [tx + 3000, -1000, -9500], { type: 'kill', course: 'tutorial' });
      world.addTrigger([tx - 300, 0, -400], [tx + 300, 200, 0], { type: 'start', course: 'tutorial' });
      courses.tutorial = { name: 'Tutorial', type: 'Learn', difficulty: 0, color: 0x15191d, key: 'T', desc: 'Nine short stations: move, jump, bhop, air strafe, slide, vault, climb, wallrun and surf.', spawn: steps[0].spawn, stages: steps.length, steps };
    }

    // ------------------------------------------------------------ gauntlet
    // Six numbered levels, each harder than the last, built from three pieces:
    // pads, bhop block lines and surf ramps. Later ones chain bhop straight
    // into surf and back, with smaller blocks, steeper ramps, sideways
    // transfers and fewer checkpoints. Every level runs toward -Z.
    const FACES = { 55: [380, 543], 60: [320, 554], 65: [280, 600] };
    function gauntlet(name, ox, top, def) {
      let x = ox, y = top, z = 0, cp = 0, lo = top, spawn = null, prev = null;
      const plan = [];
      const pal = def.palette;
      def.segs.forEach((sg, si) => {
        const col = pal[si % pal.length];
        if (sg.t === 'pad') {
          const w = sg.w || 600, len = sg.len || 600;
          // a pad after a ramp catches you: drop below the ramp end and start under its tail
          if (prev && prev.t === 'surf') { y = prev.endApex - prev.face[1] - (sg.fall || 450); z = prev.z1 + (sg.back || 200); x = prev.cx; }
          else if (sg.gap) z -= sg.gap;
          box([x - w / 2, y - 60, z - len], [x + w / 2, y, z], COLORS.bhopPad, { kind: 'pad' });
          const here = { pos: [x, y, z - Math.min(300, len / 2)], yaw: 0 };
          const first = !spawn;
          if (first) { spawn = here; world.addTrigger([x - w / 2, y, z - len], [x + w / 2, y + 160, z], { type: 'start', course: name }); }
          else if (sg.cp) { cp++; world.addTrigger([x - w / 2, y, z - len], [x + w / 2, y + 160, z], { type: 'checkpoint', course: name, idx: cp, spawn: here }); }
          else if (sg.end) world.addTrigger([x - w / 2, y, z - len], [x + w / 2, y + 200, z], { type: 'end', course: name });
          plan.push({ t: 'pad', x, y, z0: z, z1: z - len, w, end: !!sg.end });
          z -= len;
        } else if (sg.t === 'bhop') {
          const size = sg.size, h = size / 2;
          for (let k = 0; k < sg.n; k++) {
            if (k) y += sg.dy || 0;
            x += sg.drift || 0;
            const lat = sg.zig ? (k % 2 ? sg.zig : -sg.zig) : sg.lat ? sg.lat[k % sg.lat.length] : 0;
            const cz = z - (k === 0 ? (sg.first || sg.step) - h : sg.step) - (k === 0 ? 0 : 0);
            z = cz;
            box([x + lat - h, y - 60, cz - h], [x + lat + h, y, cz + h], col, { kind: 'block' });
            plan.push({ t: 'block', x: x + lat, y, z0: cz + h, z1: cz - h, cz, w: size });
            lo = Math.min(lo, y);
          }
          z -= h;
        } else if (sg.t === 'surf') {
          const face = FACES[sg.face || 60], [W, H] = face;
          // from a ramp: the next one starts lower and further on; from ground: hop down onto it
          const fromRamp = prev && prev.t === 'surf';
          const apex = fromRamp ? prev.endApex - (sg.fall || 500) : y - (sg.fall || 250);
          const z0 = z - (sg.gap || (fromRamp ? 800 : 60));
          const cx = (fromRamp ? prev.cx : x) + (sg.dx || 0);
          const z1 = z0 - sg.len;
          world.addSweep([[cx - W, apex - H], [cx + W, apex - H], [cx, apex]], z0, z1, -sg.drop, { color: col, kind: 'ramp' });
          sg.cx = cx; sg.z1 = z1; sg.endApex = apex - sg.drop; sg.face = face;
          plan.push({ t: 'ramp', cx, apex, z0, z1, drop: sg.drop, W, H });
          lo = Math.min(lo, apex - sg.drop - H);
          x = cx; z = z1; y = apex - sg.drop;
        }
        if (sg.t === 'pad') lo = Math.min(lo, y);
        prev = sg;
      });
      // water or lava far below, with a kill plane above it
      const pool = lo - 1400;
      const zs = plan.map(q => q.z1);
      const zMin = Math.min(...zs) - 3000;
      const lava = def.pool === 'lava';
      box([ox - 5000, pool - 60, zMin], [ox + 5000, pool, 2500], lava ? COLORS.lava : COLORS.water, lava ? { nonsolid: true, lava: true } : { nonsolid: true, water: true });
      world.addTrigger([ox - 5000, pool - 3000, zMin], [ox + 5000, lo - 600, 2500], { type: 'kill', course: name });
      courses[name] = { name: def.name, type: def.type, difficulty: def.difficulty, color: pal[0], desc: def.desc,
        spawn, stages: cp + 1, plan, set: 'gauntlet', preview: { pos: [ox, top, 300], yaw: 0 } };
    }
    const GBHOP = [0xf08a24, 0xffb340, 0xe5533d], GSURF = [0x2fb5c7, 0x4f74ee, 0x8f55e0, 0xe0457b];
    gauntlet('g1', 96000, 6000, {
      name: 'Lift', type: 'Mixed', difficulty: 1, palette: [0x2fb5c7, 0xf08a24, 0x4f74ee, 0xffb340], pool: 'water',
      desc: 'Gauntlet 1. Hop a short line of wide blocks, drop onto a gentle ramp, land and hop to the finish.',
      segs: [
        { t: 'pad', len: 600 },
        { t: 'bhop', n: 7, size: 176, step: 250 },
        { t: 'surf', face: 55, len: 3000, drop: 400 },
        { t: 'pad', len: 3000, w: 1400, cp: true },
        { t: 'bhop', n: 7, size: 176, step: 250, lat: [0, 40, -40] },
        { t: 'pad', gap: 120, len: 600, end: true },
      ] });
    gauntlet('g2', 107000, 6500, {
      name: 'Drift', type: 'Mixed', difficulty: 2, palette: [0x4f74ee, 0xffb340, 0x2fb5c7, 0xf08a24], pool: 'water',
      desc: 'Gauntlet 2. Weaving blocks into a surf ramp, a sideways transfer to a second ramp, then a climbing block line.',
      segs: [
        { t: 'pad', len: 600 },
        { t: 'bhop', n: 9, size: 150, step: 260, lat: [0, 70, -70, 0, 60, -60] },
        { t: 'surf', face: 60, len: 3400, drop: 400 },
        { t: 'surf', face: 60, len: 3200, drop: 400, dx: 300 },
        { t: 'pad', len: 3000, w: 1400, cp: true },
        { t: 'bhop', n: 9, size: 136, step: 265, dy: 20, lat: [0, 60, -60] },
        { t: 'pad', gap: 120, len: 600, end: true },
      ] });
    gauntlet('g3', 118000, 7000, {
      name: 'Sidewinder', type: 'Mixed', difficulty: 3, palette: [0x8f55e0, 0xf08a24, 0x2fb5c7, 0xe5533d], pool: 'lava',
      desc: 'Gauntlet 3. A curving block line, two ramps with a hard sideways transfer, then falling blocks to the end.',
      segs: [
        { t: 'pad', len: 600 },
        { t: 'surf', face: 60, len: 3400, drop: 450, fall: 200 },
        { t: 'pad', len: 3000, w: 1400, cp: true },
        { t: 'bhop', n: 11, size: 128, step: 275, zig: 55, drift: 30 },
        { t: 'surf', face: 60, len: 3200, drop: 450 },
        { t: 'surf', face: 65, len: 3200, drop: 400, dx: -380 },
        { t: 'pad', len: 3000, w: 1400, cp: true },
        { t: 'bhop', n: 10, size: 120, step: 290, dy: -30, lat: [0, 70, -70, 0] },
        { t: 'pad', gap: 120, len: 600, end: true },
      ] });
    gauntlet('g4', 129000, 8000, {
      name: 'Undertow', type: 'Mixed', difficulty: 4, palette: [0xe0457b, 0xffb340, 0x4f74ee, 0xf08a24], pool: 'water',
      desc: 'Gauntlet 4. Small blocks straight into a steep ramp, a climbing transfer, then hop off the blocks into two more ramps.',
      segs: [
        { t: 'pad', len: 600 },
        { t: 'bhop', n: 10, size: 120, step: 285, lat: [0, 80, -80, 40, -40] },
        { t: 'surf', face: 65, len: 3400, drop: 500 },
        { t: 'surf', face: 60, len: 3000, drop: -150, dx: 420 },
        { t: 'pad', len: 3000, w: 1400, cp: true },
        { t: 'bhop', n: 12, size: 112, step: 290, zig: 95 },
        { t: 'surf', face: 55, len: 3200, drop: 450 },
        { t: 'surf', face: 65, len: 3200, drop: 450, dx: -420 },
        { t: 'pad', len: 3000, w: 1400, end: true },
      ] });
    gauntlet('g5', 140000, 9000, {
      name: 'Freefall', type: 'Mixed', difficulty: 5, palette: [0x2bd1a8, 0xe5533d, 0x4f74ee, 0xffb340], pool: 'lava',
      desc: 'Gauntlet 5. A steep drop into a wide transfer, a curving line of small blocks, then a climbing ramp to finish. One checkpoint.',
      segs: [
        { t: 'pad', len: 600 },
        { t: 'surf', face: 65, len: 2600, drop: 900, fall: 200 },
        { t: 'surf', face: 60, len: 3400, drop: 450, dx: 460 },
        { t: 'pad', len: 3000, w: 1400 },
        { t: 'bhop', n: 12, size: 104, step: 295, zig: 90, drift: -35 },
        { t: 'surf', face: 65, len: 3200, drop: 500 },
        { t: 'pad', len: 3000, w: 1400, cp: true },
        { t: 'bhop', n: 13, size: 104, step: 290, dy: 22, zig: 100 },
        { t: 'surf', face: 60, len: 3200, drop: 450 },
        { t: 'surf', face: 65, len: 3000, drop: -180, dx: -460 },
        { t: 'pad', len: 3000, w: 1400, end: true },
      ] });
    gauntlet('g6', 151000, 10000, {
      name: 'Terminal', type: 'Mixed', difficulty: 6, palette: [0x15191d, 0xdb2f2a, 0x8f55e0, 0xf08a24], pool: 'lava',
      desc: 'Gauntlet 6. The longest and hardest: the smallest blocks, steep ramps, transfers both ways, and one checkpoint at the halfway mark.',
      segs: [
        { t: 'pad', len: 600 },
        { t: 'bhop', n: 12, size: 104, step: 295, lat: [0, 100, -100, 50, -50] },
        { t: 'surf', face: 65, len: 3200, drop: 600 },
        { t: 'surf', face: 65, len: 3000, drop: 450, dx: 500 },
        { t: 'surf', face: 60, len: 3000, drop: -200, dx: -500 },
        { t: 'pad', len: 3000, w: 1400 },
        { t: 'bhop', n: 14, size: 96, step: 300, zig: 105, drift: 30 },
        { t: 'surf', face: 65, len: 3000, drop: 500 },
        { t: 'surf', face: 65, len: 3000, drop: 500, dx: 480 },
        { t: 'pad', len: 3000, w: 1400, cp: true },
        { t: 'bhop', n: 14, size: 96, step: 310, dy: -30, zig: 110 },
        { t: 'surf', face: 65, len: 2600, drop: 900 },
        { t: 'pad', len: 3000, w: 1400, end: true },
      ] });

    // ------------------------------------------------------------ route kit
    // Long surf and bhop runs in the Downtown style: a route of pieces laid
    // out in legs that turn corners on square pads, between city skylines.
    // Pieces: pad, bhop (block line), lane (speed strip), surf (two-sided
    // ramp), bank (one-sided ramp against a cliff, for gorges), slide (a
    // sloped roof) and wall (a gap crossed by wallrunning a billboard).
    // Every leg keeps its plan in local coordinates (x right, z forward is
    // negative) so a bot can ride any level.
    function routeKit(name, ox, oz, top, def) {
      const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      const legs = [];
      let L = null;
      function frame(fx, fz, h) {
        const f = DIRS[h], r = DIRS[(h + 1) % 4];
        L = { ox: fx, oz: fz, h, yaw: Math.atan2(-f[0], -f[1]), items: [],
          at: (x, z) => [fx + r[0] * x + f[0] * -z, fz + r[1] * x + f[1] * -z] };
        legs.push(L);
      }
      frame(ox, oz, 0);
      const W3 = (x, y, z) => { const p = L.at(x, z); return [p[0], y, p[1]]; };
      const lbox = (x0, x1, y0, y1, z0, z1, props) => {
        const a = L.at(x0, z0), b = L.at(x1, z1);
        return world.addBox([Math.min(a[0], b[0]), y0, Math.min(a[1], b[1])], [Math.max(a[0], b[0]), y1, Math.max(a[1], b[1])], props);
      };
      const ltrig = (x0, x1, y0, y1, z0, z1, data) => {
        const a = L.at(x0, z0), b = L.at(x1, z1);
        return world.addTrigger([Math.min(a[0], b[0]), y0, Math.min(a[1], b[1])], [Math.max(a[0], b[0]), y1, Math.max(a[1], b[1])], Object.assign({ course: name }, data));
      };
      // a convex brush from cross-section loops at two depths (local coords)
      const lprism = (loop0, z0, loop1, z1, props) => {
        const a = loop0.map(([x, y]) => W3(x, y, z0)), b = loop1.map(([x, y]) => W3(x, y, z1));
        const faces = [a, b];
        for (let i = 0; i < a.length; i++) { const j = (i + 1) % a.length; faces.push([a[i], a[j], b[j], b[i]]); }
        return world.addHull(faces, props);
      };
      let x = 0, y = top, z = 0, cp = 0, lo = top, spawn = null, prev = null, prevPad = null;
      const pal = def.palette;
      def.segs.forEach((sg, si) => {
        const col = pal[si % pal.length];
        if (sg.t === 'turn') {
          // pivot on the pad we stand on: its centre becomes the new origin
          const p = prevPad, c = L.at(p.x, (p.z0 + p.z1) / 2);
          frame(c[0], c[1], (L.h + sg.dir + 4) % 4);
          // a checkpoint on the corner respawns you in its middle, facing the new way
          if (p.trig) p.trig.spawn = { pos: [c[0], p.y, c[1]], yaw: L.yaw };
          L.items.push({ t: 'pad', x: 0, y: p.y, z0: p.w / 2, z1: -p.w / 2, w: p.len, corner: true });
          x = 0; z = -p.w / 2; prev = sg;
          return;
        }
        if (sg.t === 'pad' || sg.t === 'lane') {
          const w = sg.w || 600, len = sg.len || 600;
          if (prev && (prev.t === 'surf' || prev.t === 'bank')) {
            y = prev.endApex - prev.H - (sg.fall || 450); z = prev.z1 + (sg.back || 200); x = sg.x !== undefined ? sg.x : prev.cx;
          } else {
            z -= sg.gap || 0; y += sg.rise || 0; if (sg.x !== undefined) x = sg.x;
          }
          const kind = sg.t === 'lane' ? 'lane' : 'pad';
          lbox(x - w / 2, x + w / 2, y - 60, y, z - len, z, { color: sg.t === 'lane' ? col : COLORS.bhopPad, kind });
          if (sg.lip) lbox(x - w / 2 + 160, x + w / 2 - 160, y - 130, y, z - 3, z, { color: COLORS.route, kind: 'route' });
          const here = { pos: (() => { const q = W3(x, y, z - Math.min(300, len / 2)); return q; })(), yaw: L.yaw };
          if (!spawn) { spawn = here; ltrig(x - w / 2, x + w / 2, y, y + 160, z - len, z, { type: 'start' }); }
          let trig = null;
          if (spawn !== here && sg.cp) { cp++; trig = ltrig(x - w / 2, x + w / 2, y, y + 160, z - len, z, { type: 'checkpoint', idx: cp, spawn: here }); }
          else if (spawn !== here && sg.end) ltrig(x - w / 2, x + w / 2, y, y + 220, z - len, z, { type: 'end' });
          const it = { t: sg.t, x, y, z0: z, z1: z - len, w, len, end: !!sg.end };
          Object.defineProperty(it, 'trig', { value: trig, enumerable: false });
          L.items.push(it); prevPad = it;
          z -= len;
        } else if (sg.t === 'slide') {
          // a pitched roof falling forward: crouch-slide down it and fly off the end
          const w = sg.w || 700, len = sg.len;
          lprism([[x - w / 2, y], [x + w / 2, y], [x + w / 2, sg.base], [x - w / 2, sg.base]], z,
            [[x - w / 2, y - sg.drop], [x + w / 2, y - sg.drop], [x + w / 2, sg.base], [x - w / 2, sg.base]], z - len, { color: COLORS.roof, kind: 'building' });
          L.items.push({ t: 'slide', x, y, y1: y - sg.drop, z0: z, z1: z - len, w });
          z -= len; y -= sg.drop;
        } else if (sg.t === 'wall') {
          // a gap with a billboard along one side: wallrun it to the next pad
          const s = sg.side, wx = x + s * 330;
          lbox(wx - 20, wx + 20, y - 250, y + 420, z - 50, z - sg.len, { color: COLORS.route, kind: 'route' });
          L.items.push({ t: 'wall', x, y, side: s, wx, z0: z, z1: z - sg.gap });
          z -= sg.gap;
        } else if (sg.t === 'bhop') {
          const size = sg.size, h = size / 2;
          for (let k = 0; k < sg.n; k++) {
            if (k) y += sg.dy || 0;
            x += sg.drift || 0;
            const lat = sg.zig ? (k % 2 ? sg.zig : -sg.zig) : sg.lat ? sg.lat[k % sg.lat.length] : 0;
            const cz = z - (k === 0 ? (sg.first || sg.step) - h : sg.step);
            z = cz;
            lbox(x + lat - h, x + lat + h, y - 60, y, cz - h, cz + h, { color: col, kind: 'block' });
            L.items.push({ t: 'block', x: x + lat, y, z0: cz + h, z1: cz - h, cz, w: size });
            lo = Math.min(lo, y);
          }
          z -= h;
        } else if (sg.t === 'surf' || sg.t === 'bank') {
          let [W, H] = { 55: [380, 543], 60: [320, 554], 65: [280, 600] }[sg.face || 60];
          if (sg.t === 'bank') { W *= 1.6; H *= 1.6; } // gorge banks run deep, nearly to the middle
          const fromRamp = prev && (prev.t === 'surf' || prev.t === 'bank');
          const apex = fromRamp ? prev.endApex - (sg.fall || 500) : y - (sg.fall || 250);
          const z0 = z - (sg.gap || (fromRamp ? 800 : 60));
          let cx = (fromRamp ? prev.cx : x) + (sg.dx || 0);
          if (sg.t === 'bank') cx = (def.center || 0) + sg.side * (def.gorge || 520);
          const z1 = z0 - sg.len, e = apex - sg.drop;
          if (sg.t === 'surf') {
            lprism([[cx - W, apex - H], [cx + W, apex - H], [cx, apex]], z0, [[cx - W, e - H], [cx + W, e - H], [cx, e]], z1, { color: col, kind: 'ramp' });
          } else {
            // the face drops from the cliff edge toward the middle of the gorge
            const s = sg.side, inX = cx - s * W;
            lprism([[cx, apex], [inX, apex - H], [cx, apex - H]], z0, [[cx, e], [inX, e - H], [cx, e - H]], z1, { color: col, kind: 'ramp' });
            lbox(Math.min(cx, cx + s * 700), Math.max(cx, cx + s * 700), def.base, Math.max(apex, e) + 260, z1 - 400, z0 + 400, { color: COLORS.canyonRock, kind: 'cliff' });
          }
          Object.assign(sg, { cx, z1, endApex: e, H });
          L.items.push({ t: 'ramp', cx, apex, z0, z1, drop: sg.drop, W, H, bank: sg.t === 'bank' ? sg.side : 0 });
          lo = Math.min(lo, e - H);
          x = cx; z = z1; y = e;
        }
        if (sg.t === 'pad' || sg.t === 'lane') lo = Math.min(lo, y);
        prev = sg;
      });
      const kill = lo - 600;
      // the whole route's footprint, for the kill volume and the skyline gaps
      const pts = [];
      for (const lg of legs) for (const it of lg.items) {
        const xs = it.t === 'ramp' ? [it.cx - 900, it.cx + 900] : [it.x - 900, it.x + 900];
        for (const xx of xs) for (const zz of [it.z0 + 600, it.z1 - 900]) pts.push(lg.at(xx, zz));
      }
      const bx0 = Math.min(...pts.map(p => p[0])), bx1 = Math.max(...pts.map(p => p[0]));
      const bz0 = Math.min(...pts.map(p => p[1])), bz1 = Math.max(...pts.map(p => p[1]));
      world.addTrigger([bx0 - 4000, kill - 4000, bz0 - 4000], [bx1 + 4000, kill, bz1 + 4000], { type: 'kill', course: name });
      if (def.pool) box([bx0 - 3000, def.base - 60, bz0 - 3000], [bx1 + 3000, def.base, bz1 + 3000], def.pool === 'lava' ? COLORS.lava : COLORS.water,
        def.pool === 'lava' ? { nonsolid: true, lava: true } : { nonsolid: true, water: true });
      // city blocks around the route, kept clear of every leg's corridor
      if (def.skyline) {
        const corridors = [];
        for (const lg of legs) {
          const q = [];
          for (const it of lg.items) { const xs = it.t === 'ramp' ? [it.cx - 700, it.cx + 700] : [it.x - 700, it.x + 700]; for (const xx of xs) for (const zz of [it.z0 + 500, it.z1 - 500]) q.push(lg.at(xx, zz)); }
          corridors.push([Math.min(...q.map(p => p[0])), Math.min(...q.map(p => p[1])), Math.max(...q.map(p => p[0])), Math.max(...q.map(p => p[1]))]);
        }
        let seed = def.skyline.seed;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        const hits = (a) => corridors.some(q => a[0] < q[2] + 160 && a[2] > q[0] - 160 && a[1] < q[3] + 160 && a[3] > q[1] - 160);
        for (let gx = bx0 - 2500; gx < bx1 + 2500; gx += 900) for (let gz = bz0 - 2500; gz < bz1 + 2500; gz += 900) {
          const w = 420 + rnd() * 400, d = 420 + rnd() * 400;
          const ax = gx + rnd() * (840 - w), az = gz + rnd() * (840 - d), a = [ax, az, ax + w, az + d];
          const t = def.skyline.lo + rnd() * (def.skyline.hi - def.skyline.lo), glass = rnd() < 0.3;
          if (!hits(a)) world.addBox([a[0], def.base, a[1]], [a[2], t, a[3]], { color: glass ? COLORS.glass : COLORS.roofSide, kind: 'building', far: true });
        }
        world.addBox([bx0 - 3000, def.base - 20, bz0 - 3000], [bx1 + 3000, def.base, bz1 + 3000], { color: COLORS.street, kind: 'street' });
      }
      const first = legs[0].items[0];
      courses[name] = Object.assign({ spawn, stages: cp + 1, legs: legs.map(lg => ({ ox: lg.ox, oz: lg.oz, h: lg.h, items: lg.items })),
        preview: { pos: (() => { const p = legs[0].at(0, 400); return [p[0], top, p[1]]; })(), yaw: legs[0].yaw } },
        { name: def.name, type: def.type, difficulty: def.difficulty, color: def.color, desc: def.desc, route: true });
    }

    // ------------------------------------------------------------ surf
    // Ten wide descending ramps between towers, three stages turning corners
    // on landing roofs. The gentle one: few sideways transfers.
    routeKit('surf', -125000, 90000, 16000, {
      name: 'Surf', type: 'Surf', difficulty: 1, color: COLORS.surf[0], palette: COLORS.surf, base: 1200, pool: 'water',
      skyline: { lo: 3000, hi: 12000, seed: 11 },
      desc: 'Ten wide ramps down through the towers, turning three corners on landing roofs. Hold the strafe key into the ramp.',
      segs: [
        { t: 'pad', len: 600 },
        { t: 'surf', face: 55, len: 3600, drop: 400 },
        { t: 'surf', face: 60, len: 3600, drop: 400, dx: -300, gap: 900 },
        { t: 'surf', face: 60, len: 3400, drop: 400, dx: 450, gap: 1000 },
        { t: 'pad', len: 3000, w: 1400, cp: true }, { t: 'turn', dir: 1 },
        { t: 'surf', face: 55, len: 3800, drop: 450 },
        { t: 'surf', face: 60, len: 3600, drop: 400, dx: 400, gap: 1000 },
        { t: 'surf', face: 65, len: 3600, drop: 400, dx: -450, gap: 1000 },
        { t: 'pad', len: 3000, w: 1400, cp: true }, { t: 'turn', dir: -1 },
        { t: 'surf', face: 60, len: 3600, drop: 450 },
        { t: 'surf', face: 60, len: 4000, drop: 500, dx: 350, gap: 1000 },
        { t: 'pad', len: 3000, w: 1400, cp: true }, { t: 'turn', dir: 1 },
        { t: 'surf', face: 60, len: 3600, drop: 400 },
        { t: 'surf', face: 65, len: 3600, drop: 400, dx: -400, gap: 1000 },
        { t: 'pad', len: 3000, w: 1400, end: true },
      ] });

    // ------------------------------------------------------------ bhop
    // Block lines over a lava street with widening gaps, four legs that turn
    // on islands, two speed lanes and a long jump to finish.
    routeKit('bhop', -75000, 90000, 3000, {
      name: 'Bhop', type: 'Bhop', difficulty: 2, color: COLORS.bhop, palette: [COLORS.bhop, 0xffb340, 0xe5533d], base: 0, pool: 'lava',
      skyline: { lo: 1200, hi: 6500, seed: 23 },
      desc: 'Four block lines over a lava street with widening gaps, turning on islands, then speed lanes and a long jump.',
      segs: [
        { t: 'pad', len: 500, w: 500 },
        { t: 'bhop', n: 10, size: 160, step: 240 },
        { t: 'pad', gap: 130, len: 400, w: 400, cp: true }, { t: 'turn', dir: 1 },
        { t: 'bhop', n: 10, size: 150, step: 256, lat: [0, 70, -70, 0, 100, -60] },
        { t: 'pad', gap: 130, len: 400, w: 400, cp: true }, { t: 'turn', dir: -1 },
        { t: 'bhop', n: 10, size: 144, step: 272, lat: [0, 60, -60, 40, -110, 120] },
        { t: 'lane', gap: 120, len: 2400, w: 256 },
        { t: 'pad', gap: 400, rise: -300, len: 700, w: 600, cp: true }, { t: 'turn', dir: 1 },
        { t: 'bhop', n: 10, size: 136, step: 288, lat: [0, 90, -90, 60, -60, 0] },
        { t: 'lane', gap: 120, len: 3000, w: 256 },
        { t: 'pad', gap: 380, rise: -400, len: 860, w: 768, end: true },
      ] });

    // ------------------------------------------------------------ canyon
    // A gorge cut through the city: banks alternate sides, each one lower,
    // and the gorge turns twice on ledges. Carve down one side, up the other.
    routeKit('canyon', -45000, 90000, 15000, {
      name: 'Canyon', type: 'Surf', difficulty: 3, color: COLORS.canyon[0], palette: COLORS.canyon, base: 1500, pool: 'water', gorge: 520,
      skyline: { lo: 4000, hi: 11000, seed: 37 },
      desc: 'A long gorge whose banks swap sides as it falls, turning twice on rock ledges. Carve down one side and up the other.',
      segs: [
        { t: 'pad', len: 600 },
        { t: 'bank', side: -1, face: 60, len: 3600, drop: 400 },
        { t: 'bank', side: 1, face: 60, len: 3400, drop: 400, gap: 1000 },
        { t: 'bank', side: -1, face: 65, len: 3400, drop: 400, gap: 1000 },
        { t: 'bank', side: 1, face: 60, len: 3400, drop: 400, gap: 1000 },
        { t: 'pad', len: 3000, w: 1400, cp: true }, { t: 'turn', dir: 1 },
        { t: 'bank', side: 1, face: 60, len: 3600, drop: 450 },
        { t: 'bank', side: -1, face: 65, len: 3400, drop: 400, gap: 1000 },
        { t: 'bank', side: 1, face: 60, len: 3400, drop: 400, gap: 1000 },
        { t: 'pad', len: 3000, w: 1400, cp: true }, { t: 'turn', dir: -1 },
        { t: 'bank', side: -1, face: 60, len: 3600, drop: 450 },
        { t: 'bank', side: 1, face: 65, len: 3400, drop: 400, gap: 1000 },
        { t: 'bank', side: -1, face: 60, len: 3400, drop: 400, gap: 1000 },
        { t: 'bank', side: 1, face: 65, len: 3200, drop: 400, gap: 1000 },
        { t: 'pad', len: 3000, w: 1400, end: true },
      ] });

    // ------------------------------------------------------------ stairway
    // Five block lines that climb and fall, turning on corner islands.
    routeKit('stairway', -8000, 90000, 3000, {
      name: 'Stairway', type: 'Bhop', difficulty: 4, color: COLORS.stair[1], palette: COLORS.stair, base: -1500, pool: 'lava',
      skyline: { lo: 0, hi: 6000, seed: 53 },
      desc: 'Five block lines that climb and fall over the lava street, turning on corner islands. Steer the corners in the air.',
      segs: [
        { t: 'pad', len: 500, w: 500 },
        { t: 'bhop', n: 10, size: 128, step: 265, dy: 24 },
        { t: 'pad', gap: 130, len: 360, w: 360, cp: true }, { t: 'turn', dir: 1 },
        { t: 'bhop', n: 10, size: 128, step: 280, dy: -30, zig: 60 },
        { t: 'pad', gap: 130, len: 360, w: 360 }, { t: 'turn', dir: -1 },
        { t: 'bhop', n: 12, size: 120, step: 270, dy: 20, lat: [0, 70, -70, 0] },
        { t: 'pad', gap: 130, len: 360, w: 360, cp: true }, { t: 'turn', dir: -1 },
        { t: 'bhop', n: 10, size: 120, step: 300, dy: -45, lat: [0, 60, -60] },
        { t: 'pad', gap: 130, len: 360, w: 360 }, { t: 'turn', dir: 1 },
        { t: 'bhop', n: 12, size: 112, step: 280, zig: 75 },
        { t: 'pad', gap: 130, len: 500, w: 500, end: true },
      ] });

    // ------------------------------------------------------------ crossover
    // Everything in one long line: slide a roof onto a ramp, surf a transfer,
    // bhop, wallrun a billboard, mantle, then all of it again round two corners.
    routeKit('crossover', 22000, 90000, 9000, {
      name: 'Crossover', type: 'Mixed', difficulty: 5, color: 0x1d2a35, palette: [COLORS.surf[1], COLORS.bhop, COLORS.surf[3], 0xffb340], base: 0,
      skyline: { lo: 1500, hi: 8000, seed: 71 },
      desc: 'All of it, twice, round two corners: slide a roof onto a ramp, surf a transfer, bhop, wallrun a billboard and mantle the next roof.',
      segs: [
        { t: 'pad', len: 700, w: 900 },
        { t: 'slide', len: 1500, drop: 400, base: 0 },
        { t: 'surf', face: 60, len: 3200, drop: 400 },
        { t: 'surf', face: 65, len: 3200, drop: 400, dx: 550, gap: 1200 },
        { t: 'pad', len: 3000, w: 1400, cp: true }, { t: 'turn', dir: 1 },
        { t: 'bhop', n: 8, size: 150, step: 275, lat: [0, 80, -80, 0] },
        { t: 'pad', gap: 130, len: 800, w: 900 },
        { t: 'wall', side: 1, len: 700, gap: 550 },
        { t: 'pad', rise: 120, len: 1100, w: 1100, lip: true, cp: true }, { t: 'turn', dir: -1 },
        { t: 'slide', len: 1500, drop: 400, base: 0 },
        { t: 'surf', face: 60, len: 3400, drop: 450 },
        { t: 'surf', face: 65, len: 3200, drop: 400, dx: -450, gap: 1000 },
        { t: 'pad', len: 3000, w: 1400, cp: true },
        { t: 'bhop', n: 8, size: 136, step: 285, zig: 70 },
        { t: 'pad', gap: 130, len: 800, w: 900 },
        { t: 'wall', side: -1, len: 700, gap: 550 },
        { t: 'pad', rise: 120, len: 900, w: 900, lip: true, end: true },
      ] });

    // ------------------------------------------------------------ level order and keys
    const order = ['surf', 'bhop', 'roofs', 'canyon', 'stairway', 'crossover', 'downtown', 'cascade', 'spire', 'freerun'];
    order.forEach((name, i) => { courses[name].key = String((i + 1) % 10); }); // the tenth level is on 0

    // global safety net
    world.addTrigger([-1e6, -1e6, -1e6], [1e6, -4000, 1e6], { type: 'kill' });

    const gauntletOrder = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'];
    gauntletOrder.forEach((name, i) => { courses[name].key = 'G' + (i + 1); });

    return { world, courses, order, gauntlet: gauntletOrder, hubSpawn, COLORS };
  }

  root.StrafeMap = { buildMap };
})(typeof window !== 'undefined' ? window : globalThis);
