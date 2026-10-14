// Strafe movement core.
// Units are Hammer units (1 u ~ 1 inch), Y is up. The player origin sits at the
// feet, like Source. Collision is Quake 3 / Source style: every solid is a
// convex brush, the player is an axis-aligned box, and the box is swept through
// brushes whose planes are pushed out by the box's support distance.
(function (root) {
  'use strict';

  const DIST_EPS = 0.03125;
  const NON_JUMP_VELOCITY = 140;
  const MAX_CLIP_PLANES = 5;

  const DEFAULTS = {
    tickrate: 100,
    gravity: 800,
    maxspeed: 250,          // knife run speed in CS:GO
    duckSpeedScale: 0.34,
    accelerate: 5.5,
    airaccelerate: 150,     // surf / bhop servers run 100-150; stock CS:GO is 12
    airCap: 30,             // the famous 30 u/s air wishspeed clamp
    friction: 5.2,
    stopspeed: 80,
    jumpSpeed: Math.sqrt(2 * 800 * 57), // 301.99: 57 unit jump height
    stepsize: 18,
    maxvelocity: 3500,
    autohop: true,
    // Mirror's Edge layer
    slideStartSpeed: 220,
    slideFrictionScale: 0.03,
    slideBoost: 45,
    slideBoostCap: 420,
    wallrunMinSpeed: 200,
    wallrunGravity: 0.32,
    wallrunMaxTime: 1.6,
    wallrunLift: 170,
    wallJumpOut: 270,
    wallJumpUp: 300,
    climbSpeed: 340,
    climbTime: 0.55,
    mantleReach: 96,
    mantleExitMin: 280, // exit speed of a mantle you came into below 150 u/s
    vaultReach: 60,
    // ziplines: you hang from a cable and ride it downhill
    zipReach: 40,       // how close your hands must pass to grab it
    zipHang: 84,        // cable height above your feet while riding
    zipMinSpeed: 450,
    zipMaxSpeed: 1600,
    zipJump: 260,
    // speed tech: above this speed a walkable slope doesn't catch you, you
    // slide over it like a surf ramp (no friction, no jumping) until you slow
    rampSlideSpeed: 1000,
    // falling at least this fast onto an edge your middle hangs over: the
    // landing doesn't take, the fall is cancelled and you slip on with your speed
    edgeBugFall: 450,
  };

  const HULL_STAND = { min: [-16, 0, -16], max: [16, 72, 16] };
  const HULL_DUCK = { min: [-16, 0, -16], max: [16, 54, 16] };
  const POINT_HULL = { min: [0, 0, 0], max: [0, 0, 0] };
  const EYE_STAND = 64;
  const EYE_DUCK = 46;
  const DUCK_DELTA = HULL_STAND.max[1] - HULL_DUCK.max[1]; // 18

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len2 = (x, z) => Math.sqrt(x * x + z * z);

  // ---------------------------------------------------------------- world

  // Map a prism's 2D cross-section (u, v) plus extrusion coordinate w to 3D.
  //   axis 'z': poly is (x, y), extruded along z
  //   axis 'x': poly is (z, y), extruded along x
  //   axis 'y': poly is (x, z), extruded along y
  function to3(axis, u, v, w) {
    if (axis === 'z') return [u, v, w];
    if (axis === 'x') return [w, v, u];
    return [u, w, v];
  }

  class World {
    constructor() {
      this.brushes = [];
      this.ziplines = [];
      this.triggers = [];
      this.movers = [];
    }

    // Moving pieces: the brushes stay where they were built and carry an
    // offset (brush.off) that traces apply. A mover goes out along `travel`
    // and back, easing at both ends, taking `time` seconds each way.
    // setTime(t) puts every mover where it is t seconds after the level
    // loaded and keeps how far it moved since the last call (mv.delta).
    addMover(brushes, travel, time) {
      const mv = { travel, time: Math.max(0.2, time), off: [0, 0, 0], delta: [0, 0, 0], brushes };
      for (const b of brushes) { b.mv = mv; b.off = mv.off; }
      this.movers.push(mv);
      return mv;
    }
    setTime(t) {
      for (const mv of this.movers) {
        const f = (1 - Math.cos(Math.PI * t / mv.time)) / 2;
        for (let k = 0; k < 3; k++) { const o = mv.travel[k] * f; mv.delta[k] = o - mv.off[k]; mv.off[k] = o; }
      }
    }

    // Convex prism: a 2D cross-section extruded along a world axis.
    addPrism(axis, poly, w0, w1, props) {
      const faces = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        faces.push([to3(axis, a[0], a[1], w0), to3(axis, b[0], b[1], w0), to3(axis, b[0], b[1], w1), to3(axis, a[0], a[1], w1)]);
      }
      faces.push(poly.map(p => to3(axis, p[0], p[1], w0)));
      faces.push(poly.map(p => to3(axis, p[0], p[1], w1)));
      return this.addHull(faces, props);
    }

    // Cross-section in XY at z0, swept to z1 while shifting by dy: a ramp
    // that descends along its length, the way most surf maps build them.
    addSweep(poly, z0, z1, dy, props) {
      const faces = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        faces.push([[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1] + dy, z1], [a[0], a[1] + dy, z1]]);
      }
      faces.push(poly.map(p => [p[0], p[1], z0]));
      faces.push(poly.map(p => [p[0], p[1] + dy, z1]));
      return this.addHull(faces, props);
    }

    // Generic convex brush from its faces (each a planar vertex loop).
    // Adds Quake 3 style bevel planes (axial and edge x axis) so sweeping a
    // box through the expanded planes is exact at edges and corners.
    addHull(faceVerts, props) {
      const verts = [];
      for (const f of faceVerts) for (const v of f) verts.push(v);
      const center = [0, 0, 0];
      for (const v of verts) for (let k = 0; k < 3; k++) center[k] += v[k] / verts.length;
      const planes = [], faces = [];
      const hasPlane = (n) => planes.some(p => dot(p.n, n) > 0.99999);
      for (const f of faceVerts) {
        // Newell normal
        let n = [0, 0, 0];
        for (let i = 0; i < f.length; i++) {
          const a = f[i], b = f[(i + 1) % f.length];
          n[0] += (a[1] - b[1]) * (a[2] + b[2]);
          n[1] += (a[2] - b[2]) * (a[0] + b[0]);
          n[2] += (a[0] - b[0]) * (a[1] + b[1]);
        }
        const l = Math.hypot(n[0], n[1], n[2]);
        n = [n[0] / l, n[1] / l, n[2] / l];
        if (dot(n, center) - dot(n, f[0]) > 0) n = [-n[0], -n[1], -n[2]];
        for (let k = 0; k < 3; k++) if (Math.abs(n[k]) < 1e-12) n[k] = 0;
        planes.push({ n, d: dot(n, f[0]) });
        faces.push({ n, verts: f });
      }
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (const v of verts) for (let k = 0; k < 3; k++) {
        if (v[k] < min[k]) min[k] = v[k];
        if (v[k] > max[k]) max[k] = v[k];
      }
      for (let k = 0; k < 3; k++) {
        const nP = [0, 0, 0]; nP[k] = 1;
        const nN = [0, 0, 0]; nN[k] = -1;
        if (!hasPlane(nP)) planes.push({ n: nP, d: max[k] });
        if (!hasPlane(nN)) planes.push({ n: nN, d: -min[k] });
      }
      for (const f of faceVerts) {
        for (let i = 0; i < f.length; i++) {
          const a = f[i], b = f[(i + 1) % f.length];
          const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
          for (let k = 0; k < 3; k++) {
            const ax = [0, 0, 0]; ax[k] = 1;
            let n = [e[1] * ax[2] - e[2] * ax[1], e[2] * ax[0] - e[0] * ax[2], e[0] * ax[1] - e[1] * ax[0]];
            const l = Math.hypot(n[0], n[1], n[2]);
            if (l < 1e-6) continue;
            n = [n[0] / l, n[1] / l, n[2] / l];
            for (const sgn of [1, -1]) {
              const m = [n[0] * sgn, n[1] * sgn, n[2] * sgn];
              const d = dot(m, a);
              if (verts.some(v => dot(m, v) - d > 0.01)) continue; // not a supporting plane
              if (!hasPlane(m)) planes.push({ n: m, d });
            }
          }
        }
      }
      const brush = { planes, faces, min, max, props: props || {} };
      this.brushes.push(brush);
      return brush;
    }

    addBox(min, max, props) {
      return this.addPrism('y', [[min[0], min[2]], [max[0], min[2]], [max[0], max[2]], [min[0], max[2]]], min[1], max[1], props);
    }

    addTrigger(min, max, data) {
      const t = Object.assign({ min, max }, data);
      this.triggers.push(t);
      return t;
    }

    // Sweep an AABB (hull relative to origin) from start to end.
    trace(start, end, hull) {
      const tr = { fraction: 1, endpos: null, normal: null, startsolid: false, allsolid: false, brush: null };
      const hmin = hull.min, hmax = hull.max;
      const bx0 = Math.min(start[0], end[0]) + hmin[0] - 1, bx1 = Math.max(start[0], end[0]) + hmax[0] + 1;
      const by0 = Math.min(start[1], end[1]) + hmin[1] - 1, by1 = Math.max(start[1], end[1]) + hmax[1] + 1;
      const bz0 = Math.min(start[2], end[2]) + hmin[2] - 1, bz1 = Math.max(start[2], end[2]) + hmax[2] + 1;
      const brushes = this.brushes;
      for (let i = 0; i < brushes.length; i++) {
        const b = brushes[i];
        if (b.props.nonsolid) continue;
        const o = b.off;
        if (o) {
          if (b.min[0] + o[0] > bx1 || b.max[0] + o[0] < bx0 || b.min[1] + o[1] > by1 || b.max[1] + o[1] < by0 || b.min[2] + o[2] > bz1 || b.max[2] + o[2] < bz0) continue;
          clipBoxToBrush(b, [start[0] - o[0], start[1] - o[1], start[2] - o[2]], [end[0] - o[0], end[1] - o[1], end[2] - o[2]], hmin, hmax, tr);
          if (tr.allsolid) break;
          continue;
        }
        if (b.min[0] > bx1 || b.max[0] < bx0 || b.min[1] > by1 || b.max[1] < by0 || b.min[2] > bz1 || b.max[2] < bz0) continue;
        clipBoxToBrush(b, start, end, hmin, hmax, tr);
        if (tr.allsolid) break;
      }
      const f = tr.fraction;
      tr.endpos = [start[0] + (end[0] - start[0]) * f, start[1] + (end[1] - start[1]) * f, start[2] + (end[2] - start[2]) * f];
      return tr;
    }
  }

  // Quake 3 CM_TraceThroughBrush, with the plane offset for a box hull.
  function clipBoxToBrush(brush, start, end, hmin, hmax, tr) {
    let enterFrac = -1, leaveFrac = 1, clip = null, startOut = false, getOut = false;
    const planes = brush.planes;
    for (let i = 0; i < planes.length; i++) {
      const p = planes[i], n = p.n;
      const off = (n[0] > 0 ? n[0] * hmin[0] : n[0] * hmax[0]) +
                  (n[1] > 0 ? n[1] * hmin[1] : n[1] * hmax[1]) +
                  (n[2] > 0 ? n[2] * hmin[2] : n[2] * hmax[2]);
      const dist = p.d - off;
      const d1 = dot(start, n) - dist;
      const d2 = dot(end, n) - dist;
      if (d2 > 0) getOut = true;
      if (d1 > 0) startOut = true;
      if (d1 > 0 && (d2 >= DIST_EPS || d2 >= d1)) return;
      if (d1 <= 0 && d2 <= 0) continue;
      if (d1 > d2) {
        let f = (d1 - DIST_EPS) / (d1 - d2);
        if (f < 0) f = 0;
        if (f > enterFrac) { enterFrac = f; clip = n; }
      } else {
        let f = (d1 + DIST_EPS) / (d1 - d2);
        if (f > 1) f = 1;
        if (f < leaveFrac) leaveFrac = f;
      }
    }
    if (!startOut) {
      tr.startsolid = true;
      if (!getOut) { tr.allsolid = true; tr.fraction = 0; tr.brush = brush; }
      return;
    }
    if (enterFrac < leaveFrac && enterFrac > -1 && enterFrac < tr.fraction) {
      tr.fraction = enterFrac < 0 ? 0 : enterFrac;
      tr.normal = clip;
      tr.brush = brush;
    }
  }

  // Source CGameMovement::ClipVelocity
  function clipVelocity(inv, n, out, overbounce) {
    const backoff = dot(inv, n) * overbounce;
    for (let i = 0; i < 3; i++) out[i] = inv[i] - n[i] * backoff;
    const adjust = dot(out, n);
    if (adjust < 0) for (let i = 0; i < 3; i++) out[i] -= n[i] * adjust;
    return out;
  }

  // ---------------------------------------------------------------- player

  class Player {
    constructor(world, cfg) {
      this.world = world;
      this.cfg = Object.assign({}, DEFAULTS, cfg || {});
      this.events = [];
      this.reset([0, 0, 0], 0);
    }

    reset(pos, yaw) {
      // Spawn points sit on surfaces; lift a hair so we never start touching.
      this.pos = [pos[0], pos[1] + 0.5, pos[2]];
      this.vel = [0, 0, 0];
      this.approach = 0;
      this.yaw = yaw || 0;
      this.pitch = 0;
      this.ducked = false;
      this.onGround = false;
      this.groundNormal = null;
      this.viewOffset = EYE_STAND;
      this.prevJump = false;
      this.prevDuck = false;
      this.slide = null;
      this.slideCooldown = 0;
      this.wallrun = null;
      this.wallrunCooldown = 0;
      this.lastWall = null;
      this.climb = null;
      this.climbAvailable = true;
      this.mantle = null;
      this.zip = null;
      this.zipCooldown = 0;
      this.zipLast = null;
      this.rampSlide = false;
      this.edgeBug = 0;
      this.airTime = 0;
      this.categorize();
    }

    get hull() { return this.ducked ? HULL_DUCK : HULL_STAND; }
    get eyeTarget() { return this.ducked ? EYE_DUCK : EYE_STAND; }
    hspeed() { return len2(this.vel[0], this.vel[2]); }
    trace(a, b) { return this.world.trace(a, b, this.hull); }
    forward() { return [-Math.sin(this.yaw), 0, -Math.cos(this.yaw)]; }
    right() { return [Math.cos(this.yaw), 0, -Math.sin(this.yaw)]; }

    // cmd: { forward, side in [-1,1], jump, duck (held), yaw, pitch }
    tick(cmd, dt) {
      const c = this.cfg;
      this.yaw = cmd.yaw;
      this.pitch = cmd.pitch;
      const jumpPressed = cmd.jump && !this.prevJump;
      this.jumpPressed = jumpPressed;
      // speed a moment ago, before hitting anything: what a mantle counts as "how fast you came in"
      this.approach = Math.max(this.hspeed(), (this.approach || 0) - 2000 * dt);
      if (this.slideCooldown > 0) this.slideCooldown -= dt;
      if (this.wallrunCooldown > 0) this.wallrunCooldown -= dt;
      if (this.zipCooldown > 0) this.zipCooldown -= dt;
      if (this.edgeBug > 0) this.edgeBug -= dt;
      if (this.world.movers.length && !this.mantle) this.ride();
      const wasOnGround = this.onGround;
      const fallSpeed = -this.vel[1];
      this.fallIn = fallSpeed; // before a landing clips it away

      if (this.mantle) {
        this.mantleMove(dt);
      } else if (this.zip || this.tryZip()) {
        this.zipMove(cmd, dt);
      } else {
        this.duck(cmd);
        if (this.wallrun) this.wallRunMove(cmd, dt);
        else if (this.climb) this.climbMove(cmd, dt);
        else if (!this.tryAbilities(cmd, jumpPressed)) this.fullWalkMove(cmd, dt);
      }

      // Smooth eye height so duck/slide transitions never pop.
      const k = 1 - Math.exp(-dt * 18);
      this.viewOffset += (this.eyeTarget - this.viewOffset) * k;

      // an updraft pad (Endless) throws you up and on along its arrow, the same arc every time
      const ud = this.onGround && this.groundBrush && this.groundBrush.props.updraft;
      if (ud) {
        this.vel = [ud.dir[0] * ud.flat, ud.up, ud.dir[1] * ud.flat];
        this.onGround = false; this.groundNormal = null; this.groundBrush = null;
        this.slide = null; this.rampSlide = false;
        this.events.push({ type: 'updraft' });
      }
      if (!this.onGround) this.airTime += dt; else this.airTime = 0;
      if (!wasOnGround && this.onGround) {
        this.climbAvailable = true;
        this.lastWall = null;
        this.events.push({ type: 'land', speed: fallSpeed });
      }
      this.prevJump = cmd.jump;
      this.prevDuck = cmd.duck;
    }

    // Moving pieces: standing on one carries you with it (up and down with a
    // lift, and along with a platform unless a wall is in the way), and one
    // that moves into you shoves you out of its way.
    ride() {
      const g = this.onGround && this.groundBrush && this.groundBrush.mv;
      if (g) {
        const d = g.delta;
        this.pos[1] += d[1];
        if (d[0] || d[2]) {
          const to = [this.pos[0] + d[0], this.pos[1], this.pos[2] + d[2]];
          const tr = this.trace(this.pos, to);
          if (!tr.startsolid) this.pos = tr.endpos;
        }
      }
      const h = this.hull;
      for (const mv of this.world.movers) {
        if (mv === g) continue;
        const d = mv.delta;
        if (!d[0] && !d[1] && !d[2]) continue;
        for (const b of mv.brushes) {
          const o = mv.off, p = [this.pos[0] - o[0], this.pos[1] - o[1], this.pos[2] - o[2]];
          const tr = { fraction: 1, startsolid: false, allsolid: false };
          clipBoxToBrush(b, p, p, h.min, h.max, tr);
          if (!tr.startsolid) continue;
          // out the way it's moving: its step, and a little more so you stand clear
          const L = Math.hypot(d[0], d[1], d[2]);
          for (let k = 0; k < 3; k++) this.pos[k] += d[k] + d[k] / L * 0.5;
          if (d[1] > 0 && this.vel[1] < 0) this.vel[1] = 0;
          break;
        }
      }
    }

    tryAbilities(cmd, jumpPressed) {
      if (cmd.forward <= 0) return false;
      if (this.onGround) {
        if ((jumpPressed || (cmd.jump && this.cfg.autohop)) && !this.slide && this.tryMantle(true)) return true;
        if (jumpPressed && this.tryClimb()) return true;
        return false;
      }
      if (this.tryMantle(false)) return true;
      if ((jumpPressed || (cmd.jump && this.airTime < 0.5)) && this.tryClimb()) return true;
      if (this.tryWallrun(cmd)) return true;
      return false;
    }

    // ---- Source ground/air movement

    fullWalkMove(cmd, dt) {
      const c = this.cfg;
      this.vel[1] -= c.gravity * 0.5 * dt;
      this.checkJump(cmd);
      if (this.onGround) {
        this.vel[1] = 0;
        this.friction(dt);
      }
      this.checkVelocity();
      if (this.onGround) this.walkMove(cmd, dt);
      else this.airMove(cmd, dt);
      this.categorize();
      this.checkVelocity();
      if (!this.onGround) this.vel[1] -= c.gravity * 0.5 * dt;
      if (this.onGround) this.vel[1] = 0;
      this.updateSlide(dt);
    }

    checkVelocity() {
      const m = this.cfg.maxvelocity;
      for (let i = 0; i < 3; i++) {
        if (!isFinite(this.vel[i])) this.vel[i] = 0;
        if (this.vel[i] > m) this.vel[i] = m;
        else if (this.vel[i] < -m) this.vel[i] = -m;
      }
    }

    checkJump(cmd) {
      if (!this.onGround || !cmd.jump) return;
      if (!this.cfg.autohop && this.prevJump) return;
      this.onGround = false;
      this.groundNormal = null;
      this.vel[1] = this.cfg.jumpSpeed;
      if (this.slide) this.endSlide();
      this.events.push({ type: 'jump', speed: this.hspeed() });
    }

    friction(dt) {
      const c = this.cfg;
      const v = this.vel;
      const speed = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
      if (speed < 0.1) return;
      let drop = 0;
      if (this.onGround) {
        if (this.slide) {
          // Friction eases back in late in a flat slide instead of snapping on.
          const s = this.slide;
          const n = this.groundNormal;
          const flat = !n || n[1] >= 0.985;
          const ramp = flat ? Math.min(1, Math.max(0, (s.t - 1.2) / 1.4)) : 0;
          const scale = c.slideFrictionScale + (1 - c.slideFrictionScale) * ramp * ramp;
          drop = speed * c.friction * scale * dt;
        } else {
          const control = speed < c.stopspeed ? c.stopspeed : speed;
          drop = control * c.friction * dt;
        }
      }
      let ns = speed - drop;
      if (ns < 0) ns = 0;
      if (ns !== speed) {
        ns /= speed;
        v[0] *= ns; v[1] *= ns; v[2] *= ns;
      }
    }

    wish(cmd) {
      const f = this.forward(), r = this.right();
      // Source scales by cl_forwardspeed (450) then clamps to maxspeed.
      const fm = cmd.forward * 450, sm = cmd.side * 450;
      const wx = f[0] * fm + r[0] * sm, wz = f[2] * fm + r[2] * sm;
      let ws = len2(wx, wz);
      const dir = ws > 0 ? [wx / ws, 0, wz / ws] : [0, 0, 0];
      let max = this.cfg.maxspeed;
      if (this.ducked && this.onGround) max *= this.cfg.duckSpeedScale;
      if (ws > max) ws = max;
      return { dir, speed: ws };
    }

    accelerate(dir, wishspeed, accel, dt) {
      const cur = dot(this.vel, dir);
      const add = wishspeed - cur;
      if (add <= 0) return;
      let as = accel * dt * wishspeed;
      if (as > add) as = add;
      for (let i = 0; i < 3; i++) this.vel[i] += as * dir[i];
    }

    airAccelerate(dir, wishspeed, accel, dt) {
      let wishspd = wishspeed;
      if (wishspd > this.cfg.airCap) wishspd = this.cfg.airCap;
      const cur = dot(this.vel, dir);
      const add = wishspd - cur;
      if (add <= 0) return;
      let as = accel * wishspeed * dt;
      if (as > add) as = add;
      for (let i = 0; i < 3; i++) this.vel[i] += as * dir[i];
    }

    walkMove(cmd, dt) {
      const c = this.cfg;
      if (this.slide) {
        // Sliding: no steering acceleration; gravity pulls you down slopes.
        const n = this.groundNormal;
        if (n) {
          this.vel[0] += c.gravity * n[1] * n[0] * dt;
          this.vel[2] += c.gravity * n[1] * n[2] * dt;
        }
      } else {
        const w = this.wish(cmd);
        this.vel[1] = 0;
        this.accelerate(w.dir, w.speed, c.accelerate, dt);
      }
      this.vel[1] = 0;
      const spd = this.hspeed();
      if (spd < 1) { this.vel[0] = 0; this.vel[2] = 0; return; }
      const p = this.pos;
      const dest = [p[0] + this.vel[0] * dt, p[1], p[2] + this.vel[2] * dt];
      const tr = this.trace(p, dest);
      if (tr.fraction === 1) {
        this.pos = tr.endpos;
        this.stayOnGround();
        return;
      }
      this.stepMove(dt);
      this.stayOnGround();
    }

    airMove(cmd, dt) {
      const w = this.wish(cmd);
      this.airAccelerate(w.dir, w.speed, this.cfg.airaccelerate, dt);
      this.tryPlayerMove(dt);
    }

    stepMove(dt) {
      const c = this.cfg;
      const startPos = this.pos.slice(), startVel = this.vel.slice();
      this.tryPlayerMove(dt);
      const downPos = this.pos.slice(), downVel = this.vel.slice();

      this.pos = startPos.slice();
      this.vel = startVel.slice();
      let tr = this.trace(this.pos, [this.pos[0], this.pos[1] + c.stepsize + DIST_EPS, this.pos[2]]);
      if (!tr.startsolid && !tr.allsolid) this.pos = tr.endpos;
      this.tryPlayerMove(dt);
      tr = this.trace(this.pos, [this.pos[0], this.pos[1] - c.stepsize - DIST_EPS, this.pos[2]]);
      if (!tr.startsolid && !tr.allsolid) this.pos = tr.endpos;
      if (tr.fraction !== 1 && tr.normal && tr.normal[1] < 0.7) {
        this.pos = downPos; this.vel = downVel;
        return;
      }
      const upPos = this.pos;
      const dDown = (downPos[0] - startPos[0]) ** 2 + (downPos[2] - startPos[2]) ** 2;
      const dUp = (upPos[0] - startPos[0]) ** 2 + (upPos[2] - startPos[2]) ** 2;
      if (dDown > dUp) {
        this.pos = downPos; this.vel = downVel;
      } else {
        this.vel[1] = downVel[1];
      }
    }

    stayOnGround() {
      const p = this.pos;
      let tr = this.trace(p, [p[0], p[1] + 2, p[2]]);
      const start = tr.endpos;
      tr = this.trace(start, [p[0], p[1] - this.cfg.stepsize, p[2]]);
      if (tr.fraction > 0 && tr.fraction < 1 && !tr.startsolid && tr.normal && tr.normal[1] >= 0.7) {
        if (Math.abs(p[1] - tr.endpos[1]) > 0.5 * DIST_EPS) this.pos = tr.endpos;
      }
    }

    // Source CGameMovement::TryPlayerMove
    tryPlayerMove(dt) {
      const planes = [];
      let originalVel = this.vel.slice();
      const primalVel = this.vel.slice();
      const newVel = [0, 0, 0];
      let timeLeft = dt, allFraction = 0;
      for (let bump = 0; bump < 4; bump++) {
        const v = this.vel;
        if (v[0] === 0 && v[1] === 0 && v[2] === 0) break;
        const p = this.pos;
        const end = [p[0] + v[0] * timeLeft, p[1] + v[1] * timeLeft, p[2] + v[2] * timeLeft];
        const tr = this.trace(p, end);
        allFraction += tr.fraction;
        if (tr.allsolid) {
          this.vel = [0, 0, 0];
          return;
        }
        if (tr.fraction > 0) {
          this.pos = tr.endpos;
          originalVel = this.vel.slice();
          planes.length = 0;
        }
        if (tr.fraction === 1) break;
        timeLeft -= timeLeft * tr.fraction;
        if (planes.length >= MAX_CLIP_PLANES) { this.vel = [0, 0, 0]; break; }
        // Hitting the same plane twice (float error after a clip) is what causes
        // the classic surf "ramp bug". Nudge off it instead of zeroing velocity,
        // like Quake 3's PM_SlideMove.
        const n = tr.normal;
        if (planes.some(q => dot(q, n) > 0.99)) {
          for (let i = 0; i < 3; i++) this.vel[i] += n[i];
          continue;
        }
        planes.push(n);

        if (planes.length === 1 && !this.onGround) {
          for (const n of planes) {
            clipVelocity(originalVel, n, newVel, 1);
            originalVel = newVel.slice();
          }
          this.vel = newVel.slice();
          originalVel = newVel.slice();
        } else {
          let i;
          for (i = 0; i < planes.length; i++) {
            clipVelocity(originalVel, planes[i], this.vel, 1);
            let j;
            for (j = 0; j < planes.length; j++) {
              if (j !== i && dot(this.vel, planes[j]) < -1e-4) break;
            }
            if (j === planes.length) break;
          }
          if (i === planes.length) {
            if (planes.length !== 2) { this.vel = [0, 0, 0]; break; }
            const a = planes[0], b = planes[1];
            let dir = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
            const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
            dir = [dir[0] / dl, dir[1] / dl, dir[2] / dl];
            const d = dot(dir, this.vel);
            this.vel = [dir[0] * d, dir[1] * d, dir[2] * d];
          }
          if (dot(this.vel, primalVel) <= 0) { this.vel = [0, 0, 0]; break; }
        }
      }
      if (allFraction === 0) this.vel = [0, 0, 0];
    }

    categorize() {
      const p = this.pos;
      if (this.vel[1] > NON_JUMP_VELOCITY) {
        this.onGround = false; this.groundNormal = null;
        return;
      }
      const tr = this.trace(p, [p[0], p[1] - 2, p[2]]);
      if (!tr.normal || tr.normal[1] < 0.7) {
        this.onGround = false; this.groundNormal = null;
        this.rampSlide = false;
        return;
      }
      const c = this.cfg, n = tr.normal;
      // ramp slide: a fast rider over a slope keeps flying along it
      if (n[1] < 0.985 && !this.slide) {
        const vn = dot(this.vel, n), along = Math.hypot(this.vel[0] - n[0] * vn, this.vel[1] - n[1] * vn, this.vel[2] - n[2] * vn);
        if (along > c.rampSlideSpeed * (this.rampSlide ? 0.9 : 1)) {
          if (!this.rampSlide) this.events.push({ type: 'rampslide' });
          this.rampSlide = true;
          this.onGround = false; this.groundNormal = null;
          return;
        }
      }
      this.rampSlide = false;
      // edge bug: a hard fall caught only by the edge of your box
      if (!this.onGround && (this.fallIn > c.edgeBugFall || this.edgeBug > 0) && this.hspeed() > 200) {
        const mid = this.world.trace([p[0], p[1] + 1, p[2]], [p[0], p[1] - 24, p[2]], POINT_HULL);
        if (mid.fraction === 1) {
          if (this.edgeBug <= 0) { this.events.push({ type: 'edgebug', fall: -this.vel[1] }); this.edgeBug = 0.15; }
          this.vel[1] = 0;
          this.onGround = false; this.groundNormal = null;
          return;
        }
      }
      this.onGround = true; this.groundNormal = n;
      this.groundBrush = tr.brush;
      this.zipLast = null;
    }

    // ---- ducking and sliding

    setDucked(d) {
      if (d === this.ducked) return true;
      const p = this.pos;
      if (d) {
        this.ducked = true;
        if (!this.onGround) {
          // Tuck the feet up so the head stays where it was.
          this.pos = [p[0], p[1] + DUCK_DELTA, p[2]];
          this.viewOffset -= DUCK_DELTA;
        }
        return true;
      }
      const tryAt = (pos) => {
        const tr = this.world.trace(pos, pos, HULL_STAND);
        return !tr.startsolid;
      };
      if (!this.onGround) {
        const dropped = [p[0], p[1] - DUCK_DELTA, p[2]];
        if (tryAt(dropped)) {
          this.ducked = false; this.pos = dropped; this.viewOffset += DUCK_DELTA;
          return true;
        }
      }
      if (tryAt(p)) { this.ducked = false; return true; }
      return false;
    }

    duck(cmd) {
      const c = this.cfg;
      const pressed = cmd.duck && !this.prevDuck;
      // Landing with crouch held turns straight into a slide.
      if (!this.onGround) this.slideArmed = cmd.duck;
      if (cmd.duck && (pressed || this.slideArmed) && this.onGround && !this.slide && this.hspeed() >= c.slideStartSpeed) {
        this.startSlide();
      }
      if (this.onGround) this.slideArmed = false;
      if (this.slide && !cmd.duck) this.endSlide();
      const want = cmd.duck || !!this.slide;
      this.setDucked(want);
    }

    startSlide() {
      const c = this.cfg;
      const hs = this.hspeed();
      // The cooldown only gates the boost, so slide-hop chains can't farm speed.
      if (hs < c.slideBoostCap && this.slideCooldown <= 0) {
        const ns = Math.min(hs + c.slideBoost, c.slideBoostCap);
        this.vel[0] *= ns / hs; this.vel[2] *= ns / hs;
      }
      if (this.slideCooldown <= 0) this.slideCooldown = 0.9;
      this.slide = { t: 0, air: 0 };
      this.events.push({ type: 'slide' });
    }

    endSlide() { this.slide = null; }

    updateSlide(dt) {
      const s = this.slide;
      if (!s) return;
      s.t += dt;
      if (!this.onGround) { s.air += dt; if (s.air > 0.25) this.endSlide(); return; }
      s.air = 0;
      if (this.hspeed() < 130) this.endSlide();
    }

    // ---- Mirror's Edge layer

    tryWallrun(cmd) {
      const c = this.cfg;
      if (this.wallrunCooldown > 0 || this.ducked || this.climb) return false;
      const hs = this.hspeed();
      if (hs < c.wallrunMinSpeed || this.vel[1] < -650) return false;
      const r = this.right(), f = this.forward();
      for (const side of [1, -1]) {
        const p = this.pos;
        const tr = this.trace(p, [p[0] + r[0] * side * 30, p[1], p[2] + r[2] * side * 30]);
        if (tr.fraction === 1 || !tr.normal || Math.abs(tr.normal[1]) > 0.15) continue;
        const n = [tr.normal[0], 0, tr.normal[2]];
        const nl = len2(n[0], n[2]); n[0] /= nl; n[2] /= nl;
        if (this.lastWall && dot(this.lastWall, n) > 0.95) continue;
        // a diagonal probe can clip a wall's corner; only run walls we are beside
        const tw = this.trace(p, [p[0] - n[0] * 30, p[1], p[2] - n[2] * 30]);
        if (tw.fraction === 1) continue;
        const vn = this.vel[0] * n[0] + this.vel[2] * n[2];
        const ax = this.vel[0] - n[0] * vn, az = this.vel[2] - n[2] * vn;
        const along = len2(ax, az);
        if (along / hs < 0.55) continue;
        if (Math.abs(dot(f, n)) > 0.85) continue;
        const dir = [ax / along, 0, az / along];
        const speed = Math.max(hs, 280);
        this.vel[0] = dir[0] * speed; this.vel[2] = dir[2] * speed;
        this.vel[1] = Math.min(Math.max(this.vel[1], c.wallrunLift), 300);
        this.wallrun = { n, t: 0, side };
        this.lastWall = n;
        this.events.push({ type: 'wallrun', side });
        this.wallRunMove(cmd, 1 / c.tickrate);
        return true;
      }
      return false;
    }

    endWallrun(cooldown) {
      this.wallrun = null;
      this.wallrunCooldown = cooldown;
    }

    wallRunMove(cmd, dt) {
      const c = this.cfg, w = this.wallrun, n = w.n;
      w.t += dt;
      if (this.jumpPressed) {
        // Kick off: keep the run speed, add an outward push and a fresh jump.
        const f = this.forward();
        const away = Math.max(0, dot(f, n));
        this.vel[0] += n[0] * c.wallJumpOut + f[0] * away * 140;
        this.vel[2] += n[2] * c.wallJumpOut + f[2] * away * 140;
        this.vel[1] = c.wallJumpUp;
        this.endWallrun(0.2);
        this.onGround = false;
        this.events.push({ type: 'walljump' });
        this.tryPlayerMove(dt);
        return;
      }
      if (cmd.forward <= 0 || w.t > c.wallrunMaxTime || cmd.duck) {
        this.endWallrun(0.35);
        this.fullWalkMove(cmd, dt);
        return;
      }
      this.vel[1] -= c.gravity * c.wallrunGravity * dt;
      // hug the wall so the clip keeps us on it
      this.vel[0] -= n[0] * 40; this.vel[2] -= n[2] * 40;
      this.tryPlayerMove(dt);
      const p = this.pos;
      const tr = this.trace(p, [p[0] - n[0] * 32, p[1], p[2] - n[2] * 32]);
      if (tr.fraction === 1 || !tr.normal || Math.abs(tr.normal[1]) > 0.15) {
        this.endWallrun(0.25);
      } else {
        const nn = [tr.normal[0], 0, tr.normal[2]];
        const l = len2(nn[0], nn[2]); nn[0] /= l; nn[2] /= l;
        w.n = nn;
      }
      this.categorize();
      if (this.onGround) { this.vel[1] = 0; this.endWallrun(0.2); }
      if (this.wallrun && this.hspeed() < 120) this.endWallrun(0.4);
    }

    tryClimb() {
      if (!this.climbAvailable || this.ducked) return false;
      const f = this.forward(), p = this.pos;
      const tr = this.trace(p, [p[0] + f[0] * 26, p[1], p[2] + f[2] * 26]);
      if (tr.fraction === 1 || !tr.normal || Math.abs(tr.normal[1]) > 0.15) return false;
      if (-dot(f, tr.normal) < 0.8) return false;
      const n = [tr.normal[0], 0, tr.normal[2]];
      const l = len2(n[0], n[2]); n[0] /= l; n[2] /= l;
      this.climb = { n, t: 0 };
      this.climbAvailable = false;
      this.onGround = false;
      // Carry some run-up into the climb, like Mirror's Edge.
      this.vel = [-n[0] * 20, this.cfg.climbSpeed + Math.min(this.hspeed(), 400) * 0.25, -n[2] * 20];
      this.events.push({ type: 'climb' });
      return true;
    }

    climbMove(cmd, dt) {
      const c = this.cfg, cl = this.climb, n = cl.n;
      cl.t += dt;
      if (this.jumpPressed && cl.t > 0.05) {
        this.vel = [n[0] * c.wallJumpOut * 1.1, c.wallJumpUp * 0.95, n[2] * c.wallJumpOut * 1.1];
        this.climb = null;
        this.lastWall = n;
        this.events.push({ type: 'climbjump' });
        this.tryPlayerMove(dt);
        return;
      }
      if (cmd.forward > 0 && this.tryMantle(false)) { this.climb = null; return; }
      this.vel[1] -= c.gravity * dt;
      this.vel[0] = -n[0] * 20; this.vel[2] = -n[2] * 20;
      this.tryPlayerMove(dt);
      const p = this.pos;
      const tr = this.trace(p, [p[0] - n[0] * 26, p[1], p[2] - n[2] * 26]);
      if (cl.t > c.climbTime || this.vel[1] < -40 || tr.fraction === 1 || cmd.forward <= 0) {
        this.climb = null;
      }
      this.categorize();
      if (this.onGround) { this.climb = null; this.vel[1] = 0; }
    }

    tryMantle(grounded) {
      const c = this.cfg;
      if (this.mantle) return false;
      const f = this.forward(), p = this.pos;
      const probe = this.trace(p, [p[0] + f[0] * 24, p[1], p[2] + f[2] * 24]);
      if (probe.fraction === 1 || !probe.normal || Math.abs(probe.normal[1]) > 0.3) return false;
      if (-dot(f, probe.normal) < 0.5) return false;
      const hitDist = 24 * probe.fraction;
      const reach = grounded ? c.vaultReach : c.mantleReach;
      const minUp = c.stepsize + 1;
      for (const extra of [20, 34]) {
        const off = hitDist + extra;
        const col = [p[0] + f[0] * off, p[1], p[2] + f[2] * off];
        const down = this.trace([col[0], p[1] + reach + 2, col[2]], [col[0], p[1] + minUp, col[2]]);
        if (down.startsolid || down.fraction === 1 || !down.normal || down.normal[1] < 0.7) continue;
        const ledge = down.endpos;
        const up = this.trace(p, [p[0], ledge[1] + 1, p[2]]);
        if (up.fraction < 1) continue;
        const mid = [p[0], ledge[1] + 1, p[2]];
        const across = this.trace(mid, [ledge[0], ledge[1] + 1, ledge[2]]);
        if (across.fraction < 1) continue;
        const rise = ledge[1] - p[1];
        const hs = this.hspeed();
        // a mantle from low speed pops you out a little faster: coming in under
        // 150 u/s it exits at mantleExitMin, easing back to the usual 200 floor by 250
        const floor = c.mantleExitMin + (200 - c.mantleExitMin) * Math.min(1, Math.max(0, ((this.approach || 0) - 150) / 100));
        const outSpeed = grounded ? Math.max(hs, 220) : Math.max(hs * 0.85, floor);
        const dur = grounded ? 0.16 : Math.min(0.34, Math.max(0.16, 0.1 + rise / 500));
        this.mantle = { from: p.slice(), mid, to: [ledge[0], ledge[1] + 1, ledge[2]], t: 0, dur, out: [f[0] * outSpeed, 0, f[2] * outSpeed], vault: grounded };
        this.vel = [0, 0, 0];
        this.onGround = false;
        if (this.slide) this.endSlide();
        if (this.wallrun) this.wallrun = null;
        this.events.push({ type: grounded ? 'vault' : 'mantle', rise });
        return true;
      }
      return false;
    }

    mantleMove(dt) {
      const m = this.mantle;
      m.t += dt;
      const t = Math.min(1, m.t / m.dur);
      const split = m.vault ? 0.45 : 0.7;
      const ease = (x) => x * x * (3 - 2 * x);
      let a, b, u;
      if (t < split) { a = m.from; b = m.mid; u = ease(t / split); }
      else { a = m.mid; b = m.to; u = ease((t - split) / (1 - split)); }
      const np = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
      this.vel = [(np[0] - this.pos[0]) / dt, (np[1] - this.pos[1]) / dt, (np[2] - this.pos[2]) / dt];
      this.pos = np;
      if (t >= 1) {
        this.mantle = null;
        this.vel = m.out.slice();
        this.categorize();
        if (this.onGround) this.vel[1] = 0;
      }
    }

    // ---- ziplines: world.ziplines is a list of { a, b } cables, a the high
    // end. Pass your hands near one in the air and you grab it, then ride it
    // down, picking up speed. Jump to let go with a hop, crouch to drop, or
    // ride off the end and keep the speed.

    tryZip() {
      const zl = this.world.ziplines;
      if (!zl || !zl.length || this.onGround || this.zipCooldown > 0 || this.climb) return false;
      const c = this.cfg, h = [this.pos[0], this.pos[1] + c.zipHang, this.pos[2]];
      for (const z of zl) {
        const d = [z.b[0] - z.a[0], z.b[1] - z.a[1], z.b[2] - z.a[2]], L2 = dot(d, d);
        if (L2 < 1) continue;
        // not the cable you just let go of, until you've touched down: a hop
        // off it would otherwise fall straight back onto it
        const last = this.zipLast;
        if (last && last.a.every((v, k) => v === z.a[k]) && last.b.every((v, k) => v === z.b[k])) continue;
        const t = dot([h[0] - z.a[0], h[1] - z.a[1], h[2] - z.a[2]], d) / L2;
        if (t < 0.01 || t > 0.95) continue;
        const q = [z.a[0] + d[0] * t, z.a[1] + d[1] * t, z.a[2] + d[2] * t];
        const dist = Math.hypot(h[0] - q[0], h[1] - q[1], h[2] - q[2]);
        // a little more reach below the cable, where your arms are
        if (dist > c.zipReach + (h[1] < q[1] ? 14 : 0)) continue;
        const L = Math.sqrt(L2), dir = [d[0] / L, d[1] / L, d[2] / L];
        const to = [q[0], q[1] - c.zipHang, q[2]];
        const tr = this.trace(this.pos, to);
        if (tr.startsolid || tr.fraction < 1) continue;
        this.pos = to;
        this.zip = { z, dir, L, t, speed: Math.min(c.zipMaxSpeed, Math.max(c.zipMinSpeed, dot(this.vel, dir))), time: 0 };
        if (this.wallrun) this.endWallrun(0.2);
        if (this.slide) this.endSlide();
        this.onGround = false;
        this.events.push({ type: 'zip' });
        return true;
      }
      return false;
    }

    endZip(cooldown) {
      this.zipLast = { a: this.zip.z.a, b: this.zip.z.b };
      this.zip = null;
      this.zipCooldown = cooldown;
      this.climbAvailable = true;
      this.lastWall = null;
      this.events.push({ type: 'zipoff' });
    }

    zipMove(cmd, dt) {
      const c = this.cfg, Z = this.zip, dir = Z.dir;
      Z.time += dt;
      const ride = () => { this.vel = [dir[0] * Z.speed, dir[1] * Z.speed, dir[2] * Z.speed]; };
      if (this.jumpPressed && Z.time > 0.08) {
        ride();
        this.vel[1] = Math.max(this.vel[1], 0) + c.zipJump;
        this.endZip(0.35);
        this.events.push({ type: 'jump', speed: this.hspeed() });
        this.tryPlayerMove(dt);
        this.categorize();
        return;
      }
      if (cmd.duck && !this.prevDuck) { ride(); this.endZip(0.5); this.tryPlayerMove(dt); this.categorize(); return; }
      // gravity along the cable, less a little drag
      Z.speed = Math.min(c.zipMaxSpeed, Math.max(c.zipMinSpeed * 0.5, Z.speed - c.gravity * dir[1] * dt - Z.speed * 0.04 * dt));
      Z.t += Z.speed * dt / Z.L;
      const end = Z.t >= 1;
      const z = Z.z, t = Math.min(1, Z.t);
      const to = [z.a[0] + (z.b[0] - z.a[0]) * t, z.a[1] + (z.b[1] - z.a[1]) * t - c.zipHang, z.a[2] + (z.b[2] - z.a[2]) * t];
      const tr = this.trace(this.pos, to);
      if (!tr.startsolid) this.pos = tr.endpos;
      ride();
      if (end || tr.fraction < 1) {
        // off the end (or into something): keep the speed and fly on
        if (tr.fraction < 1) this.vel = [this.vel[0] * 0.5, Math.max(0, this.vel[1]), this.vel[2] * 0.5];
        this.endZip(0.5);
        this.categorize();
      }
    }

    triggersTouching() {
      const h = this.hull, p = this.pos, out = [];
      for (const t of this.world.triggers) {
        if (p[0] + h.max[0] < t.min[0] || p[0] + h.min[0] > t.max[0]) continue;
        if (p[1] + h.max[1] < t.min[1] || p[1] + h.min[1] > t.max[1]) continue;
        if (p[2] + h.max[2] < t.min[2] || p[2] + h.min[2] > t.max[2]) continue;
        out.push(t);
      }
      return out;
    }
  }

  root.StrafePhysics = { World, Player, DEFAULTS, HULL_STAND, HULL_DUCK, EYE_STAND, EYE_DUCK, DIST_EPS };
})(typeof window !== 'undefined' ? window : globalThis);
