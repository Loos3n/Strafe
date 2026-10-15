// Strafe map: the tutorial, ten levels, the six-level Gauntlet and the six-level Night City.
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
    // a convex brush around a handful of points: every plane through three of
    // them with all the rest behind it is a face (used for curved ramps)
    const hullPts = (pts, props) => {
      const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const faces = [], planes = [];
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) for (let k = j + 1; k < pts.length; k++) {
        let n = cross(sub(pts[j], pts[i]), sub(pts[k], pts[i]));
        const l = Math.hypot(n[0], n[1], n[2]);
        if (l < 1e-6) continue;
        n = n.map(v => v / l);
        let d = dot(n, pts[i]), pos = 0, neg = 0;
        for (const q of pts) { const e = dot(n, q) - d; if (e > 0.01) pos++; else if (e < -0.01) neg++; }
        if (pos && neg) continue;
        if (pos) { n = n.map(v => -v); d = -d; }
        if (planes.some(q => dot(q.n, n) > 0.999999 && Math.abs(q.d - d) < 0.05)) continue;
        planes.push({ n, d });
        const on = pts.filter(q => Math.abs(dot(n, q) - d) < 0.05);
        const c = [0, 1, 2].map(a => on.reduce((t, q) => t + q[a], 0) / on.length);
        const u0 = sub(on[0], c), ul = Math.hypot(...u0), u = u0.map(v => v / ul), v = cross(n, u);
        on.sort((a, b) => Math.atan2(dot(sub(a, c), v), dot(sub(a, c), u)) - Math.atan2(dot(sub(b, c), v), dot(sub(b, c), u)));
        faces.push(on);
      }
      return world.addHull(faces, props);
    };

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
    // Nine narrow ramps that flip from side to side across wide gaps, and the
    // line bends between some of them, so a transfer has to turn in the air
    // as well as carry across. Two ramps climb right before the longest gaps.
    // Two checkpoints, each on a long steep ramp you drop onto from a high
    // ledge.
    {
      const cx = -26000;
      // narrower than the usual faces: a landing window of about 200 units
      const R60 = [240, 554], R55 = [380, 543], R65 = [210, 600];
      // turn: how far the line bends (radians, + is left) crossing the gap before this ramp
      const defs = [
        { dx: 0, len: 4000, drop: 900, face: R60, gap: 1000 },
        { dx: -580, len: 3000, drop: 450, face: R65, gap: 1300 },
        { dx: 580, len: 3000, drop: 450, face: R65, gap: 1400, turn: 0.3 },
        { dx: 0, len: 3400, drop: 1500, face: R55, gap: 1000, cp: true, fall: 0.9 },  // steep: build speed (checkpoint)
        { dx: 680, len: 2600, drop: -250, face: R60, gap: 1500, fall: 0.4 }, // climbs into a long gap
        { dx: -580, len: 2800, drop: 450, face: R65, gap: 1400 },
        { dx: -130, len: 3400, drop: 1500, face: R55, gap: 1000, cp: true, fall: 0.9 }, // steep again (checkpoint)
        { dx: -720, len: 2600, drop: -250, face: R60, gap: 1500, fall: 0.4, turn: -0.3 }, // climbs
        { dx: 520, len: 3000, drop: 500, face: R65, gap: 1200, turn: 0.3 },
      ];
      // the next ramp sits lower by what you fall crossing the gap, give or take
      const STAGE_LIFT = 2100, STAGE_OUT = 200;
      const fall = (d) => d.gap * (d.fall || 0.6);
      // a ramp as a triangular prism along any heading (yaw 0 runs toward -z)
      const ramp = (x, z, hd, len, W, H, apex, drop, props) => {
        const fx = -Math.sin(hd), fz = -Math.cos(hd), rx = Math.cos(hd), rz = -Math.sin(hd);
        const end = (t, y) => [[x + fx * t - rx * W, y - H, z + fz * t - rz * W], [x + fx * t, y, z + fz * t], [x + fx * t + rx * W, y - H, z + fz * t + rz * W]];
        const [l0, a0, r0] = end(0, apex), [l1, a1, r1] = end(len, apex - drop);
        return world.addHull([[l0, r0, r1, l1], [a0, r0, r1, a1], [a0, l0, l1, a1], [l0, a0, r0], [l1, a1, r1]], props);
      };
      let apex = 13000, hd = 0, px = cx, pz = 600;
      const spawns = [], pts = [];
      defs.forEach((d, i) => {
        const [W, H] = d.face;
        if (i) { const gap = defs[i - 1].gap; hd += d.turn || 0; px += -Math.sin(hd) * gap; pz += -Math.cos(hd) * gap; }
        const fx = -Math.sin(hd), fz = -Math.cos(hd), rgx = Math.cos(hd), rgz = -Math.sin(hd);
        const x = px + rgx * d.dx, z = pz + rgz * d.dx;
        ramp(x, z, hd, d.len, W, H, apex, d.drop, { color: COLORS.surf[i % COLORS.surf.length], kind: 'ramp' });
        Object.assign(d, { x, z, hd, fx, fz, rx: rgx, rz: rgz, apex, W, H, cx: x, z0: z, z1: z + fz * d.len });
        pts.push([x, z], [x + fx * d.len, z + fz * d.len]);
        if (i === 0 || d.cp) {
          // later stages start from a ledge high above the ramp: the drop in
          // gives back the speed a full run would be carrying
          const lift = i ? STAGE_LIFT : 60, out = i ? STAGE_OUT : 0;
          const top = apex + lift, side = W + 300 + out;
          const sx = x - rgx * side + fx * 300, sz = z - rgz * side + fz * 300;
          // the ledge is turned with the ramp, so you step off it toward the ramp
          const c = (u, v, y) => [sx + rgx * u + fx * v, y, sz + rgz * u + fz * v];
          const q = [[-220, -300], [220, -300], [220, 300], [-220, 300]];
          world.addHull([q.map(([u, v]) => c(u, v, top)), q.map(([u, v]) => c(u, v, top - 40)),
            ...q.map(([u, v], j) => { const [u2, v2] = q[(j + 1) % 4]; return [c(u, v, top), c(u2, v2, top), c(u2, v2, top - 40), c(u, v, top - 40)]; })],
            { color: COLORS.surfPad, kind: 'pad' });
          const spawn = { pos: [sx, top, sz], yaw: hd - 1.05 };
          spawns.push(spawn);
          if (i > 0) world.addTrigger([x - 1600, apex - 3000, z - 1600], [x + 1600, apex + 2000, z + 1600],
            { type: 'checkpoint', course: 'cascade', idx: spawns.length - 1, spawn });
          else world.addTrigger([sx - 220, top, sz - 300], [sx + 220, top + 240, sz + 300], { type: 'start', course: 'cascade' });
        }
        apex = apex - d.drop - fall(d);
        px += fx * d.len; pz += fz * d.len;
      });
      const last = defs[defs.length - 1];
      const fy = last.apex - last.drop - 700;
      const ex = last.x + last.fx * (last.len + 1200), ez = last.z + last.fz * (last.len + 1200);
      box([ex - 900, fy - 60, ez - 900], [ex + 900, fy, ez + 900], COLORS.surfPad, { kind: 'pad' });
      world.addTrigger([ex - 900, fy, ez - 900], [ex + 900, fy + 200, ez + 900], { type: 'end', course: 'cascade' });
      pts.push([ex, ez]);
      const x0 = Math.min(...pts.map(p => p[0])) - 4000, x1 = Math.max(...pts.map(p => p[0])) + 4000;
      const z0 = Math.min(...pts.map(p => p[1])) - 3000, z1 = Math.max(...pts.map(p => p[1])) + 2000;
      box([x0, -260, z0], [x1, -200, z1], COLORS.water, { nonsolid: true, water: true });
      world.addTrigger([x0, -3000, z0], [x1, fy - 400, z1], { type: 'kill', course: 'cascade' });
      courses.cascade = { preview: { pos: [cx - 900, 13200, 1400], yaw: -0.25 }, name: 'Cascade', type: 'Surf', difficulty: 5, color: 0x2bd1a8,
        desc: 'Nine narrow ramps with long jumps that switch sides, and the line bends between them, so you turn in the air too. Two ramps climb into the widest gaps. Only two checkpoints, each a drop from a high ledge.',
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
          // deep (or gap, the space between blocks): how long each block runs
          // along the line. Small gaps forgive carrying a little too much speed
          // (you skip a block instead of falling); width sets the aim
          const size = sg.size, h = size / 2, hd = (sg.deep || (sg.gap ? sg.step - sg.gap : size)) / 2;
          for (let k = 0; k < sg.n; k++) {
            if (k) y += sg.dy || 0;
            x += sg.drift || 0;
            const lat = sg.zig ? (k % 2 ? sg.zig : -sg.zig) : sg.lat ? sg.lat[k % sg.lat.length] : 0;
            const cz = z - (k === 0 ? (sg.first || sg.step) - hd : sg.step);
            z = cz;
            box([x + lat - h, y - 60, cz - hd], [x + lat + h, y, cz + hd], col, { kind: 'block' });
            plan.push({ t: 'block', x: x + lat, y, z0: cz + hd, z1: cz - hd, cz, w: size, d: hd * 2 });
            lo = Math.min(lo, y);
          }
          z -= hd;
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
        { t: 'bhop', gap: 44, n: 7, size: 176, step: 250 },
        { t: 'surf', face: 55, len: 3000, drop: 400 },
        { t: 'pad', len: 3000, w: 1400, cp: true },
        { t: 'bhop', gap: 44, n: 7, size: 176, step: 250, lat: [0, 40, -40] },
        { t: 'pad', gap: 120, len: 600, end: true },
      ] });
    gauntlet('g2', 107000, 6500, {
      name: 'Drift', type: 'Mixed', difficulty: 2, palette: [0x4f74ee, 0xffb340, 0x2fb5c7, 0xf08a24], pool: 'water',
      desc: 'Gauntlet 2. Weaving blocks into a surf ramp, a sideways transfer to a second ramp, then a climbing block line.',
      segs: [
        { t: 'pad', len: 600 },
        { t: 'bhop', gap: 60, n: 9, size: 150, step: 260, lat: [0, 70, -70, 0, 60, -60] },
        { t: 'surf', face: 60, len: 3400, drop: 400 },
        { t: 'surf', face: 60, len: 3200, drop: 400, dx: 300 },
        { t: 'pad', len: 3000, w: 1400, cp: true },
        { t: 'bhop', gap: 56, n: 9, size: 136, step: 265, lat: [0, 60, -60] },
        { t: 'pad', gap: 120, len: 600, end: true },
      ] });
    gauntlet('g3', 118000, 7000, {
      name: 'Sidewinder', type: 'Mixed', difficulty: 3, palette: [0x8f55e0, 0xf08a24, 0x2fb5c7, 0xe5533d], pool: 'lava',
      desc: 'Gauntlet 3. A curving block line, two ramps with a hard sideways transfer, then falling blocks to the end.',
      segs: [
        { t: 'pad', len: 600 },
        { t: 'surf', face: 60, len: 3400, drop: 450, fall: 200 },
        { t: 'pad', len: 3000, w: 1400, cp: true },
        { t: 'bhop', gap: 56, n: 11, size: 128, step: 275, zig: 55, drift: 30 },
        { t: 'surf', face: 60, len: 3200, drop: 450 },
        { t: 'surf', face: 65, len: 3200, drop: 400, dx: -380 },
        { t: 'pad', len: 3000, w: 1400, cp: true },
        { t: 'bhop', gap: 62, n: 10, size: 108, step: 290, dy: -30, zig: 80 },
        { t: 'pad', gap: 120, len: 600, end: true },
      ] });
    gauntlet('g4', 129000, 8000, {
      name: 'Undertow', type: 'Mixed', difficulty: 4, palette: [0xe0457b, 0xffb340, 0x4f74ee, 0xf08a24], pool: 'water',
      desc: 'Gauntlet 4. Small blocks straight into a steep ramp, a climbing transfer, then hop off the blocks into two more ramps.',
      segs: [
        { t: 'pad', len: 600 },
        { t: 'bhop', gap: 62, n: 10, size: 120, step: 285, lat: [0, 80, -80, 40, -40] },
        { t: 'surf', face: 65, len: 3400, drop: 500 },
        { t: 'surf', face: 60, len: 3000, drop: -150, dx: 420 },
        { t: 'pad', len: 3000, w: 1400, cp: true },
        { t: 'bhop', gap: 68, n: 12, size: 112, step: 290, zig: 95 },
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
        { t: 'bhop', gap: 68, n: 12, size: 104, step: 295, zig: 90, drift: -35 },
        { t: 'surf', face: 65, len: 3200, drop: 500 },
        { t: 'pad', len: 3000, w: 1400, cp: true },
        { t: 'bhop', gap: 68, n: 11, size: 104, step: 290, dy: 22, zig: 85 },
        { t: 'surf', face: 60, len: 3200, drop: 450 },
        { t: 'surf', face: 65, len: 3000, drop: -180, dx: -460 },
        { t: 'pad', len: 3000, w: 1400, end: true },
      ] });
    // Terminal, the Gauntlet's last level, is laid out by the route kit (further
    // down) so its pads can carry departure gates

    // ------------------------------------------------------------ route kit
    // Long surf and bhop runs in the Downtown style: a route of pieces laid
    // out in legs that turn corners on square pads, between city skylines.
    // Pieces: pad, bhop (block line), lane (speed strip), surf (two-sided
    // ramp), bank (one-sided ramp against a cliff, for gorges), slide (a
    // sloped roof) and wall (a gap crossed by wallrunning a billboard).
    // Every leg keeps its plan in local coordinates (x right, z forward is
    // negative) so a bot can ride any level.
    // updraft pads (Endless): straight up at UP and on at FLAT, which lands you on a roof
    // RISE higher that starts GAP past the pad (you pass that height on the way up well short of it)
    const UPDRAFT = { up: 2000, flat: 700, rise: 2000, gap: 1500 };
    function routeBuilder(name, ox, oz, top, def) {
      const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      const legs = [];
      let L = null;
      function frame(fx, fz, h) {
        const f = DIRS[h], r = DIRS[(h + 1) % 4];
        L = { ox: fx, oz: fz, h, yaw: Math.atan2(-f[0], -f[1]), items: [],
          at: (x, z) => [fx + r[0] * x + f[0] * -z, fz + r[1] * x + f[1] * -z] };
        legs.push(L);
      }
      frame(ox, oz, def.h || 0);
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
      const RAMPS = { surf: 1, bank: 1, curve: 1 };
      // night levels: neon strips (visual only) along pad edges and ramp feet
      const NEON = def.neon || [];
      let ni = 0;
      const neon = () => ({ color: NEON[ni++ % NEON.length], nonsolid: true, glow: true });
      const solidProps = (props) => def.night ? Object.assign(props, { neon: true }) : props;
      function add(sg, si, next) {
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
        if (sg.t === 'updraft') {
          // a launch pad on the end of the pad you stand on: it throws you up
          // (UPDRAFT, the same arc every time) onto a long roof RISE higher
          const f = DIRS[L.h], w = 640, len = 400;
          lbox(x - w / 2, x + w / 2, y - 60, y, z - len, z, solidProps({ color: 0xffc21a, kind: 'pad', updraft: { dir: [f[0], f[1]], up: UPDRAFT.up, flat: UPDRAFT.flat } }));
          for (const u of [-1, 1]) lbox(x + u * (w / 2 + 2), x + u * (w / 2 + 14), y - 30, y + 2, z - len, z, { color: 0xfff3b0, nonsolid: true, glow: true });
          L.items.push({ t: 'pad', x, y, z0: z, z1: z - len, w, len, launch: true });
          z -= len + UPDRAFT.gap; y += UPDRAFT.rise;
          const lw = 1400, ll = 2600;
          lbox(x - lw / 2, x + lw / 2, y - 60, y, z - ll, z, solidProps({ color: def.padColor || COLORS.bhopPad, kind: 'pad' }));
          const here = { pos: W3(x, y, z - 300), yaw: L.yaw };
          let trig = null;
          if (sg.cp) { cp++; trig = ltrig(x - lw / 2, x + lw / 2, y, y + 160, z - ll, z, { type: 'checkpoint', idx: cp, spawn: here }); }
          const it = { t: 'pad', x, y, z0: z, z1: z - ll, w: lw, len: ll };
          Object.defineProperty(it, 'trig', { value: trig, enumerable: false });
          L.items.push(it); prevPad = it;
          z -= ll; prev = sg;
          return;
        }
        if (sg.t === 'pad' || sg.t === 'lane') {
          const w = sg.w || 600, len = sg.len || 600;
          if (prev && RAMPS[prev.t]) {
            y = prev.endApex - prev.H - (sg.fall || 450); z = prev.z1 + (sg.back || 200); x = sg.x !== undefined ? sg.x : prev.cx;
          } else if (prev && prev.t === 'zip') {
            // under the cable's low end: you let go over it and land
            y = prev.endY - 84 - (sg.fall || 300); z = prev.z1 + (sg.back || 300); x = sg.x !== undefined ? sg.x : prev.ex;
          } else {
            z -= sg.gap || 0; y += sg.rise || 0; if (sg.x !== undefined) x = sg.x;
          }
          const kind = sg.t === 'lane' ? 'lane' : 'pad';
          lbox(x - w / 2, x + w / 2, y - 60, y, z - len, z, solidProps({ color: sg.t === 'lane' ? col : def.padColor || COLORS.bhopPad, kind }));
          if (def.night) {
            // a neon trim just outside the top edges
            const g = neon(), a = x - w / 2, b = x + w / 2;
            lbox(a - 10, a - 2, y - 22, y - 4, z - len, z, g); lbox(b + 2, b + 10, y - 22, y - 4, z - len, z, g);
            lbox(a, b, y - 22, y - 4, z + 2, z + 10, g); lbox(a, b, y - 22, y - 4, z - len - 10, z - len - 2, g);
          }
          if (sg.lip) lbox(x - w / 2 + 160, x + w / 2 - 160, y - 130, y, z - 3, z, { color: COLORS.route, kind: 'route' });
          // climb: the pad's front is a wall RISE high, straight up from the pad before (no gap):
          // run at it, jump, climb and pull up. A red panel marks it.
          if (sg.climb) {
            lbox(x - w / 2, x + w / 2, y - (sg.rise || 0) - 400, y - 60, z - 40, z, { color: COLORS.roofSide, kind: 'building' });
            lbox(x - 140, x + 140, y - (sg.rise || 0) + 20, y - 4, z, z + 3, { color: COLORS.route, kind: 'route' });
          }
          // obstacles across the pad, each at OFF along it: vault rails (knee high, vault
          // or hop them), slots (a wall with a gap under it: slide through) and gates
          // (a door that slides up and down on a clock: time your run)
          const across = (list) => (list || []).map(o => typeof o === 'number' ? { at: o } : o);
          const vaults = across(sg.vault).map(o => {
            lbox(x - w / 2, x + w / 2, y, y + 44, z - o.at - 24, z - o.at, { color: COLORS.route, kind: 'route' });
            return z - o.at;
          });
          const slots = across(sg.slot).map(o => {
            lbox(x - w / 2, x + w / 2, y + 62, y + 420, z - o.at - 40, z - o.at, { color: COLORS.route, kind: 'route' });
            lbox(x - w / 2, x + w / 2, y + 62, y + 70, z - o.at - 44, z - o.at + 4, { color: 0xfff1b8, nonsolid: true, glow: true });
            return z - o.at;
          });
          const gates = across(sg.gate).map(o => {
            const up = o.up || 360, time = o.time || 1.2;
            const door = lbox(x - w / 2, x + w / 2, y, y + 320, z - o.at - 32, z - o.at, { color: 0xffc21a, kind: 'route' });
            world.addMover([door], [0, up, 0], time);
            return { z: z - o.at, up, time };
          });
          const here = { pos: (() => { const q = W3(x, y, z - Math.min(300, len / 2)); return q; })(), yaw: L.yaw };
          if (!spawn) { spawn = here; ltrig(x - w / 2, x + w / 2, y, y + 160, z - len, z, { type: 'start' }); }
          let trig = null;
          if (spawn !== here && sg.cp) { cp++; trig = ltrig(x - w / 2, x + w / 2, y, y + 160, z - len, z, { type: 'checkpoint', idx: cp, spawn: here }); }
          else if (spawn !== here && sg.end) ltrig(x - w / 2, x + w / 2, y, y + 220, z - len, z, { type: 'end' });
          const it = { t: sg.t, x, y, z0: z, z1: z - len, w, len, end: !!sg.end };
          if (sg.climb) it.climb = sg.rise || 0;
          if (vaults.length) it.vaults = vaults;
          if (slots.length) it.slots = slots;
          if (gates.length) it.gates = gates;
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
        } else if (sg.t === 'zip') {
          // a zipline off the pad's far edge: jump from the edge, grab the
          // cable, ride it down to the next pad. Posts stand beside the cable.
          // off the end of another cable: no roof between, this one hangs FALL below
          // where the last let you go and GAP on, so you drop onto it
          const chain = prev && prev.t === 'zip';
          const dx = sg.dx || 0, ay = chain ? prev.endY - (sg.fall || 300) : y + (sg.hang !== undefined ? sg.hang : 140), by = ay - sg.drop, ex = x + dx;
          if (chain) z -= sg.gap || 300;
          if (sg.sx) x += sg.sx; // starting off to one side (beside a wall you run off the end of)
          const z0 = chain ? z : z + 60, z1 = z - sg.len;
          world.ziplines.push({ a: W3(x, ay, z0), b: W3(ex, by, z1) });
          const post = { color: COLORS.route, kind: 'route' }, foot = by - 84 - 600;
          // (off a wallrun the post stands on the wall's side, out of the way of your kick)
          const ps = prev && prev.t === 'wall' ? prev.side : 1, pa = (u, v) => [x + ps * u, x + ps * v].sort((m, n) => m - n);
          lbox(...pa(48, 80), chain || ay < y + 40 ? ay - 600 : y, ay + 16, z0 - 16, z0 + 16, post); lbox(...pa(-8, 80), ay + 4, ay + 16, z0 - 6, z0 + 6, chain || sg.sx ? Object.assign({ nonsolid: true, deco: true }, post) : post); // (where you fly in under it, the arm is only drawn)
          lbox(ex + 48, ex + 80, foot, by + 16, z1 - 16, z1 + 16, post); lbox(ex - 8, ex + 80, by + 4, by + 16, z1 - 6, z1 + 6, post);
          // the cable itself: drawn, never solid
          L.items.push({ t: 'zip', x, y, ex, z0, z1, endY: by });
          Object.assign(sg, { ex, z1, endY: by });
          lo = Math.min(lo, by - 84 - 300);
          z = z1; x = ex; y = by - 84;
        } else if (sg.t === 'wall') {
          // a gap with a billboard along one side: wallrun it to the next pad
          const s = sg.side, wx = x + s * 330;
          lbox(wx - 20, wx + 20, y - 250, y + 420, z - 50, z - sg.len, { color: COLORS.route, kind: 'route' });
          L.items.push({ t: 'wall', x, y, side: s, wx, z0: z, z1: z - sg.gap, kick: sg.kick });
          z -= sg.gap;
        } else if (sg.t === 'w2w') {
          // wall to wall: N billboards down a narrow alley, swapping sides, each
          // overlapping the last. Wallrun one, kick across to the next.
          const n = sg.n || 2, len = sg.len || 560, step = sg.step || 420, half = sg.half || 190, dy = sg.dy || 0;
          const walls = [];
          for (let k = 0; k < n; k++) {
            const s = sg.side * (k % 2 ? -1 : 1), wx = x + s * (half + 20), z0 = z - 60 - k * step, wy = y + k * dy;
            lbox(wx - 20, wx + 20, wy - 300, wy + 420, z0 - len, z0, { color: COLORS.route, kind: 'route' });
            walls.push({ side: s, wx, z0, z1: z0 - len });
          }
          const gap = 60 + (n - 1) * step + len + (sg.out || 160);
          L.items.push({ t: 'w2w', x, y, side: sg.side, half, walls, z0: z, z1: z - gap, kickAt: sg.kickAt, lastKick: sg.lastKick, inset: sg.inset });
          z -= gap;
        } else if (sg.t === 'bhop') {
          const size = sg.size, h = size / 2, hd = (sg.deep || (sg.gap ? sg.step - sg.gap : size)) / 2;
          for (let k = 0; k < sg.n; k++) {
            if (k) y += sg.dy || 0;
            x += sg.drift || 0;
            const lat = sg.zig ? (k % 2 ? sg.zig : -sg.zig) : sg.lat ? sg.lat[k % sg.lat.length] : 0;
            const cz = z - (k === 0 ? (sg.first || sg.step) - hd : sg.step);
            z = cz;
            // sway: the blocks slide side to side (D across, TIME seconds each way),
            // neighbours swinging opposite ways, centred on where they would stand
            const sw = sg.sway && (!sg.sway.from || k >= sg.sway.from) ? (k % 2 ? -sg.sway.d : sg.sway.d) : 0;
            const bx = x + lat - sw / 2;
            const blk = lbox(bx - h, bx + h, y - 60, y, cz - hd, cz + hd, solidProps({ color: col, kind: 'block' }));
            const it = { t: 'block', x: x + lat, y, z0: cz + hd, z1: cz - hd, cz, w: size, d: hd * 2 };
            if (sw) {
              const a = L.at(0, 0), b = L.at(sw, 0);
              world.addMover([blk], [b[0] - a[0], 0, b[1] - a[1]], sg.sway.time);
              Object.assign(it, { base: bx, sway: sw, time: sg.sway.time });
            }
            L.items.push(it);
            lo = Math.min(lo, y);
          }
          z -= hd;
        } else if (sg.t === 'curve') {
          // a ramp that bends a quarter turn (dir 1 right, -1 left) on radius R.
          // Built from short straight pieces sharing their ends, so the surface
          // is seamless. You ride the inside face, which banks you round. A new
          // leg starts at the exit, heading the new way.
          const [W, H] = FACES[sg.face || 60];
          const fromRamp = prev && RAMPS[prev.t];
          const apex = sg.join ? prev.endApex : fromRamp ? prev.endApex - (sg.fall || 500) : y - (sg.fall || 250);
          const z0 = sg.join ? z : z - (sg.gap || (fromRamp ? 800 : 60));
          const cx = sg.join ? prev.cx : (fromRamp ? prev.cx : x) + (sg.dx || 0);
          const d = sg.dir, R = sg.R || 3600, e = apex - sg.drop;
          const N = Math.ceil(R * Math.PI / 2 / 240);
          const sect = (j) => {
            const a = j / N * Math.PI / 2, px = cx + d * R * (1 - Math.cos(a)), pz = z0 - R * Math.sin(a);
            const rx = Math.cos(a), rz = d * Math.sin(a), ay = apex - sg.drop * j / N;
            const at = (u, yy) => W3(px + rx * u, yy, pz + rz * u);
            return { p: at(0, ay), l: at(-W, ay - H), r: at(W, ay - H), gl: [at(-W - 2, ay - H), at(-W - 14, ay - H), at(-W - 14, ay - H + 12), at(-W - 2, ay - H + 12)],
              gr: [at(W + 2, ay - H), at(W + 14, ay - H), at(W + 14, ay - H + 12), at(W + 2, ay - H + 12)], gp: [at(-7, ay - 12), at(7, ay - 12), at(0, ay + 3)] };
          };
          const chords = [], g = def.night ? neon() : null;
          for (let j = 0; j < N; j++) {
            const s0 = sect(j), s1 = sect(j + 1);
            const fx0 = s1.p[0] - s0.p[0], fz0 = s1.p[2] - s0.p[2], len = Math.hypot(fx0, fz0), fx = fx0 / len, fz = fz0 / len;
            // each piece runs 40 units into its neighbours, so the joins are
            // buried under the face instead of standing up as edges to catch on
            const ex = (q, k) => [q[0] + fx * 40 * k, q[1] - sg.drop / N * 40 / len * k, q[2] + fz * 40 * k];
            const k0 = j || sg.join ? -1 : 0, k1 = j < N - 1 || (next || {}).join ? 1 : 0;
            hullPts([ex(s0.l, k0), ex(s0.p, k0), ex(s0.r, k0), ex(s1.l, k1), ex(s1.p, k1), ex(s1.r, k1)], solidProps({ color: col, kind: 'ramp', pylons: j % 6 === 3 ? [[s0.p[0], s0.p[2]]] : [] }));
            if (g) for (const k of ['gl', 'gr', 'gp']) hullPts(s0[k].concat(s1[k]), g);
            chords.push({ x: s0.p[0], z: s0.p[2], apex: s0.p[1], fx, fz, rx: -fz, rz: fx, hd: Math.atan2(-fx, -fz), len, W, H });
          }
          L.items.push({ t: 'curve', cx, apex, z0, z1: z0 - R, drop: sg.drop, W, H, dir: d, R, chords });
          lo = Math.min(lo, e - H);
          const E = sect(N).p;
          frame(E[0], E[2], (L.h + d + 4) % 4);
          L.curveIn = true;
          Object.assign(sg, { cx: 0, z1: 0, endApex: e, H });
          x = 0; z = 0; y = e;
        } else if (sg.t === 'surf' || sg.t === 'bank') {
          let [W, H] = { 55: [380, 543], 60: [320, 554], 65: [280, 600] }[sg.face || 60];
          if (sg.t === 'bank') { W *= 1.6; H *= 1.6; } // gorge banks run deep, nearly to the middle
          const fromRamp = prev && RAMPS[prev.t];
          const apex = fromRamp ? prev.endApex - (sg.fall || 500) : y - (sg.fall || 250);
          const z0 = z - (sg.gap || (fromRamp ? 800 : 60));
          let cx = (fromRamp ? prev.cx : x) + (sg.dx || 0);
          if (sg.t === 'bank') cx = (def.center || 0) + sg.side * (def.gorge || 520);
          const z1 = z0 - sg.len, e = apex - sg.drop;
          if (sg.t === 'surf') {
            lprism([[cx - W, apex - H], [cx + W, apex - H], [cx, apex]], z0, [[cx - W, e - H], [cx + W, e - H], [cx, e]], z1, solidProps({ color: col, kind: 'ramp' }));
            if (def.night) {
              const g = neon();
              for (const s of [-1, 1]) {
                const fx = cx + s * (W + 2), gx = cx + s * (W + 14);
                lprism([[fx, apex - H], [gx, apex - H], [gx, apex - H + 12], [fx, apex - H + 12]], z0, [[fx, e - H], [gx, e - H], [gx, e - H + 12], [fx, e - H + 12]], z1, g);
              }
              lprism([[cx - 7, apex - 12], [cx + 7, apex - 12], [cx, apex + 3]], z0, [[cx - 7, e - 12], [cx + 7, e - 12], [cx, e + 3]], z1, g);
            }
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
      }
      function finish() {
      const kill = lo - 600;
      // the whole route's footprint, for the kill volume and the skyline gaps
      const pts = [];
      for (const lg of legs) for (const it of lg.items) {
        if (it.t === 'curve') { for (const c of it.chords) for (const u of [-900, 900]) pts.push([c.x + c.rx * u, c.z + c.rz * u]); continue; }
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
          const q = lg.curveIn ? [lg.at(-700, 500), lg.at(700, 500)] : [];
          for (const it of lg.items) {
            if (it.t === 'curve') {
              // each piece of the bend gets its own clearance, so towers can stand inside the turn
              for (const c of it.chords) { const xs = [c.x - 760, c.x + 760], zs = [c.z - 760, c.z + 760]; corridors.push([xs[0], zs[0], xs[1], zs[1]]); }
              q.push(lg.at(it.cx - 700, it.z0 + 500), lg.at(it.cx + 700, it.z0 + 500));
              continue;
            }
            const xs = it.t === 'ramp' ? [it.cx - 700, it.cx + 700] : [it.x - 700, it.x + 700]; for (const xx of xs) for (const zz of [it.z0 + 500, it.z1 - 500]) q.push(lg.at(xx, zz));
          }
          if (q.length) corridors.push([Math.min(...q.map(p => p[0])), Math.min(...q.map(p => p[1])), Math.max(...q.map(p => p[0])), Math.max(...q.map(p => p[1]))]);
        }
        let seed = def.skyline.seed;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        const hits = (a) => corridors.some(q => a[0] < q[2] + 160 && a[2] > q[0] - 160 && a[1] < q[3] + 160 && a[3] > q[1] - 160);
        // the night city's towers are bigger and further apart
        const step = def.skyline.step || 900, sz = def.skyline.size || 420, spread = def.skyline.size ? sz * 0.95 : 400;
        for (let gx = bx0 - 2500; gx < bx1 + 2500; gx += step) for (let gz = bz0 - 2500; gz < bz1 + 2500; gz += step) {
          const w = sz + rnd() * spread, d = sz + rnd() * spread;
          const ax = gx + rnd() * (step - 60 - w), az = gz + rnd() * (step - 60 - d), a = [ax, az, ax + w, az + d];
          const t = def.skyline.lo + rnd() * (def.skyline.hi - def.skyline.lo), glass = rnd() < 0.3;
          if (!hits(a)) {
            world.addBox([a[0], def.base, a[1]], [a[2], t, a[3]], { color: glass ? COLORS.glass : COLORS.roofSide, kind: 'building', far: true });
            // night: some towers carry a neon band or a rooftop sign
            if (def.night && rnd() < 0.3) {
              const g = { color: NEON[(rnd() * NEON.length) | 0], nonsolid: true, glow: true }, by = t - 60 - rnd() * 400;
              world.addBox([a[0] - 6, by, a[1] - 6], [a[2] + 6, by + 18, a[3] + 6], g);
            }
          }
        }
        // (the night city stands on the ground itself: a street slab just above it would flicker)
        if (!def.night) world.addBox([bx0 - 3000, def.base - 20, bz0 - 3000], [bx1 + 3000, def.base, bz1 + 3000], { color: COLORS.street, kind: 'street' });
      }
      if (def.harbor) harborDetails(legs, def, lo);
      courses[name] = Object.assign({ spawn, stages: cp + 1, legs: legs.map(lg => ({ ox: lg.ox, oz: lg.oz, h: lg.h, items: lg.items, curveIn: !!lg.curveIn })),
        preview: { pos: (() => { const p = legs[0].at(0, 400); return [p[0], top, p[1]]; })(), yaw: legs[0].yaw } },
        { name: def.name, type: def.type, difficulty: def.difficulty, color: def.color, desc: def.desc, route: true, set: def.set });
      }
      return { add, finish, legs, get lo() { return lo; }, get y() { return y; }, get pos() { return L.at(x, z); }, get h() { return L.h; }, get cp() { return cp; }, get prevPad() { return prevPad; }, get leg() { return L; },
        get spawn() { return spawn; } };
    }
    function routeKit(name, ox, oz, top, def) {
      const rk = routeBuilder(name, ox, oz, top, def);
      def.segs.forEach((sg, si) => rk.add(sg, si, def.segs[si + 1]));
      rk.finish();
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
      desc: 'Four block lines over a lava street with widening gaps, one swinging side to side, turning on islands, then speed lanes and a long jump.',
      segs: [
        { t: 'pad', len: 500, w: 500 },
        { t: 'bhop', gap: 44, n: 10, size: 160, step: 240 },
        { t: 'pad', gap: 130, len: 400, w: 400, cp: true }, { t: 'turn', dir: 1 },
        { t: 'bhop', gap: 44, n: 10, size: 150, step: 256, lat: [0, 70, -70, 0, 100, -60] },
        { t: 'pad', gap: 130, len: 400, w: 400, cp: true }, { t: 'turn', dir: -1 },
        { t: 'bhop', gap: 44, n: 10, size: 144, step: 272, sway: { d: 120, time: 1.6 } },
        { t: 'lane', gap: 120, len: 2400, w: 256 },
        { t: 'pad', gap: 400, rise: -300, len: 700, w: 600, cp: true }, { t: 'turn', dir: 1 },
        { t: 'bhop', gap: 44, n: 10, size: 136, step: 288, lat: [0, 90, -90, 60, -60, 0] },
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
      desc: 'Five block lines that climb and fall over the lava street, turning on corner islands, the last one swinging. Steer the corners in the air.',
      segs: [
        { t: 'pad', len: 500, w: 500 },
        { t: 'bhop', gap: 50, n: 7, size: 136, step: 265, dy: 14 },
        { t: 'pad', gap: 130, len: 360, w: 360, cp: true }, { t: 'turn', dir: 1 },
        { t: 'bhop', gap: 74, n: 10, size: 112, step: 280, dy: -10, zig: 100 },
        { t: 'pad', gap: 130, len: 360, w: 360 }, { t: 'turn', dir: -1 },
        { t: 'bhop', gap: 62, n: 8, size: 120, step: 270, dy: 14, lat: [0, 70, -70, 0] },
        { t: 'pad', gap: 130, len: 360, w: 360, cp: true }, { t: 'turn', dir: -1 },
        { t: 'bhop', gap: 74, n: 10, size: 112, step: 300, dy: -15, lat: [0, 90, -90] },
        { t: 'pad', gap: 130, len: 360, w: 360 }, { t: 'turn', dir: 1 },
        { t: 'bhop', gap: 70, n: 12, size: 112, step: 280, zig: 75, sway: { d: 120, time: 1.5, from: 6 } },
        { t: 'pad', gap: 130, len: 500, w: 500, end: true },
      ] });

    // ------------------------------------------------------------ crossover
    // Everything in one long line: slide a roof onto a ramp, surf a transfer,
    // bhop, wallrun a billboard, mantle, then all of it again round two corners.
    routeKit('crossover', 22000, 90000, 9000, {
      name: 'Crossover', type: 'Mixed', difficulty: 5, color: 0x1d2a35, palette: [COLORS.surf[1], COLORS.bhop, COLORS.surf[3], 0xffb340], base: 0,
      skyline: { lo: 1500, hi: 8000, seed: 71 },
      desc: 'All of it, twice, round two corners: slide under a sign and down a roof onto a ramp, surf a transfer, bhop, go wall to wall, then blocks straight onto a wallrun and a climb to the last roof.',
      segs: [
        { t: 'pad', len: 700, w: 900, slot: [300] },
        { t: 'slide', len: 1500, drop: 400, base: 0 },
        { t: 'surf', face: 60, len: 3200, drop: 400 },
        { t: 'surf', face: 65, len: 3200, drop: 400, dx: 550, gap: 1200 },
        { t: 'pad', len: 3000, w: 1400, cp: true }, { t: 'turn', dir: 1 },
        { t: 'bhop', gap: 80, n: 8, size: 128, step: 275, lat: [0, 110, -110, 50, -50] },
        { t: 'pad', gap: 130, len: 800, w: 900 },
        { t: 'w2w', side: 1, n: 2 },
        { t: 'pad', rise: -250, len: 1100, w: 1100, cp: true }, { t: 'turn', dir: -1 },
        { t: 'slide', len: 1500, drop: 400, base: 0 },
        { t: 'surf', face: 60, len: 3400, drop: 450 },
        { t: 'surf', face: 65, len: 3200, drop: 400, dx: -450, gap: 1000 },
        { t: 'pad', len: 3000, w: 1400, cp: true },
        { t: 'bhop', gap: 80, n: 8, size: 120, step: 285, lat: [0, 100, -100, 100, -100, -80, -165, -250] },
        { t: 'wall', side: -1, len: 700, gap: 550 },
        { t: 'pad', rise: 120, len: 600, w: 900, lip: true },
        { t: 'pad', rise: 180, climb: true, len: 900, w: 900, end: true },
      ] });

    // ------------------------------------------------------------ night city
    // Six levels across a city at night, each harder than the last: rooftop
    // pads, block lines, slides and wallruns, and surf ramps that bend round
    // corners between the towers. Neon trims every edge you can stand on.
    const NIGHT = { night: true, set: 'night', base: -4000, neon: [0xff2bd6, 0x18e7ff, 0x9b4dff, 0xff8a1f, 0x3dff9e], padColor: 0x353b48 };
    const NRAMP = [0x7b3cf0, 0x1d9be0, 0xe0329b, 0x22c79a], NBLOCK = [0xff2bd6, 0x18c8ff, 0xffa31f, 0x9b4dff];
    const night = (name, ox, oz, top, def) => routeKit(name, ox, oz, top, Object.assign({}, NIGHT, def));
    night('n1', 200000, 30000, 7000, {
      name: 'Neon Mile', type: 'Mixed', difficulty: 2, color: 0xff2bd6, palette: [NBLOCK[0], NRAMP[1], NRAMP[0], NBLOCK[1]],
      skyline: { lo: 0, hi: 9000, seed: 101, step: 1400, size: 640 },
      desc: 'Night City 1. Hop a block line, drop onto a ramp, ride a ramp that bends right round a tower to a lit roof, vault its barriers and hop to the end.',
      segs: [
        { t: 'pad', len: 600 },
        { t: 'bhop', gap: 50, n: 7, size: 176, step: 250 },
        { t: 'pad', gap: 120, len: 600, w: 700 },
        { t: 'surf', face: 55, len: 3000, drop: 400 },
        { t: 'curve', dir: 1, face: 55, R: 4200, drop: 700, fall: 700, gap: 900 },
        { t: 'pad', len: 3000, w: 1400, cp: true, vault: [900, 1500] },
        { t: 'bhop', gap: 60, n: 7, size: 160, step: 255, lat: [0, 50, -50] },
        { t: 'pad', gap: 120, len: 600, end: true },
      ] });

    night('n2', 245000, 30000, 7500, {
      name: 'Afterhours', type: 'Mixed', difficulty: 3, color: 0x18c8ff, palette: [NRAMP[1], NRAMP[0], NBLOCK[1], NRAMP[2]],
      skyline: { lo: 0, hi: 9500, seed: 113, step: 1400, size: 640 },
      desc: 'Night City 2. Slide a roof into a ramp that bends left, transfer across, hop blocks, wallrun a billboard straight onto more blocks, then climb to the finish.',
      segs: [
        { t: 'pad', len: 700, w: 900 },
        { t: 'slide', len: 1500, drop: 400, base: -4000 },
        { t: 'curve', dir: -1, face: 60, R: 3800, drop: 600 },
        { t: 'surf', face: 60, len: 3200, drop: 400, dx: -350, gap: 900, fall: 600 },
        { t: 'pad', len: 3000, w: 1400, cp: true }, { t: 'turn', dir: 1 },
        { t: 'bhop', gap: 56, n: 9, size: 144, step: 265, lat: [0, 70, -70, 0] },
        { t: 'pad', gap: 130, len: 800, w: 900 },
        { t: 'wall', side: 1, len: 700, gap: 450 },
        { t: 'bhop', gap: 60, n: 6, size: 136, step: 275, first: 200, lat: [0, 50, -50] },
        { t: 'pad', gap: 120, len: 600, w: 800 },
        { t: 'pad', rise: 180, climb: true, len: 800, w: 900, end: true },
      ] });
    night('n3', 290000, 30000, 8000, {
      name: 'Overpass', type: 'Mixed', difficulty: 3, color: 0x9b4dff, palette: [NBLOCK[3], NRAMP[0], NRAMP[3], NBLOCK[0]],
      skyline: { lo: 0, hi: 10000, seed: 127, step: 1400, size: 640 },
      desc: 'Night City 3. Two bends that turn opposite ways, with a jump across between them, a slide under a sign, then blocks that lead you straight onto a wallrun.',
      segs: [
        { t: 'pad', len: 600 },
        { t: 'bhop', gap: 64, n: 8, size: 150, step: 260, zig: 60 },
        { t: 'pad', gap: 120, len: 600, w: 700 },
        { t: 'curve', dir: 1, face: 60, R: 3600, drop: 600 },
        { t: 'curve', dir: -1, face: 60, R: 3600, drop: 600, gap: 900, fall: 700, dx: 400 },
        { t: 'pad', len: 3000, w: 1400, cp: true, slot: [1600] },
        { t: 'bhop', gap: 62, n: 9, size: 136, step: 270, lat: [0, 60, -60, 60, -60, 0, -80, -165, -250] },
        { t: 'wall', side: -1, len: 700, gap: 550 },
        { t: 'pad', rise: 120, len: 900, w: 900, lip: true, end: true },
      ] });
    night('n4', 200000, -30000, 9000, {
      name: 'Blackout', type: 'Mixed', difficulty: 4, color: 0xffa31f, palette: [NRAMP[2], NRAMP[1], NBLOCK[2], NRAMP[0]],
      skyline: { lo: 0, hi: 11000, seed: 131, step: 1400, size: 640 },
      desc: 'Night City 4. A hairpin: two bends joined into one half turn, a transfer off its end, a shutter to time, a climbing block line, then slide into a last bend.',
      segs: [
        { t: 'pad', len: 600 },
        { t: 'surf', face: 60, len: 3000, drop: 450 },
        { t: 'curve', dir: -1, face: 60, R: 3000, drop: 450, gap: 900, fall: 700, dx: 300 },
        { t: 'curve', dir: -1, face: 60, R: 3000, drop: 450, join: true },
        { t: 'surf', face: 65, len: 3000, drop: 400, dx: -400, gap: 900, fall: 600 },
        { t: 'pad', len: 3000, w: 1400, cp: true, gate: [{ at: 2100, time: 1.2 }] },
        { t: 'bhop', gap: 70, n: 10, size: 120, step: 280, dy: 6, zig: 90 },
        { t: 'pad', gap: 130, len: 700, w: 800 },
        { t: 'slide', len: 1500, drop: 400, base: -4000 },
        { t: 'curve', dir: 1, face: 65, R: 3600, drop: 700 },
        { t: 'pad', len: 3000, w: 1400, end: true },
      ] });
    night('n5', 245000, -30000, 10000, {
      name: 'Signal', type: 'Mixed', difficulty: 5, color: 0x3dff9e, palette: [NRAMP[3], NBLOCK[0], NRAMP[1], NBLOCK[3]],
      skyline: { lo: 0, hi: 12000, seed: 149, step: 1400, size: 640 },
      desc: 'Night City 5. Small zigzag blocks straight into a hairpin, falling blocks, wall to wall over an alley, then a slide into two bends that turn opposite ways.',
      segs: [
        { t: 'pad', len: 600 },
        { t: 'bhop', gap: 80, n: 11, size: 112, step: 285, zig: 100 },
        { t: 'pad', gap: 120, len: 500, w: 600 },
        { t: 'curve', dir: 1, face: 65, R: 3200, drop: 500 },
        { t: 'curve', dir: 1, face: 65, R: 3200, drop: 500, join: true },
        { t: 'surf', face: 65, len: 3000, drop: 450, dx: 420, gap: 900, fall: 600 },
        { t: 'pad', len: 3000, w: 1400, cp: true },
        { t: 'bhop', gap: 68, n: 9, size: 112, step: 290, dy: 15, lat: [0, 80, -80, 40, -40] },
        { t: 'pad', gap: 130, len: 800, w: 900 },
        { t: 'w2w', side: 1, n: 2 },
        { t: 'pad', rise: -300, len: 1100, w: 1100 },
        { t: 'slide', len: 1500, drop: 400, base: -4000 },
        { t: 'curve', dir: -1, face: 60, R: 3400, drop: 600 },
        { t: 'curve', dir: 1, face: 65, R: 3400, drop: 600, gap: 900, fall: 700, dx: -400 },
        { t: 'pad', len: 3000, w: 1400, end: true },
      ] });
    night('n6', 320000, -30000, 11000, {
      name: 'Skyline', type: 'Mixed', difficulty: 6, color: 0xff3b5c, palette: [NBLOCK[0], NRAMP[0], NRAMP[2], NBLOCK[1]],
      skyline: { lo: 0, hi: 13000, seed: 163, step: 1400, size: 640 },
      desc: 'Night City 6. A run built on walls: blocks that throw you onto a billboard and off it onto more blocks, a hairpin into an opposite bend, wall to wall down three billboards, then kick off a wall onto a ramp and a last bend. One checkpoint.',
      segs: [
        { t: 'pad', len: 600 },
        { t: 'bhop', gap: 74, n: 12, size: 104, step: 295, lat: [0, 100, -100, 50, -50, 0, 100, -100, 50, 85, 170, 250] },
        { t: 'wall', side: 1, len: 700, gap: 450 },
        { t: 'bhop', gap: 74, n: 6, size: 112, step: 290, first: 200, lat: [150, 60, -60, 0, 60, -60] },
        { t: 'pad', gap: 120, len: 500, w: 600 },
        { t: 'slide', len: 1500, drop: 400, base: -4000 },
        { t: 'curve', dir: -1, face: 65, R: 3000, drop: 500 },
        { t: 'curve', dir: -1, face: 65, R: 3000, drop: 500, join: true },
        { t: 'curve', dir: 1, face: 65, R: 3000, drop: 500, gap: 900, fall: 700, dx: -400 },
        { t: 'pad', len: 3000, w: 1400, cp: true },
        { t: 'bhop', gap: 74, n: 14, size: 96, step: 300, zig: 105 },
        { t: 'pad', gap: 130, len: 800, w: 900 },
        { t: 'w2w', side: -1, n: 3 },
        { t: 'pad', rise: -300, len: 900, w: 900 },
        { t: 'wall', side: 1, len: 700, gap: 550 },
        { t: 'surf', face: 65, len: 2600, drop: 800, fall: 300, gap: 100 },
        { t: 'curve', dir: 1, face: 65, R: 3400, drop: 600, gap: 900, fall: 700, dx: -300 },
        { t: 'curve', dir: 1, face: 65, R: 3400, drop: 600, join: true },
        { t: 'surf', face: 65, len: 3000, drop: -200, dx: 450, gap: 900, fall: 500 },
        { t: 'pad', len: 3000, w: 1400, end: true },
      ] });

    // ------------------------------------------------------------ harbor
    // Six hard levels over a container port at dusk, each harder than the
    // last. The route is the same kit, dressed for the docks: railings and
    // hazard posts on every pad, lamps on every ramp ridge, gantry cranes
    // and container stacks round the route and a lighthouse on the breakwater.
    // All of the dressing is visual only (deco: drawn, never collided with).
    const DECO = (color, kind, extra) => Object.assign({ color, kind: kind || 'crane', nonsolid: true, deco: true }, extra);
    const CONTAINERS = [0xc0392b, 0x2471a3, 0x1e8449, 0xd68910, 0x7d3c98, 0xa04000, 0x5d6d7e, 0x117a65];
    function harborDetails(legs, def, lo) {
      let sd = def.skyline.seed * 7 + 3;
      const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      const steel = 0x2b3038, rail = 0xe8b923;
      for (const lg of legs) {
        const W3 = (x, y, z) => { const p = lg.at(x, z); return [p[0], y, p[1]]; };
        const dbox = (x0, x1, y0, y1, z0, z1, props) => {
          const a = lg.at(x0, z0), b = lg.at(x1, z1);
          world.addBox([Math.min(a[0], b[0]), y0, Math.min(a[1], b[1])], [Math.max(a[0], b[0]), y1, Math.max(a[1], b[1])], props);
        };
        for (const it of lg.items) {
          if ((it.t === 'pad' || it.t === 'lane') && !it.corner) {
            // a railing down both long sides (posts and a top rail) and a dark kerb
            const len = it.z0 - it.z1;
            for (const sx of [-1, 1]) {
              const ex = it.x + sx * (it.w / 2 + 14);
              dbox(ex - 6, ex + 6, it.y - 60, it.y + 4, it.z1, it.z0, DECO(steel, 'wall'));
              if (it.t === 'lane' || len < 500) continue;
              const n = Math.max(2, Math.round(len / 320));
              for (let k = 0; k <= n; k++) { const zz = it.z0 - 30 - (len - 60) * k / n; dbox(ex - 4, ex + 4, it.y, it.y + 96, zz - 4, zz + 4, DECO(steel)); }
              dbox(ex - 5, ex + 5, it.y + 92, it.y + 104, it.z1 + 26, it.z0 - 26, DECO(rail, 'block'));
            }
            // hazard bollards at the front corners
            for (const sx of [-1, 1]) { const ex = it.x + sx * (it.w / 2 - 24); dbox(ex - 7, ex + 7, it.y, it.y + 34, it.z1 + 17, it.z1 + 31, DECO(rail, 'block')); }
          } else if (it.t === 'ramp' && !it.bank) {
            // a warm lamp at each end of the ridge
            for (const [zz, yy] of [[it.z0, it.apex], [it.z1, it.apex - it.drop]]) {
              const p = W3(it.cx, yy, zz);
              world.addBox([p[0] - 9, yy + 2, p[2] - 9], [p[0] + 9, yy + 20, p[2] + 9], { color: 0xffb347, nonsolid: true, glow: true });
            }
          } else if (it.t === 'block' && !it.sway) {
            // a thin dark kerb under each block, so the line reads against the water
            dbox(it.x - it.w / 2 - 6, it.x + it.w / 2 + 6, it.y - 70, it.y - 58, it.z1 - 6, it.z0 + 6, DECO(steel, 'wall'));
          }
        }
        // a gantry crane beside the first big pad of the leg, its boom over the route
        const big = lg.items.find(it => it.t === 'pad' && it.w >= 900 && !it.corner);
        if (big) {
          const side = rnd() < 0.5 ? -1 : 1, lx = big.x + side * (big.w / 2 + 900), zc = (big.z0 + big.z1) / 2, base = def.base;
          const top = big.y + 1700, col = [0xd35400, 0xc0392b, 0xf1c40f][(rnd() * 3) | 0];
          for (const dz of [-500, 500]) for (const dx of [-260, 260]) dbox(lx + dx - 40, lx + dx + 40, base, top, zc + dz - 40, zc + dz + 40, DECO(col));
          for (const dz of [-500, 500]) dbox(lx - 300, lx + 300, top - 80, top, zc + dz - 50, zc + dz + 50, DECO(col));
          dbox(lx - 300, lx + 300, top - 260, top - 200, zc - 500, zc + 500, DECO(col));
          // the boom reaches out over the route and back behind the crane
          const b0 = Math.min(lx - side * 2600, lx + side * 1600), b1 = Math.max(lx - side * 2600, lx + side * 1600);
          dbox(b0, b1, top, top + 120, zc - 70, zc + 70, DECO(col));
          dbox(lx - 90, lx + 90, top + 120, top + 520, zc - 90, zc + 90, DECO(col));
          // a cab and a hanging spreader with a container
          const cx = lx - side * 1500;
          dbox(cx - 110, cx + 110, top - 160, top, zc - 110, zc + 110, DECO(0x1c2833));
          dbox(cx - 8, cx + 8, top - 500, top - 160, zc - 8, zc + 8, DECO(steel));
          dbox(cx - 130, cx + 130, top - 760, top - 500, zc - 300, zc + 300, DECO(CONTAINERS[(rnd() * CONTAINERS.length) | 0], 'building'));
        }
      }
      // the breakwater lighthouse, out past the start
      if (def.lighthouse) {
        const lg = legs[0], [lx, lz] = def.lighthouse, p = lg.at(lx, lz), base = def.base;
        world.addBox([p[0] - 260, base, p[1] - 260], [p[0] + 260, base + 600, p[1] + 260], DECO(0x6e6259, 'cliff'));
        for (let k = 0; k < 6; k++) {
          const r = 200 - k * 18, y0 = base + 600 + k * 520;
          world.addBox([p[0] - r, y0, p[1] - r], [p[0] + r, y0 + 520, p[1] + r], DECO(k % 2 ? 0xc0392b : 0xf4f1ea, 'building'));
        }
        const yt = base + 600 + 6 * 520;
        world.addBox([p[0] - 120, yt, p[1] - 120], [p[0] + 120, yt + 200, p[1] + 120], { color: 0xfff1b8, nonsolid: true, glow: true });
        world.addBox([p[0] - 150, yt + 200, p[1] - 150], [p[0] + 150, yt + 260, p[1] + 150], DECO(0x1c2833));
      }
    }
    const HARBOR = { harbor: true, set: 'harbor', base: 0, pool: 'water', padColor: 0x5b6470 };
    const HRAMP = [0x1f8fb3, 0x2bb39a, 0x3b6fd1, 0x17a589], HBLOCK = [0xe67e22, 0xc0392b, 0xf1c40f, 0x8e44ad];
    const harbor = (name, ox, oz, top, def) => routeKit(name, ox, oz, top, Object.assign({}, HARBOR, def,
      { skyline: Object.assign({ lo: 0, hi: top + 2500, step: 1300, size: 560 }, def.skyline) }));
    harbor('h1', 200000, -100000, 9000, {
      name: 'Dockside', type: 'Mixed', difficulty: 5, color: 0xe67e22, palette: [HBLOCK[0], HRAMP[0], HRAMP[1], HBLOCK[1]],
      skyline: { seed: 211 }, lighthouse: [-2600, 1800],
      desc: 'Harbor 2. Zigzag blocks off the quay, two narrow ramps with a wide transfer, a bend round the cranes, vault the crates, climbing blocks, a wallrun and a climb to the finish.',
      segs: [
        { t: 'pad', len: 600, w: 700 },
        { t: 'bhop', gap: 76, n: 10, size: 112, step: 285, zig: 85 },
        { t: 'pad', gap: 120, len: 600, w: 700 },
        { t: 'surf', face: 65, len: 3000, drop: 450 },
        { t: 'surf', face: 65, len: 3000, drop: 450, dx: 470, gap: 1000 },
        { t: 'pad', len: 3000, w: 1400, cp: true }, { t: 'turn', dir: 1 },
        { t: 'curve', dir: -1, face: 65, R: 3200, drop: 550 },
        { t: 'surf', face: 65, len: 3000, drop: 450, dx: -480, gap: 1000, fall: 600 },
        { t: 'pad', len: 3000, w: 1400, cp: true, vault: [1000, 1500, 2000] },
        { t: 'bhop', gap: 72, n: 10, size: 104, step: 290, dy: 12, lat: [0, 90, -90, 40, -40] },
        { t: 'pad', gap: 130, len: 800, w: 900 },
        { t: 'wall', side: 1, len: 700, gap: 550 },
        { t: 'pad', rise: 120, len: 600, w: 900, lip: true },
        { t: 'pad', rise: 180, climb: true, len: 900, w: 900, end: true },
      ] });
    harbor('h2', 260000, -100000, 10000, {
      name: 'Gantry', type: 'Mixed', difficulty: 5, color: 0xc0392b, palette: [HRAMP[2], HBLOCK[1], HRAMP[0], HBLOCK[2]],
      skyline: { seed: 223 },
      desc: 'Harbor 1. Slide a roof into a hairpin, transfer off its end, time the dock gate, hop small blocks to a speed lane, long jump, then a falling line and wall to wall down an alley.',
      segs: [
        { t: 'pad', len: 700, w: 900 },
        { t: 'slide', len: 1500, drop: 400, base: 0 },
        { t: 'curve', dir: 1, face: 65, R: 3000, drop: 500 },
        { t: 'curve', dir: 1, face: 65, R: 3000, drop: 500, join: true },
        { t: 'surf', face: 65, len: 3000, drop: 450, dx: 520, gap: 1100, fall: 600 },
        { t: 'pad', len: 3000, w: 1400, cp: true, gate: [{ at: 2100, time: 1.1 }] },
        { t: 'bhop', gap: 82, n: 11, size: 104, step: 295, zig: 100 },
        { t: 'lane', gap: 120, len: 2400, w: 224 },
        { t: 'pad', gap: 420, rise: -300, len: 700, w: 600, cp: true }, { t: 'turn', dir: -1 },
        { t: 'bhop', gap: 82, n: 10, size: 104, step: 300, dy: -14, lat: [0, 100, -100, 60, -60] },
        { t: 'pad', gap: 130, len: 800, w: 900 },
        { t: 'w2w', side: -1, n: 2 },
        { t: 'pad', rise: -250, len: 900, w: 900, end: true },
      ] });
    harbor('h3', 320000, -100000, 13000, {
      name: 'Breakwater', type: 'Surf', difficulty: 6, color: 0x2bb39a, palette: [HRAMP[1], HRAMP[3], HRAMP[0], HRAMP[2]], gorge: 520,
      skyline: { seed: 227 },
      desc: 'Harbor 3. A cut through the breakwater: five steep banks that swap sides with long gaps, then blocks that swing with the tide, a slide and two opposite bends.',
      segs: [
        { t: 'pad', len: 600 },
        { t: 'bank', side: -1, face: 65, len: 3400, drop: 400 },
        { t: 'bank', side: 1, face: 65, len: 3200, drop: 400, gap: 1000 },
        { t: 'bank', side: -1, face: 65, len: 3200, drop: 400, gap: 1000 },
        { t: 'bank', side: 1, face: 65, len: 3200, drop: 400, gap: 1050 },
        { t: 'bank', side: -1, face: 65, len: 3000, drop: 400, gap: 1050 },
        { t: 'pad', len: 4200, w: 1400, cp: true, x: 0 },
        { t: 'bhop', gap: 84, n: 10, size: 100, step: 300, zig: 70, sway: { d: 140, time: 1.5 } },
        { t: 'pad', gap: 130, len: 800, w: 800 }, { t: 'turn', dir: 1 },
        { t: 'slide', len: 1500, drop: 400, base: 0 },
        { t: 'curve', dir: 1, face: 65, R: 3200, drop: 550 },
        { t: 'curve', dir: -1, face: 65, R: 3200, drop: 550, gap: 900, fall: 700, dx: 400 },
        { t: 'pad', len: 3000, w: 1400, end: true },
      ] });
    harbor('h4', 200000, -160000, 12000, {
      name: 'Tideline', type: 'Surf', difficulty: 6, color: 0x3b6fd1, palette: [HRAMP[2], HRAMP[0], HRAMP[3], HRAMP[1]],
      skyline: { seed: 229 },
      desc: 'Harbor 4. Surf with nowhere to rest: four narrow ramps with wide transfers both ways, a hairpin and a climbing ramp, then the smallest blocks.',
      segs: [
        { t: 'pad', len: 600 },
        { t: 'surf', face: 60, len: 3000, drop: 450 },
        { t: 'surf', face: 60, len: 3000, drop: 450, dx: 440, gap: 1000 },
        { t: 'surf', face: 65, len: 3000, drop: 450, dx: -510, gap: 1050 },
        { t: 'surf', face: 65, len: 2800, drop: 450, dx: 520, gap: 1100 },
        { t: 'pad', len: 3000, w: 1400, cp: true }, { t: 'turn', dir: -1 },
        { t: 'curve', dir: -1, face: 65, R: 3000, drop: 500 },
        { t: 'curve', dir: -1, face: 65, R: 3000, drop: 500, join: true },
        { t: 'surf', face: 65, len: 3000, drop: -200, dx: -450, gap: 900, fall: 500 },
        { t: 'pad', len: 3000, w: 1400, cp: true },
        { t: 'bhop', gap: 78, n: 13, size: 96, step: 300, zig: 105 },
        { t: 'pad', gap: 130, len: 600, w: 700, end: true },
      ] });
    harbor('h5', 260000, -160000, 11000, {
      name: 'Lighthouse', type: 'Bhop', difficulty: 7, color: 0xf1c40f, palette: [HBLOCK[2], HBLOCK[0], HBLOCK[3], HBLOCK[1]],
      skyline: { seed: 233 }, lighthouse: [2400, -2400],
      desc: 'Harbor 5. Climb to the light: rising lines of the smallest blocks round three corners, a wallrun into a climb, wall to wall down the tower, then one ramp down.',
      segs: [
        { t: 'pad', len: 500, w: 500 },
        { t: 'bhop', gap: 74, n: 10, size: 104, step: 290, dy: 16, zig: 90 },
        { t: 'pad', gap: 130, len: 400, w: 400 }, { t: 'turn', dir: 1 },
        { t: 'bhop', gap: 78, n: 10, size: 96, step: 300, dy: 14, lat: [0, 100, -100, 50, -50] },
        { t: 'pad', gap: 130, len: 800, w: 900, cp: true },
        { t: 'wall', side: 1, len: 700, gap: 550 },
        { t: 'pad', rise: 120, len: 500, w: 700, lip: true },
        { t: 'pad', rise: 180, climb: true, len: 600, w: 700 }, { t: 'turn', dir: -1 },
        { t: 'bhop', gap: 76, n: 11, size: 96, step: 300, dy: 15, zig: 95 },
        { t: 'pad', gap: 130, len: 400, w: 400 }, { t: 'turn', dir: -1 },
        { t: 'bhop', gap: 80, n: 10, size: 96, step: 300, dy: 12, lat: [0, 110, -110, 60, -60] },
        { t: 'pad', gap: 130, len: 800, w: 900 },
        { t: 'w2w', side: -1, n: 3 },
        { t: 'pad', rise: -300, len: 900, w: 900 },
        { t: 'surf', face: 65, len: 3000, drop: 900 },
        { t: 'pad', len: 1400, w: 1200, end: true },
      ] });
    harbor('h6', 320000, -160000, 13000, {
      name: 'Riptide', type: 'Mixed', difficulty: 7, color: 0x8e44ad, palette: [HBLOCK[3], HRAMP[0], HBLOCK[1], HRAMP[2]],
      skyline: { seed: 239 },
      desc: 'Harbor 6. The hardest run in the game, and the tide moves it: swinging blocks into a hairpin, wide transfers, two lock gates, more swinging blocks, a wallrun onto a block line, then a bend and a last climbing ramp. One checkpoint.',
      segs: [
        { t: 'pad', len: 600 },
        { t: 'bhop', gap: 86, n: 12, size: 104, step: 305, sway: { d: 180, time: 1.3 } },
        { t: 'pad', gap: 120, len: 500, w: 600 },
        { t: 'slide', len: 1500, drop: 400, base: 0 },
        { t: 'curve', dir: 1, face: 65, R: 3000, drop: 500 },
        { t: 'curve', dir: 1, face: 65, R: 3000, drop: 500, join: true },
        { t: 'surf', face: 65, len: 3000, drop: 450, dx: 540, gap: 1150, fall: 600 },
        { t: 'surf', face: 65, len: 3000, drop: 450, dx: -560, gap: 1150 },
        { t: 'pad', len: 3000, w: 1400, cp: true, gate: [{ at: 1100, time: 1.0 }, { at: 2100, time: 1.3 }] },
        { t: 'bhop', gap: 86, n: 12, size: 96, step: 310, lat: [0, 70, -70, 40, -40], sway: { d: 160, time: 1.3 } },
        { t: 'pad', gap: 130, len: 800, w: 900 },
        { t: 'wall', side: 1, len: 700, gap: 450 },
        { t: 'bhop', gap: 86, n: 6, size: 112, step: 300, first: 200, lat: [0, 60, -60] },
        { t: 'pad', gap: 120, len: 1100, w: 1100 }, { t: 'turn', dir: -1 },
        { t: 'surf', face: 65, len: 2600, drop: 800 },
        { t: 'curve', dir: -1, face: 65, R: 3200, drop: 600, gap: 950, fall: 700, dx: 400 },
        { t: 'surf', face: 65, len: 3000, drop: -250, dx: -480, gap: 950, fall: 500 },
        { t: 'pad', len: 3000, w: 1400, end: true },
      ] });

    // ------------------------------------------------------------ skyline: the zipline set
    // Four daytime levels high over the city where ziplines carry you between
    // the hard parts: jump off a roof's edge, grab the cable, ride it down.
    const SKY = { set: 'skyline', base: 0, padColor: 0x8d99a6 };
    const SPAL = [0x2f7de1, 0xff6b3d, 0x22b38a, 0xf2b705];
    const skyline = (name, ox, oz, top, def) => routeKit(name, ox, oz, top, Object.assign({}, SKY, def,
      { skyline: Object.assign({ lo: 1500, hi: top - 1500, step: 1100, size: 480 }, def.skyline) }));
    skyline('s1', 200000, -240000, 9000, {
      name: 'Wireline', type: 'Parkour', difficulty: 3, color: SPAL[0], palette: [SPAL[0], SPAL[1], SPAL[2], SPAL[3]],
      skyline: { seed: 307 },
      desc: 'Cableway 1. Learn the moves: ride a cable, vault the rails, hop blocks, slide under a sign, climb a wall to the next cable and wallrun a gap.',
      segs: [
        { t: 'pad', len: 900, w: 800 },
        { t: 'zip', len: 2400, drop: 700 },
        { t: 'pad', len: 1800, w: 900, cp: true, vault: [500, 1000] },
        { t: 'bhop', gap: 70, n: 8, size: 128, step: 280 },
        { t: 'pad', gap: 120, len: 900, w: 900, slot: [400] },
        { t: 'pad', rise: 180, climb: true, len: 700, w: 900 },
        { t: 'zip', len: 3000, drop: 900 },
        { t: 'pad', len: 1800, w: 900, cp: true }, { t: 'turn', dir: 1 },
        { t: 'wall', side: 1, len: 700, gap: 550 },
        { t: 'pad', rise: 120, len: 900, w: 900, lip: true },
        { t: 'zip', len: 2400, drop: 700 },
        { t: 'pad', len: 2000, w: 1000, end: true },
      ] });

    skyline('s2', 260000, -240000, 11000, {
      name: 'Cable Car', type: 'Mixed', difficulty: 4, color: SPAL[1], palette: [SPAL[1], SPAL[0], SPAL[3], SPAL[2]],
      skyline: { seed: 311 },
      desc: 'Cableway 2. Ride off the end of a cable straight onto a surf ramp, transfer, hop blocks to a long cable down, then time a gate and go wall to wall to the finish.',
      segs: [
        { t: 'pad', len: 900, w: 800 },
        { t: 'zip', len: 2600, drop: 800 },
        { t: 'surf', face: 60, len: 3200, drop: 400, dx: 160, fall: 300, gap: 200 },
        { t: 'surf', face: 60, len: 3200, drop: 400, dx: -420, gap: 1000 },
        { t: 'pad', len: 3000, w: 1400, cp: true },
        { t: 'bhop', gap: 76, n: 9, size: 120, step: 285, zig: 80 },
        { t: 'pad', gap: 120, len: 900, w: 900 }, { t: 'turn', dir: -1 },
        { t: 'zip', len: 3600, drop: 1200 },
        { t: 'pad', len: 2000, w: 1000, cp: true, gate: [{ at: 900, time: 1.1 }] },
        { t: 'w2w', side: -1, n: 2 },
        { t: 'pad', rise: -250, len: 900, w: 900, end: true },
      ] });
    skyline('s3', 320000, -240000, 13000, {
      name: 'Highwire', type: 'Mixed', difficulty: 5, color: SPAL[2], palette: [SPAL[2], SPAL[3], SPAL[0], SPAL[1]],
      skyline: { seed: 313 },
      desc: 'Cableway 3. Cable to cable with only a short roof between, a bend off the end of a ride, tight blocks, then wallrun off the end of a billboard straight onto the last cable.',
      segs: [
        { t: 'pad', len: 800, w: 800 },
        { t: 'zip', len: 2400, drop: 700 },
        { t: 'pad', len: 1300, w: 800 },
        { t: 'zip', len: 2800, drop: 900, dx: 200 },
        { t: 'pad', len: 1800, w: 900, cp: true }, { t: 'turn', dir: 1 },
        { t: 'bhop', gap: 84, n: 10, size: 100, step: 300, zig: 100 },
        { t: 'pad', gap: 120, len: 900, w: 900 },
        { t: 'zip', len: 3000, drop: 1000 },
        { t: 'curve', dir: -1, face: 60, R: 3200, drop: 500, dx: 330, fall: 300, gap: 200 },
        { t: 'pad', len: 3000, w: 1400, cp: true },
        { t: 'wall', side: 1, len: 500, gap: 450, kick: 9 },
        { t: 'zip', len: 2800, drop: 900, sx: 280, dx: -280, hang: 120 },
        { t: 'pad', len: 2000, w: 1000, end: true },
      ] });
    skyline('s4', 380000, -240000, 15000, {
      name: 'Long Haul', type: 'Mixed', difficulty: 6, color: SPAL[3], palette: [SPAL[3], SPAL[1], SPAL[2], SPAL[0]],
      skyline: { seed: 317 },
      desc: 'Cableway 4. Eight cables and only three roofs: drop from cable to cable in mid air, ride off one onto two narrow ramps, then wallrun off the end of a billboard onto the last two.',
      segs: [
        { t: 'pad', len: 800, w: 700 },
        { t: 'zip', len: 4400, drop: 1600 },
        { t: 'zip', len: 2600, drop: 800, fall: 300, gap: 500 },
        { t: 'surf', face: 65, len: 3000, drop: 450, dx: -140, fall: 300, gap: 200 },
        { t: 'surf', face: 65, len: 3000, drop: 450, dx: 500, gap: 1100 },
        { t: 'pad', len: 3000, w: 1400, cp: true },
        { t: 'bhop', gap: 84, n: 11, size: 100, step: 300, zig: 100 },
        { t: 'pad', gap: 120, len: 900, w: 900 }, { t: 'turn', dir: -1 },
        { t: 'zip', len: 2600, drop: 800 },
        { t: 'zip', len: 2600, drop: 800, fall: 300, gap: 500 },
        { t: 'zip', len: 2600, drop: 800, fall: 300, gap: 550 },
        { t: 'pad', len: 1800, w: 900, cp: true }, { t: 'turn', dir: 1 },
        { t: 'bhop', gap: 84, n: 10, size: 96, step: 305, lat: [0, 90, -90, 50, -50] },
        { t: 'pad', gap: 130, len: 800, w: 900 },
        { t: 'wall', side: -1, len: 500, gap: 450, kick: 9 },
        { t: 'zip', len: 2600, drop: 800, sx: -280, dx: 280, hang: 120 },
        { t: 'zip', len: 2600, drop: 800, fall: 300, gap: 550 },
        { t: 'pad', len: 1800, w: 900, end: true },
      ] });

    // ------------------------------------------------------------ terminal (gauntlet 6)
    // The Gauntlet's finale on the route kit: the same blocks and ramps, with
    // departure gates on the pads between them that open and shut on a clock.
    routeKit('g6', 151000, 0, 10000, {
      name: 'Terminal', type: 'Mixed', difficulty: 6, color: 0x15191d, palette: [0x15191d, 0xdb2f2a, 0x8f55e0, 0xf08a24], set: 'gauntlet', base: 2000, pool: 'lava',
      desc: 'Gauntlet 6. The longest and hardest: the smallest blocks, steep ramps, transfers both ways, and departure gates on every pad that open and shut on a clock. Arrive as they open. One checkpoint.',
      segs: [
        { t: 'pad', len: 600 },
        { t: 'bhop', gap: 74, n: 12, size: 104, step: 295, lat: [0, 80, -80, 40, -40] },
        { t: 'surf', face: 65, len: 3200, drop: 600 },
        { t: 'surf', face: 65, len: 3000, drop: 450, dx: 500 },
        { t: 'surf', face: 60, len: 3000, drop: -200, dx: -500 },
        { t: 'pad', len: 3000, w: 1400, gate: [{ at: 1500, time: 1.0 }] },
        { t: 'bhop', gap: 74, n: 14, size: 96, step: 300, zig: 85, drift: 30 },
        { t: 'surf', face: 65, len: 3000, drop: 500 },
        { t: 'surf', face: 65, len: 3000, drop: 500, dx: 480 },
        { t: 'pad', len: 3000, w: 1400, cp: true, gate: [{ at: 1000, time: 0.9 }, { at: 2000, time: 1.2 }] },
        { t: 'bhop', gap: 74, n: 12, size: 96, step: 310, dy: 15, zig: 95 },
        { t: 'surf', face: 65, len: 2600, drop: 900 },
        { t: 'pad', len: 3000, w: 1400, end: true },
      ] });

    // ------------------------------------------------------------ endless
    // A course with no end, built a section at a time ahead of the runner
    // (and taken down behind) from a seed, so everyone who gets the day's
    // seed runs the same course. A section is a few pieces from the route
    // levels (block lines, surf runs, cables, wallruns, bends), each ending on
    // a pad, and the last pad is its gate (a checkpoint). Sections get harder
    // as you go. When the course has dropped too far, updraft pads throw you
    // back up, and turns steer it round a centre so it never wanders off.
    const ENDLESS = { x: 0, z: 300000, top: 20000, low: 13000, roam: 40000 };
    const EPAL = [0x2fb5c7, 0xf08a24, 0x8f55e0, 0xe0457b, 0x22b38a, 0x4f74ee];
    function endless(seed) {
      let s = (seed >>> 0) || 1;
      const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const pick = (a) => a[(rnd() * a.length) | 0];
      const range = (a, b) => a + rnd() * (b - a);
      const sign = () => rnd() < 0.5 ? -1 : 1;
      const rk = routeBuilder('endless', ENDLESS.x, ENDLESS.z, ENDLESS.top, { palette: EPAL, padColor: 0xc9d2da });
      let si = 0, k = 0;
      let segs = [];
      const add = (sg) => { segs.push(sg); rk.add(sg, si++); };
      // tiers 0 (gentle) to 5 (Harbor hard), by section
      const tierOf = (n) => Math.min(5, Math.floor(n / 3));
      const lerp = (t, a, b) => Math.round(a + (b - a) * t / 5);
      // which way a turn should go to head back toward the centre (0: no need)
      const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      function steer(force) {
        const p = rk.pos, dx = ENDLESS.x - p[0], dz = ENDLESS.z - p[1], d = Math.hypot(dx, dz);
        const f = DIRS[rk.h], r = DIRS[(rk.h + 1) % 4];
        if (!force && (d < ENDLESS.roam * 0.5 || (f[0] * dx + f[1] * dz) / d > 0.3)) return 0;
        return r[0] * dx + r[1] * dz >= 0 ? 1 : -1;
      }
      const PIECES = {
        bhop(t) {
          const sz = lerp(t, 160, 100), step = lerp(t, 245, 302), gap = lerp(t, 44, 84), n = 7 + ((rnd() * (3 + t / 2)) | 0);
          const sg = { t: 'bhop', gap, n, size: sz, step };
          if (t >= 1) { if (rnd() < 0.5) sg.zig = lerp(t, 40, 100); else { const a = lerp(t, 50, 100); sg.lat = [0, a, -a, Math.round(a / 2), -Math.round(a / 2)]; } }
          add(sg);
          add({ t: 'pad', gap: 125, len: 800, w: 900 });
        },
        surf(t) {
          // a steeper first ramp on the harder tiers, for the speed the transfers need
          add({ t: 'surf', face: t < 2 ? 55 : t < 4 ? 60 : 65, len: 3200, drop: lerp(t, 400, 600) });
          const m = t < 1 ? 0 : t < 3 ? 1 : 1 + (rnd() < 0.5 ? 1 : 0);
          let side = sign();
          // transfers as wide as Harbor's, no wider
          for (let j = 0; j < m; j++) { add({ t: 'surf', face: t < 3 ? 60 : 65, len: 3200, drop: lerp(t, 400, 450), dx: side * lerp(t, 300, 470), gap: lerp(t, 900, 1000), fall: 600 }); side = -side; }
          add({ t: 'pad', len: 3000, w: 1400 });
        },
        zip(t) {
          add({ t: 'zip', len: Math.round(range(2400, 3200)), drop: Math.round(range(700, 1000)), dx: t >= 2 ? sign() * 200 : 0 });
          add({ t: 'pad', len: 1600, w: 900 });
        },
        wall(t) {
          add({ t: 'wall', side: sign(), len: 700, gap: 550 });
          add({ t: 'pad', rise: 120, len: 900, w: 900, lip: true });
        },
        curve(t) {
          const dir = steer(true) || sign();
          add({ t: 'curve', dir, face: t < 2 ? 55 : t < 4 ? 60 : 65, R: lerp(t, 4200, 3000), drop: 600 });
          if (t >= 2) add({ t: 'surf', face: 65, len: 3000, drop: 400, dx: sign() * lerp(t, 250, 350), gap: 900, fall: 600 });
          add({ t: 'pad', len: 3000, w: 1400 });
        },
      };
      const POOL = [['bhop', 'surf', 'zip'], ['bhop', 'surf', 'zip', 'wall'], ['bhop', 'surf', 'zip', 'wall', 'curve']];
      // one section: build it, and tell what it added to the world
      function section() {
        const b0 = world.brushes.length, t0 = world.triggers.length, z0 = world.ziplines.length;
        const l0 = Math.max(0, rk.legs.length - 1); // the leg you're on carries on into this section
        segs = [];
        const t = tierOf(k), pool = POOL[Math.min(2, t)];
        if (k === 0) add({ t: 'pad', len: 900, w: 900 });
        const n = 2 + (t >= 2 && rnd() < 0.5 ? 1 : 0);
        let last = null;
        for (let j = 0; j < n; j++) {
          // a turn pivots on the pad you're on; a short run-up after it, to pick up speed the new way
          if (j) { const d = steer(false); if (d) { add({ t: 'turn', dir: d }); add({ t: 'pad', len: 600, w: 900 }); } }
          // back up to a safe height before the next piece
          while (rk.y < ENDLESS.low) add({ t: 'updraft' });
          let kind = pick(pool);
          if (kind === last && rnd() < 0.7) kind = pick(pool);
          PIECES[kind](t);
          last = kind;
        }
        // the gate: the last pad becomes a checkpoint
        if (rk.y < ENDLESS.low) add({ t: 'updraft' });
        gate();
        // a city far below, for depth (scenery: landing on it is a fall). Its own
        // random numbers, so the course is the same with or without it.
        {
          let q = (Math.imul(seed >>> 0, 2654435761) ^ Math.imul(k + 1, 40503)) >>> 0 || 1;
          const r2 = () => { q = Math.imul(q ^ (q >>> 15), 0x2c1b3c6d) >>> 0; q = (q + 0x6D2B79F5) >>> 0; return ((q ^ (q >>> 13)) >>> 0) / 4294967296; };
          let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
          for (const b of world.brushes.slice(b0)) if (!b.props.nonsolid) { x0 = Math.min(x0, b.min[0]); z0 = Math.min(z0, b.min[2]); x1 = Math.max(x1, b.max[0]); z1 = Math.max(z1, b.max[2]); }
          const STEP = 2400;
          for (let gx = Math.floor((x0 - 3000) / STEP) * STEP; gx < x1 + 3000; gx += STEP) for (let gz = Math.floor((z0 - 3000) / STEP) * STEP; gz < z1 + 3000; gz += STEP) {
            if (r2() < 0.45) continue;
            const w = 700 + r2() * 900, d = 700 + r2() * 900, ax = gx + r2() * (STEP - w - 100), az = gz + r2() * (STEP - d - 100);
            world.addBox([ax, -200, az], [ax + w, 2500 + r2() * (ENDLESS.low - 8500), az + d], { color: r2() < 0.3 ? COLORS.glass : COLORS.roofSide, kind: 'building', far: true });
          }
        }
        const out = { k, tier: t, segs, legs: [l0, rk.legs.length], brushes: world.brushes.slice(b0), triggers: world.triggers.slice(t0), ziplines: world.ziplines.slice(z0) };
        for (const b of out.brushes) b.endless = k;
        for (const tr of out.triggers) tr.endless = k;
        for (const z of out.ziplines) z.endless = k;
        k++;
        return out;
      }
      // the pad just built becomes the gate
      function gate() {
        const it = rk.prevPad, L = rk.leg, a = L.at(it.x - it.w / 2, it.z0), b = L.at(it.x + it.w / 2, it.z1);
        const spawn = { pos: (() => { const q = L.at(it.x, it.z0 - Math.min(300, it.len / 2)); return [q[0], it.y, q[1]]; })(), yaw: L.yaw };
        world.addTrigger([Math.min(a[0], b[0]), it.y, Math.min(a[1], b[1])], [Math.max(a[0], b[0]), it.y + 160, Math.max(a[1], b[1])],
          { type: 'checkpoint', course: 'endless', idx: k + 1, spawn });
      }
      return { section, builder: rk, get k() { return k; } };
    }

    // ------------------------------------------------------------ level order and keys
    const order = ['surf', 'bhop', 'roofs', 'canyon', 'stairway', 'crossover', 'downtown', 'cascade', 'spire', 'freerun'];
    order.forEach((name, i) => { courses[name].key = String((i + 1) % 10); }); // the tenth level is on 0

    // global safety net
    world.addTrigger([-1e6, -1e6, -1e6], [1e6, -4000, 1e6], { type: 'kill' });

    const gauntletOrder = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'];
    gauntletOrder.forEach((name, i) => { courses[name].key = 'G' + (i + 1); });
    const nightOrder = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'];
    nightOrder.forEach((name, i) => { courses[name].key = 'N' + (i + 1); });
    const harborOrder = ['h2', 'h1', 'h3', 'h4', 'h5', 'h6']; // Gantry plays easier than Dockside, so it opens the set
    harborOrder.forEach((name, i) => { courses[name].key = 'H' + (i + 1); });

    const skylineOrder = ['s1', 's2', 's3', 's4'];
    skylineOrder.forEach((name, i) => { courses[name].key = 'S' + (i + 1); });

    return { world, courses, endless, ENDLESS, order, gauntlet: gauntletOrder, night: nightOrder, harbor: harborOrder, skyline: skylineOrder, hubSpawn, COLORS };
  }

  // Falling off. For any spot, the lowest a rider can be while still on the course near it:
  // a coarse grid holding, per cell, the lowest piece within REACH of it. Flat pieces count
  // from just under their top and sloped ones (surf ramps) from their bottom edge. Skyline
  // buildings, streets and pools don't count: they are scenery, so landing on one is a fall too.
  // at(x, z) is null away from every piece.
  const isScenery = (props) => !!(props.far || props.nonsolid || props.kind === 'street');
  function fallGrid(brushes) {
    const CELL = 500, REACH = 1500, cells = new Map();
    const key = (i, j) => i * 4096 + j; // j stays well inside +-2048 cells (+-1M units)
    for (const b of brushes) {
      if (isScenery(b.props)) continue;
      const sloped = b.faces.some(f => Math.abs(f.n[1]) > 0.05 && Math.abs(f.n[1]) < 0.95);
      const low = sloped ? b.min[1] : Math.max(b.min[1], b.max[1] - 400);
      const i0 = Math.floor((b.min[0] - REACH) / CELL), i1 = Math.floor((b.max[0] + REACH) / CELL);
      const j0 = Math.floor((b.min[2] - REACH) / CELL), j1 = Math.floor((b.max[2] + REACH) / CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const k = key(i, j), v = cells.get(k);
        if (v === undefined || low < v) cells.set(k, low);
      }
    }
    return { at(x, z) { const v = cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); return v === undefined ? null : v; } };
  }

  root.StrafeMap = { buildMap, fallGrid, isScenery };
})(typeof window !== 'undefined' ? window : globalThis);
