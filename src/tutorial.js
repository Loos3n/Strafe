// Strafe tutorial goals: what each station asks you to do, tracked live from
// your input, movement and events. Plain logic with no page in it, so the bot
// test runs the same goals the game does; game.js draws the card, opens the
// gates and sends you back to the start of a station you skipped.
(function () {
  // tasks: [id, label, need, format]; format says how progress reads on the card
  // say: tips the goal can show, keyboard text with {key} names, then the touch text
  const GOALS = {
    move: {
      gate: 'move',
      tasks: [['look', 'Look around with the mouse', 1, 'bar'], ['run', 'Run forward', 1, 'bar'], ['side', 'Sidestep left and right', 2, 'count']],
      tick(s, p, cmd) {
        if (s.yaw0 !== undefined) s.turn += Math.abs(cmd.yaw - s.yaw0) + Math.abs(cmd.pitch - s.pitch0);
        s.yaw0 = cmd.yaw; s.pitch0 = cmd.pitch;
        set(s, 'look', s.turn / 2.4);
        if (cmd.forward > 0 && p.hspeed() > 150) set(s, 'run', s.have.run + 1 / 40);
        if (cmd.side < 0) s.left++;
        if (cmd.side > 0) s.right++;
        set(s, 'side', (s.left > 12) + (s.right > 12));
      },
      stuck: ['Turn the camera with the mouse, run with {forward}, sidestep with {left} and {right}. The gate opens when all three are ticked.',
        'Drag on the right to look, push the stick to run and sidestep. The gate opens when all three are ticked.'],
    },
    jump: {
      tasks: [['jump', 'Jump the gap', 1, 'check']],
      fall: ['Jump just before the edge, with {forward} held so you carry speed over.', 'Tap Jump just before the edge, with the stick pushed up.'],
      skip: ['Jump this one with {jump}.', 'Tap Jump to clear this one.'],
    },
    bhop: {
      tasks: [['hops', 'Chain hops without stopping', 3, 'count']],
      tick(s, p, cmd, events) {
        for (const e of events) if (e.type === 'jump') {
          // jumping within a few ticks of touching down keeps the chain going
          s.streak = s.ground <= 10 ? s.streak + 1 : 0;
          set(s, 'hops', Math.max(s.have.hops, s.streak));
        }
        s.ground = p.onGround ? s.ground + 1 : 0;
        if (s.ground === 16 && s.streak > 0 && !s.isDone) { s.streak = 0; s.say = 'stop'; }
      },
      say: { stop: ['Chain broken: you stood on the ground. Keep {jump} held through the landing.', 'Chain broken: you stood on the ground. Keep Jump held through the landing.'] },
      fall: ['Keep {jump} held the whole way and you hop the moment you land.', 'Keep Jump held the whole way and you hop the moment you land.'],
      skip: ['You stopped between jumps. Hold {jump} through every landing so the hops chain.', 'You stopped between jumps. Hold Jump through every landing so the hops chain.'],
    },
    strafe: {
      gate: 'strafe',
      tasks: [['speed', 'Reach 350 u/s', 350, 'speed']],
      tick(s, p, cmd) {
        set(s, 'speed', Math.max(s.have.speed, p.hspeed()));
        // strafing only works in the air: say so if they run about on the floor
        if (p.onGround) s.ground++; else { s.ground = 0; s.air++; }
        if (cmd.forward > 0 && !p.onGround && cmd.side) s.wAir++;
        if (s.wAir === 40) s.say = 'w';
        else if (s.ground === 150 && !s.isDone) s.say = s.air ? 'air' : 'jump';
      },
      say: {
        w: ['Let go of {forward} in the air. Strafe with {left} or {right} alone.', 'Let go of the stick in the air. Hold Jump and swipe on it.'],
        air: ['Strafing only adds speed in the air. Keep hopping with {jump} held while you turn.', 'Strafing only adds speed in the air. Keep Jump held while you swipe.'],
        jump: ['Start hopping: hold {jump}, let go of {forward}, then turn with {left} or {right}.', 'Hold Jump, then swipe left and right on it.'],
      },
      stuck: ['Small smooth turns win. Swing the mouse right with {right} held, then left with {left}, like carving an S.',
        'Small smooth swipes win: right, then left, like carving an S.'],
    },
    slide: {
      tasks: [['slide', 'Slide', 1, 'check'], ['under', 'Get under the pipe', 1, 'check']],
      tick(s, p) { if (s.zUnder !== undefined && p.pos[2] < s.zUnder) set(s, 'under', 1); },
      on: { slide: (s) => set(s, 'slide', 1) },
      skip: ['That was a crouch walk. Get running first, then press {duck} to slide.', 'That was a crouch walk. Get running first, then tap Crouch to slide.'],
      stuck: ['Back up, run at the pipe, and press {duck} a few steps before it.', 'Back up, run at the pipe, and tap Crouch a few steps before it.'],
    },
    vault: {
      tasks: [['vault', 'Vault the low wall', 1, 'check']],
      on: { vault: (s) => set(s, 'vault', 1), mantle: (s) => set(s, 'vault', 1) },
      skip: ['That was a jump, not a vault. Run into the wall and press {jump} as you reach it.', 'That was a jump, not a vault. Run into the wall and tap Jump as you reach it.'],
    },
    mantle: {
      tasks: [['climb', 'Run up the wall', 1, 'check'], ['top', 'Pull onto the ledge', 1, 'check']],
      tick(s, p) { if (s.have.climb && p.onGround && p.pos[1] > s.yTop) set(s, 'top', 1); },
      on: { climb: (s) => set(s, 'climb', 1), mantle: (s) => { set(s, 'climb', 1); set(s, 'top', 1); } },
      stuck: ['Run straight at the red strip, not at an angle, and press {jump} at the wall. Keep {forward} held.',
        'Run straight at the red strip and tap Jump at the wall. Keep the stick pushed up.'],
    },
    wallrun: {
      tasks: [['run', 'Run along the wall', 1, 'check'], ['kick', 'Kick off it (bonus)', 1, 'check']],
      on: { wallrun: (s) => set(s, 'run', 1), walljump: (s) => { if (s.have.run) set(s, 'kick', 1); } },
      need: ['run'], // kicking off is the bonus: landing off the wall still passes
      fall: ['Jump toward a side wall at a slight angle, with {forward} held, and you run along it.', 'Jump toward a side wall at a slight angle, with the stick pushed up.'],
      skip: ['You jumped it. Run along the wall this time.', 'You jumped it. Run along the wall this time.'],
    },
    surf: {
      tasks: [['ride', 'Ride the ramp', 0.6, 'sec']],
      tick(s, p, cmd, events, env) {
        const on = !p.onGround && env.surfing;
        if (on) set(s, 'ride', s.have.ride + env.dt);
        if (on && cmd.forward > 0) s.wRamp++;
        if (s.wRamp === 25) s.say = 'w';
      },
      say: { w: ['Let go of {forward} on the ramp. It pulls you off the slope.', 'Let the stick go up: push it sideways toward the ramp only.'] },
      fall: ['Hold the key toward the ramp: {left} if it is on your left, {right} if it is on your right.', 'Push the stick toward the ramp and keep it there.'],
    },
  };
  function set(s, id, v) {
    const t = s.tasks.find(t => t.id === id);
    if (!t) return;
    s.have[id] = v;
    t.ok = v >= t.need - 1e-6;
  }

  function create() {
    const T = { step: -1, s: null, fails: 0, retries: 0 };
    // a fresh attempt at the current station
    T.attempt = function (keep) {
      const id = T.goal, g = GOALS[id];
      const old = T.s;
      T.s = { have: {}, tasks: g.tasks.map(([id, label, need, fmt]) => ({ id, label, need, fmt, ok: false })),
        turn: 0, left: 0, right: 0, streak: 0, ground: 0, air: 0, wAir: 0, wRamp: 0, t: 0, isDone: false, say: null, zUnder: T.zUnder, yTop: T.yTop };
      for (const t of T.s.tasks) T.s.have[t.id] = 0;
      // moves you have already shown stay ticked
      if (keep && old) for (const t of T.s.tasks) if (old.tasks.find(o => o.id === t.id && o.ok)) set(T.s, t.id, t.need);
    };
    T.enter = function (idx, step) {
      T.step = idx; T.goal = step.done; T.fails = 0;
      T.zUnder = step.zUnder; T.yTop = step.yTop;
      T.s = null; T.attempt();
    };
    T.done = () => !!T.s && T.s.isDone;
    // runs once per tick with that tick's events; true on the tick the station is passed
    T.tick = function (p, cmd, events, env) {
      if (!T.s || T.s.isDone) return false;
      const g = GOALS[T.goal], s = T.s;
      s.t += env.dt;
      if (g.on) for (const e of events) if (g.on[e.type]) g.on[e.type](s);
      if (T.goal === 'jump') for (const e of events) if (e.type === 'jump') set(s, 'jump', 1);
      if (g.tick) g.tick(s, p, cmd, events, env);
      const need = g.need || s.tasks.map(t => t.id);
      if (need.every(id => s.tasks.find(t => t.id === id).ok)) { s.isDone = true; return true; }
      return false;
    };
    // fell in: same station, start the attempt over
    T.fell = function () { if (!T.s || T.s.isDone) return null; T.retries++; T.attempt(true); return GOALS[T.goal].fall ? 'fall' : null; };
    // walked into the next station without the move: go back, unless it has beaten you twice
    T.skipped = function () {
      if (!T.s || T.s.isDone) return null;
      T.fails++; T.retries++;
      if (!GOALS[T.goal].skip || T.fails > 2) return 'pass';
      T.attempt(true);
      return 'skip';
    };
    T.stuck = () => !!T.s && !T.s.isDone && GOALS[T.goal].stuck && T.s.t > 14;
    // the tip text for a message id: [keyboard, touch]
    T.text = function (id) {
      const g = GOALS[T.goal];
      if (!g) return null;
      return id === 'fall' || id === 'skip' || id === 'stuck' ? g[id] : g.say && g.say[id];
    };
    T.gate = () => GOALS[T.goal] && GOALS[T.goal].gate;
    return T;
  }
  const gates = Object.values(GOALS).map(g => g.gate).filter(Boolean);
  const api = { create, GOALS, gates };
  if (typeof module !== 'undefined') module.exports = api;
  (typeof window !== 'undefined' ? window : globalThis).StrafeTutorial = api;
})();
