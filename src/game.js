// Strafe: rendering, input, HUD and the fixed-timestep loop.
(function () {
  'use strict';
  const P = window.StrafePhysics;
  const A = window.StrafeAudio;
  const DEG = Math.PI / 180;

  // ------------------------------------------------------------ settings
  const SETTINGS_KEY = 'strafe.settings.v1';
  const BEST_KEY = 'strafe.best.v1';
  // phones and tablets get touch controls; the desktop app and mouse play never do (?touch=1 forces it for testing)
  const TOUCH = /[?&]touch=1/.test(location.search) || (!/Electron/.test(navigator.userAgent) && navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches);
  const settings = Object.assign({
    sens: 2.0, fov: 90, airaccelerate: 150, autohop: true,
    fovKick: true, shadows: true, bob: true, keys: true, body: true, ghost: true,
    speedLines: true, landKick: true, scale: 100, fps: false, strafeMeter: true,
    master: 80, music: 50, sfx: 80, padSens: 1, padAutoStrafe: true, padInvert: false,
    colors: 'standard', roll: 100, flip: true, flash: true, hudSize: 100,
  }, TOUCH ? { lookSens: 1, autoStrafe: true, scale: 70, shadows: false } : {}, load(SETTINGS_KEY) || {});
  const best = load(BEST_KEY) || {};
  // ------------------------------------------------------------ story
  // A short courier campaign over the existing levels. Each job has a
  // briefing, a debrief and two time targets (seconds) for the second and
  // third star; finishing at all earns the first. The prologue has no stars.
  const STORY_KEY = 'strafe.story.v1';
  const STORY = [
    { course: 'tutorial', title: 'First Day',
      brief: 'Mercer: "Nobody runs for me until I have seen them move. The training yard is quiet this time of night. Show me every trick in the book, then we talk work."',
      debrief: 'Mercer: "Not bad, Kite. Not good either. Go home, get some sleep. Tomorrow you carry something real."' },
    { course: 'roofs', title: 'The Drop', stars: [68, 95],
      brief: 'Mercer: "First job is easy money. A sealed drive goes from a rooftop letterbox to a contact three corners away. Don\'t open it. Don\'t lose it. Don\'t be seen."',
      debrief: 'The contact is a woman in a grey coat who calls herself Juno. She checks the seal twice before she pays. Mercer: "Clients who check seals have something to hide. Not our problem."' },
    { course: 'bhop', title: 'Foundry', stars: [50, 72],
      brief: 'Mercer: "Juno wants another package moved, through the old foundry. The floor runs hot, so don\'t touch it. Keep hopping and keep your speed."',
      debrief: 'Halfway across the foundry you hear radios below. Blues, city security, sweeping the yard. Mercer: "Coincidence. Probably."' },
    { course: 'surf', title: 'Spillway', stars: [56, 80],
      brief: 'Mercer: "The Blues have the bridges watched. Only way across the reservoir tonight is down the spillway ramps. Ride the slopes, don\'t fall in."',
      debrief: 'Juno is waiting at the far bank. "They know a runner is moving my drives," she says. "Keep going, Kite. Two more and it is done."' },
    { course: 'crossover', title: 'Shortcut', stars: [58, 83],
      brief: 'Mercer: "Juno is paying double for speed. Roof, ramp, blocks, wall. One line, no stopping. I want you there before the Blues finish their shift change."',
      debrief: 'You make the handoff with seconds to spare. On the way out you see the drive\'s label in the streetlight: "CITY WATER AUTHORITY, AUDIT, DO NOT COPY".' },
    { course: 'downtown', title: 'Courier', stars: [70, 100],
      brief: 'Mercer: "Big one. Pick up from an office tower downtown, out through the lightwell, over the construction site. The Blues have a drone over the crane, so be quick on the jib."',
      debrief: 'The drone tracks you to the alley before losing you. Mercer goes quiet on comms for a long time. Then: "Kite. Juno is a journalist. And now we are part of her story."' },
    { course: 'canyon', title: 'The Cut', stars: [55, 80],
      brief: 'Mercer: "The Blues locked down downtown. We go around, down the storm cut on the east side. Carve the banks and don\'t stop until you hit the bottom."',
      debrief: 'Juno takes the drive and gives you a name for the first time: Director Vale, head of the Water Authority. "He sold the reservoir and faked the audits. These drives prove it."' },
    { course: 'stairway', title: 'Stairwell', stars: [48, 70],
      brief: 'Mercer: "Juno\'s safe house is compromised. Her backup copy is at the top of the old stair blocks. Climb, turn, and don\'t miss a step."',
      debrief: 'The backup is still there. So is a note, in neat handwriting: "We know who you are, runner." Mercer: "Then we finish this fast."' },
    { course: 'freerun', title: 'Heat', stars: [56, 80],
      brief: 'Mercer: "They are on you, Kite. Blues on the roofs behind you. Lose them across the old district. Every wall, every gap. Don\'t look back."',
      debrief: 'You lose the last of them in the ventilation stacks. Juno on comms: "The newsroom will run the story if we get the originals to the Spire by morning."' },
    { course: 'cascade', title: 'Floodgates', stars: [22, 32],
      brief: 'Mercer: "Vale opened the floodgates to cut the city in half. The only way north is the overflow ramps. Nine of them. Keep your line."',
      debrief: 'The water roars under you the whole way down. On the far side the Spire is lit up like a beacon, and so are the Blue patrols around it.' },
    { course: 'spire', title: 'The Spire', stars: [55, 80],
      brief: 'Juno: "The newsroom is at the top of the Spire. No stairs, no lifts, just the old block columns. Get the originals up there, Kite. Everything rides on this."',
      debrief: 'The editor takes the drives from your hands as the sun comes up. By noon every screen in the city shows Director Vale\'s face. Mercer: "Take a week off, Kite. Then I have another job for you."' },
  ];
  const storyProgress = load(STORY_KEY) || {};
  // checkpoint times from each level's best run, keyed by checkpoint index
  const SPLITS_KEY = 'strafe.splits.v1';
  const bestSplits = load(SPLITS_KEY) || {};
  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  // Levels whose layout changed enough that old times no longer compare. Each
  // reset drops their times and ghosts once; stars already earned stay. The
  // suffix is the leaderboard field they post under now.
  const REBUILT = { surf: '_v3', bhop: '_v3', canyon: '_v3', stairway: '_v3', crossover: '_v4', cascade: '_v6', g1: '_v2', g2: '_v2', g3: '_v2', g4: '_v2', g5: '_v2', g6: '_v2', n1: '_v2', n2: '_v2', n3: '_v2', n4: '_v2', n5: '_v2', n6: '_v2' };
  const RESETS = [['strafe.rebuild.v2', ['surf', 'bhop', 'canyon', 'stairway', 'crossover']],
    ['strafe.rebuild.v3', ['surf', 'canyon', 'crossover', 'cascade']], ['strafe.rebuild.v4', ['cascade']], ['strafe.rebuild.v5', ['cascade']], ['strafe.rebuild.v6', ['cascade']],
    ['strafe.rebuild.v7', ['bhop', 'stairway', 'crossover', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6']]];
  for (const [flag, list] of RESETS) {
    if (load(flag)) continue;
    for (const c of list) {
      delete best[c]; delete bestSplits[c];
      try { localStorage.removeItem('strafe.ghost.v1.' + c); } catch (e) { /* storage blocked */ }
    }
    save(BEST_KEY, best); save(SPLITS_KEY, bestSplits); save(flag, 1);
  }

  // ------------------------------------------------------------ world
  const map = window.StrafeMap.buildMap(P);
  const world = map.world;
  const player = new P.Player(world, { airaccelerate: settings.airaccelerate, autohop: settings.autohop });
  const TICK = 1 / player.cfg.tickrate;

  // ------------------------------------------------------------ three
  const canvas = document.getElementById('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // render scale trades sharpness for frame rate
  const applyScale = () => renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * settings.scale / 100);
  applyScale();
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = settings.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const HORIZON = new THREE.Color(0xcfe3ef);
  scene.fog = new THREE.Fog(HORIZON, 4000, 26000);

  const camera = new THREE.PerspectiveCamera(74, 1, 4, 80000); // near 4: the eye never gets closer to a wall than the hull's 16
  camera.rotation.order = 'YXZ';

  // sky dome
  const sunDir = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(60000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sun: { value: sunDir }, zenith: { value: new THREE.Color(0x3d8fd6) }, horizon: { value: HORIZON }, ground: { value: new THREE.Color(0xb9c9d3) },
        cloud: { value: new THREE.Color(0xfffdf7) }, night: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform vec3 sun; uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground; uniform vec3 cloud; uniform float night; varying vec3 vDir;',
        'void main(){ float h = vDir.y;',
        ' vec3 c = h > 0.0 ? mix(horizon, zenith, pow(h, 0.55)) : mix(horizon, ground, pow(-h, 0.4));',
        ' float s = max(dot(vDir, sun), 0.0);',
        // soft fair-weather clouds, flattened toward the horizon
        ' if (h > 0.0) { vec2 q = vDir.xz / (h + 0.12) * 1.6; float n = 0.0, a = 0.5;',
        '   for (int i = 0; i < 5; i++) { n += a * (sin(q.x * 1.7 + sin(q.y * 1.3)) * cos(q.y * 1.9 + sin(q.x * 0.7)) * 0.5 + 0.5); q = mat2(1.6, 1.2, -1.2, 1.6) * q; a *= 0.5; }',
        '   float cl = smoothstep(0.55, 0.78, n) * smoothstep(0.0, 0.18, h);',
        // at night: stars on a fine grid, faded out low down and behind the clouds
        '   if (night > 0.0) { vec3 g = floor(vDir * 420.0); float r = fract(sin(dot(g, vec3(12.9898, 78.233, 37.719))) * 43758.5453);',
        '     c += vec3(0.9, 0.95, 1.0) * step(0.9965, r) * (r - 0.9965) * 300.0 * smoothstep(0.05, 0.35, h) * (1.0 - cl) * night; }',
        '   c = mix(c, cloud, cl * 0.85); }',
        ' c += mix(vec3(1.0,0.95,0.85), vec3(0.85,0.9,1.0), night) * (pow(s, 900.0) * 1.4 + pow(s, 12.0) * 0.18 * (1.0 - night * 0.6));',
        ' gl_FragColor = vec4(c, 1.0); }',
      ].join('\n'),
    }));
  sky.renderOrder = -1;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xe6f2ff, 0x8a8f99, 0.72);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff6e8, 0.95);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -2600; sc.right = 2600; sc.top = 2600; sc.bottom = -2600; sc.near = 10; sc.far = 12000;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 1.5;
  scene.add(sun, sun.target);

  // ------------------------------------------------------------ world materials
  // Everything is procedural: canvas textures tiled in world space (256 units
  // per tile), PBR materials lit by the sky, and a few visual-only props.
  let seedR = 1337;
  const rand = () => ((seedR = (seedR * 16807) % 2147483647) / 2147483647);
  function canvasTex(size, draw, srgb = true) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (srgb) t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function speckle(g, s, n, a, dark = true) {
    for (let i = 0; i < n; i++) {
      const v = dark ? 0 : 255;
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (rand() * a).toFixed(3) + ')';
      const r = 1 + rand() * 2;
      g.fillRect(rand() * s, rand() * s, r, r);
    }
  }
  function blotches(g, s, n, a) {
    for (let i = 0; i < n; i++) {
      const x = rand() * s, y = rand() * s, r = 20 + rand() * 90;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(40,46,52,' + (rand() * a).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(40,46,52,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  const TEX = {
    // poured concrete with 64 unit cells, still readable as a speed grid
    concrete: canvasTex(512, (g, s) => {
      g.fillStyle = '#f4f4f1'; g.fillRect(0, 0, s, s);
      blotches(g, s, 30, 0.05); speckle(g, s, 5000, 0.07);
      g.fillStyle = 'rgba(20,30,40,0.07)';
      for (let i = 1; i < 4; i++) { g.fillRect(i * 128 - 1, 0, 2, s); g.fillRect(0, i * 128 - 1, s, 2); }
      g.fillStyle = 'rgba(20,30,40,0.16)'; g.fillRect(0, 0, 3, s); g.fillRect(0, 0, s, 3);
    }),
    // office facade: two floors and two bays per tile, dark glazing in white frames
    facade: canvasTex(512, (g, s) => {
      g.fillStyle = '#f2f1ec'; g.fillRect(0, 0, s, s);
      speckle(g, s, 2500, 0.06);
      for (let fy = 0; fy < 2; fy++) for (let fx = 0; fx < 2; fx++) {
        const x = fx * 256 + 26, y = fy * 256 + 40, w = 204, h = 172;
        const gr = g.createLinearGradient(0, y, 0, y + h);
        const lit = rand() < 0.2;
        gr.addColorStop(0, lit ? '#9fb3c2' : '#7f97aa'); gr.addColorStop(0.55, lit ? '#5f7586' : '#3d5163'); gr.addColorStop(1, '#2c3a47');
        g.fillStyle = gr; g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.beginPath(); g.moveTo(x + w * 0.15, y); g.lineTo(x + w * 0.45, y); g.lineTo(x + w * 0.1, y + h); g.lineTo(x - w * 0.2 < x ? x : x, y + h); g.closePath(); g.fill();
        g.fillStyle = '#d9dad5'; g.fillRect(x + w / 2 - 3, y, 6, h); g.fillRect(x, y + h * 0.62, w, 5);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, y + h, w, 6);
      }
      g.fillStyle = 'rgba(20,30,40,0.12)'; g.fillRect(0, 0, s, 3); g.fillRect(0, 256, s, 3);
    }),
    // curtain wall: tall panes with thin mullions and a little variation
    glass: canvasTex(512, (g, s) => {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const v = 200 + rand() * 40;
        const gr = g.createLinearGradient(0, j * 128, 0, j * 128 + 128);
        gr.addColorStop(0, 'rgb(' + (v + 15 | 0) + ',' + (v + 20 | 0) + ',' + (v + 25 | 0) + ')'); gr.addColorStop(1, 'rgb(' + (v - 40 | 0) + ',' + (v - 30 | 0) + ',' + (v - 20 | 0) + ')');
        g.fillStyle = gr; g.fillRect(i * 128, j * 128, 128, 128);
      }
      g.fillStyle = '#5e6c78';
      for (let i = 0; i < 4; i++) { g.fillRect(i * 128, 0, 5, s); g.fillRect(0, i * 128, s, 4); }
    }),
    // surf ramps: clean panels with soft lengthwise streaks and seams
    ramp: canvasTex(512, (g, s) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 16; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.1 + rand() * 0.2).toFixed(2) + ')'; g.fillRect(0, i * 32, s, 10 + rand() * 12); }
      g.fillStyle = 'rgba(10,20,40,0.05)'; for (let i = 0; i < 8; i++) g.fillRect(0, i * 64 + 30, s, 2);
      g.fillStyle = 'rgba(10,20,40,0.22)'; g.fillRect(0, 0, s, 4); g.fillRect(0, 0, 4, s);
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(0, 5, s, 2);
    }),
    // panels for blocks and pads, mapped once per face
    panel: canvasTex(256, (g, s) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
      speckle(g, s, 900, 0.06);
      g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 6; g.strokeRect(6, 6, s - 12, s - 12);
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3; g.strokeRect(13, 13, s - 26, s - 26);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      for (const [x, y] of [[22, 22], [s - 22, 22], [22, s - 22], [s - 22, s - 22]]) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
    }),
    // painted steel for the red route pieces
    paint: canvasTex(256, (g, s) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
      speckle(g, s, 600, 0.08);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, s, 3); g.fillRect(0, 0, 3, s);
    }),
    asphalt: canvasTex(512, (g, s) => {
      g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, s, s);
      speckle(g, s, 14000, 0.25); speckle(g, s, 4000, 0.2, false); blotches(g, s, 20, 0.12);
    }),
    rock: canvasTex(512, (g, s) => {
      g.fillStyle = '#f0ece6'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(60,50,40,' + (rand() * 0.12).toFixed(3) + ')'; g.fillRect(0, rand() * s, s, 2 + rand() * 14); }
      blotches(g, s, 40, 0.15); speckle(g, s, 6000, 0.12);
    }),
  };
  // rippled water normals
  const waterNormal = canvasTex(256, (g, s) => {
    const img = g.createImageData(s, s), h = new Float32Array(s * s);
    const waves = Array.from({ length: 9 }, () => ({ kx: Math.round(1 + rand() * 6) * (rand() < 0.5 ? -1 : 1), ky: Math.round(1 + rand() * 6), p: rand() * 6.28, a: 0.3 + rand() }));
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      let v = 0; for (const w of waves) v += w.a * Math.sin((w.kx * x + w.ky * y) / s * 6.2832 + w.p);
      h[y * s + x] = v;
    }
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const dx = h[y * s + (x + 1) % s] - h[y * s + (x + s - 1) % s], dy = h[((y + 1) % s) * s + x] - h[((y + s - 1) % s) * s + x];
      const i = (y * s + x) * 4;
      img.data[i] = 128 - dx * 22; img.data[i + 1] = 128 - dy * 22; img.data[i + 2] = 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, false);
  // reflections: a painted sky panorama, prefiltered for rough and glossy surfaces
  let envMap = null;
  {
    const eq = canvasTex(256, (g, s) => {
      const gr = g.createLinearGradient(0, 0, 0, s);
      gr.addColorStop(0, '#3d8fd6'); gr.addColorStop(0.42, '#a9cde6'); gr.addColorStop(0.5, '#dfeaf1'); gr.addColorStop(0.56, '#b9c9d3'); gr.addColorStop(1, '#8e9aa3');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 26; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.2 + rand() * 0.3).toFixed(2) + ')'; g.beginPath(); g.ellipse(rand() * s, s * (0.18 + rand() * 0.26), 10 + rand() * 30, 3 + rand() * 6, 0, 0, 7); g.fill(); }
    });
    eq.mapping = THREE.EquirectangularReflectionMapping;
    {
      const pm = new THREE.PMREMGenerator(renderer);
      envMap = pm.fromEquirectangular(eq).texture;
      pm.dispose();
    }
  }
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, envMap, envMapIntensity: 0.4, roughness: 0.85, metalness: 0 }, o));
  const MATS = {
    concrete: std({ map: TEX.concrete }),
    facade: std({ map: TEX.facade, roughness: 0.6, envMapIntensity: 0.8 }),
    glass: std({ map: TEX.glass, roughness: 0.18, metalness: 0.35, envMapIntensity: 1.1 }),
    ramp: std({ map: TEX.ramp, roughness: 0.4, metalness: 0.05, envMapIntensity: 0.45 }),
    panel: std({ map: TEX.panel, roughness: 0.55, envMapIntensity: 0.3 }),
    paint: std({ map: TEX.paint, roughness: 0.5, envMapIntensity: 0.3, emissive: 0xb3120a, emissiveIntensity: 0.15 }),
    asphalt: std({ map: TEX.asphalt, roughness: 0.95 }),
    rock: std({ map: TEX.rock, roughness: 0.95 }),
  };
  // night: lit windows (emissive maps matching the facade and curtain wall
  // layouts) and neon pieces that glow in their own colour
  {
    let sd = 4242;
    const rn = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const warm = () => ['#ffd9a0', '#ffe8c4', '#fff4e0', '#bfe4ff', '#ffc98a'][(rn() * 5) | 0];
    const winF = canvasTex(512, (g, s) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
      for (let fy = 0; fy < 2; fy++) for (let fx = 0; fx < 2; fx++) {
        if (rn() < 0.72) continue;
        const x = fx * 256 + 26, y = fy * 256 + 40, w = 204, h = 172;
        g.globalAlpha = 0.55 + rn() * 0.45; g.fillStyle = warm(); g.fillRect(x, y, w, h);
        g.globalAlpha = 1; g.fillStyle = '#000'; g.fillRect(x + w / 2 - 3, y, 6, h); g.fillRect(x, y + h * 0.62, w, 5);
      }
    });
    const winG = canvasTex(512, (g, s) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        if (rn() < 0.75) continue;
        g.globalAlpha = 0.35 + rn() * 0.5; g.fillStyle = warm(); g.fillRect(i * 128 + 5, j * 128 + 4, 123, 124);
      }
      g.globalAlpha = 1;
    });
    MATS.facade.emissiveMap = winF; MATS.facade.emissive.set(0x000000);
    MATS.glass.emissiveMap = winG; MATS.glass.emissive.set(0x000000);
    // neon: the emissive light takes the vertex colour, so each piece glows its own hue
    const neonMat = (o) => {
      const m = std(Object.assign({ emissive: 0xffffff, emissiveIntensity: 0.3 }, o));
      m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= vColor;'); };
      return m;
    };
    MATS.nramp = neonMat({ map: TEX.ramp, roughness: 0.35, metalness: 0.1, envMapIntensity: 0.45, emissiveIntensity: 0.38 });
    MATS.npanel = neonMat({ map: TEX.panel, roughness: 0.5, envMapIntensity: 0.3, emissiveIntensity: 0.22 });
  }
  // colour modes (Settings, Accessibility): the route pieces and the ahead
  // and behind colours on splits and the ghost gap
  const PALETTES = {
    standard: { route: 0xdb2f2a, glow: 0xb3120a },
    redgreen: { route: 0x1f6bff, glow: 0x0a3db3 },
    blueyellow: { route: 0xe0306a, glow: 0xa0103f },
    contrast: { route: 0xffd000, glow: 0xb38f00 },
  };
  const routeU = { value: new THREE.Color() };
  MATS.paint.onBeforeCompile = (sh) => {
    sh.uniforms.routeCol = routeU;
    sh.fragmentShader = 'uniform vec3 routeCol;\n' + sh.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.rgb *= routeCol;');
  };
  function applyColors() {
    const p = PALETTES[settings.colors] || PALETTES.standard;
    routeU.value.setHex(p.route).convertSRGBToLinear();
    MATS.paint.emissive.setHex(p.glow);
    document.body.dataset.colors = settings.colors;
  }
  applyColors();
  const GLASS_COLOR = map.COLORS.glass;
  // which material a face gets
  function bucketFor(b, n) {
    const k = b.props.kind, up = Math.abs(n[1]) > 0.5;
    if (b.props.neon) return k === 'ramp' ? 'nramp' : 'npanel';
    if (k === 'ramp') return 'ramp';
    if (k === 'cliff') return 'rock';
    if (k === 'route' || k === 'door') return 'paint';
    if (k === 'block' || k === 'lane') return 'panel';
    if (k === 'street') return 'asphalt';
    if (k === 'building' && !up) return b.props.color === GLASS_COLOR ? 'glass' : 'facade';
    return 'concrete';
  }

  // ------------------------------------------------------------ night
  // The Night City levels swap the daylight for a dark sky with stars, a
  // moon where the sun was, dim blue light, lit windows and neon.
  const DAY = { fog: 0xcfe3ef, near: 4000, far: 26000, zen: 0x3d8fd6, hor: 0xcfe3ef, gnd: 0xb9c9d3, cloud: 0xfffdf7, hs: 0xe6f2ff, hg: 0x8a8f99, hi: 0.72, sc: 0xfff6e8, si: 0.95, exp: 0.98 };
  const NIGHT = { fog: 0x0c1124, near: 2500, far: 21000, zen: 0x01030a, hor: 0x1b1f3d, gnd: 0x080a12, cloud: 0x161b30, hs: 0x5b6cab, hg: 0x2a1c34, hi: 0.2, sc: 0x9fb2ff, si: 0.12, exp: 1.0 };
  let nightOn = false;
  const envDay = new Map(Object.values(MATS).map(m => [m, m.envMapIntensity]));
  function setNight(on) {
    nightOn = on;
    const L = on ? NIGHT : DAY, u = sky.material.uniforms;
    scene.fog.color.set(L.fog); scene.fog.near = L.near; scene.fog.far = L.far;
    u.zenith.value.set(L.zen); u.horizon.value.set(L.hor); u.ground.value.set(L.gnd); u.cloud.value.set(L.cloud); u.night.value = on ? 1 : 0;
    hemi.color.set(L.hs); hemi.groundColor.set(L.hg); hemi.intensity = L.hi;
    sun.color.set(L.sc); sun.intensity = L.si;
    renderer.toneMappingExposure = L.exp;
    for (const [m, v] of envDay) m.envMapIntensity = v * (on ? 0.12 : 1);
    MATS.facade.emissive.set(on ? 0xb3b3b3 : 0x000000); MATS.glass.emissive.set(on ? 0x999999 : 0x000000);
    if (animated.lava) { animated.lava.uniforms.fogColor.value.set(L.fog); animated.lava.uniforms.fogNear.value = L.near; animated.lava.uniforms.fogFar.value = L.far; }
    if (body.setNight) body.setNight(on);
  }

  // ------------------------------------------------------------ grounding
  // Visual only: nothing here collides. Every level stands on something. A
  // ground city spreads out far below, anything with nothing under it gets a
  // column down to the ground, ramps get pylons, and water and lava sit in
  // basins instead of hanging in the air.
  const GROUND = -4000;
  const deco = new P.World();
  {
    const POINT = { min: [0, 0, 0], max: [0, 0, 0] };
    const below = (x, y, z) => { const t = world.trace([x, y, z], [x, GROUND, z], POINT); return t.fraction < 1 ? t.endpos[1] : null; };
    const pools = world.brushes.filter(b => b.props.water || b.props.lava);
    const poolBelow = (x, y, z) => { let top = null; for (const b of pools) if (x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2] && b.max[1] < y) top = Math.max(top === null ? -1e9 : top, b.max[1]); return top; };
    const isBox = (b) => b.faces.length === 6 && b.faces.every(f => Math.abs(f.n[0]) === 1 || Math.abs(f.n[1]) === 1 || Math.abs(f.n[2]) === 1);
    const STAND = new Set(['pad', 'block', 'lane', 'floor', 'street', 'building', 'cliff', 'wall']);
    const footprints = [];
    for (const b of world.brushes) {
      if (b.props.nonsolid && !(b.props.water || b.props.lava)) continue;
      footprints.push([b.min[0], b.min[2], b.max[0], b.max[2]]);
      if (b.min[1] <= GROUND + 1) continue;
      const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
      if (b.props.water || b.props.lava) {
        // a basin wall under the pool
        deco.addBox([b.min[0], GROUND, b.min[2]], [b.max[0], b.min[1], b.max[2]], { color: b.props.lava ? 0x4a4038 : 0xb9c0c6, kind: b.props.lava ? 'cliff' : 'building' });
        continue;
      }
      if (b.props.kind === 'ramp' && b.props.pylons) {
        // curved ramp pieces say where their pylon goes
        for (const [x, z] of b.props.pylons) {
          const up = world.trace([x, GROUND, z], [x, b.max[1] + 10, z], POINT);
          if (up.fraction === 1 || up.brush !== b) continue;
          const top = up.endpos[1], bot = below(x, top - 1, z) ?? GROUND;
          if (top - bot > 40) deco.addBox([x - 60, bot, z - 60], [x + 60, top, z + 60], { color: 0x3a3f4a, kind: 'wall' });
        }
        continue;
      }
      if (b.props.kind === 'ramp') {
        // pylons along the ridge, down to whatever is below
        const len = b.max[2] - b.min[2], n = Math.max(2, Math.round(len / 1400));
        for (let i = 0; i <= n; i++) {
          const z = b.min[2] + 200 + (len - 400) * i / n;
          const up = world.trace([cx, GROUND, z], [cx, b.max[1] + 10, z], POINT);
          if (up.fraction === 1 || up.brush !== b) continue;
          const top = up.endpos[1];
          const bot = Math.max(below(cx, top - 1, z) ?? GROUND, poolBelow(cx, top, z) ?? GROUND);
          if (top - bot > 40) deco.addBox([cx - 60, bot, z - 60], [cx + 60, top, z + 60], { color: 0xa9b0b6, kind: 'wall' });
        }
        continue;
      }
      if (!STAND.has(b.props.kind) || !isBox(b)) continue;
      // something solid under it already? then it is standing on that
      const pts = [[cx, cz], [b.min[0] + 4, b.min[2] + 4], [b.max[0] - 4, b.max[2] - 4]];
      if (pts.some(([x, z]) => below(x, b.min[1] - 1, z) !== null)) continue;
      deco.addBox([b.min[0], GROUND, b.min[2]], [b.max[0], b.min[1], b.max[2]], { color: b.props.color, kind: b.props.kind === 'building' || b.props.kind === 'street' ? 'building' : b.props.kind });
    }
    // the ground, and a low city spread over it
    deco.addBox([-160000, GROUND - 40, -160000], [360000, GROUND, 160000], { color: 0x5d646b, kind: 'street' });
    let seed = 99;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const clear = (a) => !footprints.some(q => a[0] < q[2] + 500 && a[2] > q[0] - 500 && a[1] < q[3] + 500 && a[3] > q[1] - 500);
    for (let x = -137200; x < 330000; x += 2200) {
      for (let z = -70000; z < 101000; z += 2200) {
        if (x >= 168000 && (z < -52000 || z > 40000)) continue; // the Night City district is narrower
        const w = 700 + rnd() * 1100, d = 700 + rnd() * 1100, h = 250 + rnd() * rnd() * 2600;
        const ax = x + rnd() * (2000 - w), az = z + rnd() * (2000 - d), glass = rnd() < 0.25;
        const a = [ax, az, ax + w, az + d];
        if (clear(a)) deco.addBox([a[0], GROUND, a[1]], [a[2], GROUND + h, a[3]], { color: glass ? 0x8fc4dd : 0xe4e2db, kind: 'building', lowcity: !glass });
      }
    }
  }

  // Boxes that overlap with a face in the same plane facing the same way
  // flicker (z-fighting): skyline towers built off one street line, deco
  // under a level, neighbours sharing a wall. Visual only: one box of each
  // such pair pulls that face in a little, picking the one you can't touch
  // (deco or skyline) when there is one, so collision still matches.
  let insets = null;
  function faceInsets() {
    if (insets) return insets;
    insets = new Map();
    const decoSet = new Set(deco.brushes);
    const loose = (b) => decoSet.has(b) || !!b.props.far;
    const vol = (q) => (q.max[0] - q.min[0]) * (q.max[1] - q.min[1]) * (q.max[2] - q.min[2]);
    const faces = [], buckets = new Map();
    for (const b of world.brushes.concat(deco.brushes)) {
      if (b.props.nonsolid) continue;
      for (const f of b.faces) {
        const n = f.n, d = n[0] * f.verts[0][0] + n[1] * f.verts[0][1] + n[2] * f.verts[0][2];
        const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
        for (const p of f.verts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
        const rec = { b, n, d, lo, hi }, nk = n.map(x => Math.round(x * 500)).join(',');
        const key = nk + ':' + Math.floor(d / 2);
        (buckets.get(key) || buckets.set(key, []).get(key)).push(rec);
        rec.nk = nk; rec.seq = faces.length; faces.push(rec);
      }
    }
    for (const fa of faces) {
      const near = buckets.get(fa.nk + ':' + (Math.floor(fa.d / 2) + 1));
      for (const list of [buckets.get(fa.nk + ':' + Math.floor(fa.d / 2)), near]) {
        if (!list) continue;
        for (const fb of list) {
          if (fb === fa || fb.b === fa.b || (list !== near && fb.seq <= fa.seq) || Math.abs(fa.d - fb.d) > 1.5) continue;
          let wide = 0, ok = true;
          for (let k = 0; k < 3; k++) { const ov = Math.min(fa.hi[k], fb.hi[k]) - Math.max(fa.lo[k], fb.lo[k]); if (ov < -1) ok = false; if (ov > 1) wide++; }
          if (!ok || wide < 2) continue;
          // pull in the face of the one you can't touch, else the smaller one
          const pick = loose(fa.b) !== loose(fb.b) ? (loose(fa.b) ? fa : fb) : vol(fa.b) < vol(fb.b) ? fa : fb;
          const amt = loose(pick.b) ? 14 : 2;
          const list2 = insets.get(pick.b) || insets.set(pick.b, []).get(pick.b);
          const prev = list2.find(q => q.f === pick);
          const lim = Math.min(...[0, 1, 2].map(k => pick.b.max[k] - pick.b.min[k]).filter(x => x > 1)) * 0.1;
          if (prev) prev.amt = Math.min(lim, Math.max(prev.amt, amt)); else list2.push({ f: pick, n: pick.n, d: pick.d, amt: Math.min(lim, amt) });
        }
      }
    }
    return insets;
  }
  function buildGeometry(filter, bucketOf) {
    const ins = faceInsets();
    const out = {};
    const color = new THREE.Color();
    const get = (name) => out[name] || (out[name] = { pos: [], nor: [], uv: [], col: [], lines: [] });
    for (const b of world.brushes.concat(deco.brushes)) {
      if (!filter(b)) continue;
      color.setHex(b.props.color || 0xffffff).convertSRGBToLinear();
      const y0 = b.min[1], hgt = Math.max(1, b.max[1] - b.min[1]);
      const inset = ins.get(b);
      for (const f of b.faces) {
        const n = f.n;
        let v = f.verts;
        if (inset) v = v.map(p => {
          let q = p;
          for (const { n: m, d, amt } of inset) if (Math.abs(m[0] * p[0] + m[1] * p[1] + m[2] * p[2] - d) < 0.5) q = [q[0] - m[0] * amt, q[1] - m[1] * amt, q[2] - m[2] * amt];
          return q;
        });
        const name = bucketOf ? bucketOf(b, n) : 'all';
        const o = get(name);
        const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
        let proj;
        if (name === 'panel') {
          // fit the panel texture to the face once
          let lo = [1e9, 1e9], hi = [-1e9, -1e9];
          const raw = ay >= ax && ay >= az ? (p) => [p[0], p[2]] : ax >= az ? (p) => [p[2], p[1]] : (p) => [p[0], p[1]];
          for (const p of v) { const t = raw(p); lo = [Math.min(lo[0], t[0]), Math.min(lo[1], t[1])]; hi = [Math.max(hi[0], t[0]), Math.max(hi[1], t[1])]; }
          const sx = hi[0] - lo[0] || 1, sy = hi[1] - lo[1] || 1;
          proj = (p) => { const t = raw(p); return [(t[0] - lo[0]) / sx, (t[1] - lo[1]) / sy]; };
        } else {
          proj = ay >= ax && ay >= az ? (p) => [p[0] / 256, p[2] / 256]
            : ax >= az ? (p) => [p[2] / 256, p[1] / 256] : (p) => [p[0] / 256, p[1] / 256];
        }
        const shade = n[1] > 0.5 ? 1.0 : n[1] < -0.5 ? 0.62 : 0.94;
        let verts = v;
        const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]];
        const e2 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
        const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
        if (cx * n[0] + cy * n[1] + cz * n[2] < 0) verts = v.slice().reverse();
        for (let i = 1; i < verts.length - 1; i++) {
          for (const p of [verts[0], verts[i], verts[i + 1]]) {
            o.pos.push(p[0], p[1], p[2]);
            o.nor.push(n[0], n[1], n[2]);
            const t = proj(p); o.uv.push(t[0], t[1]);
            // fake ambient occlusion: walls darken toward their foot
            let ao = 1;
            if (ay < 0.5) { const r = Math.min(1, (p[1] - y0) / Math.min(700, hgt)); ao = 0.6 + 0.4 * Math.sqrt(r); }
            o.col.push(color.r * shade * ao, color.g * shade * ao, color.b * shade * ao);
          }
        }
        for (let i = 0; i < v.length; i++) {
          const a = v[i], c2 = v[(i + 1) % v.length];
          o.lines.push(a[0], a[1], a[2], c2[0], c2[1], c2[2]);
        }
      }
    }
    const res = {};
    for (const [name, o] of Object.entries(out)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(o.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(o.col, 3));
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(o.lines, 3));
      res[name] = { g, lg };
    }
    return bucketOf ? res : (res.all || { g: new THREE.BufferGeometry(), lg: new THREE.BufferGeometry() });
  }

  const animated = { water: null, lava: null };
  {
    // the low city's plain blocks are drawn as models instead (see models below)
    const solid = buildGeometry(b => !b.props.nonsolid && !b.props.door && !b.props.lowcity, bucketFor);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x1b2530, transparent: true, opacity: 0.1 });
    for (const [name, part] of Object.entries(solid)) {
      const mesh = new THREE.Mesh(part.g, MATS[name]);
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
      if (name !== 'asphalt' && name !== 'rock') scene.add(new THREE.LineSegments(part.lg, edgeMat));
    }
    const water = buildGeometry(b => b.props.water);
    waterNormal.repeat.set(1 / 3, 1 / 3);
    const wm = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.86, roughness: 0.12, metalness: 0.1, envMap, envMapIntensity: 1.2, normalMap: waterNormal, normalScale: new THREE.Vector2(0.6, 0.6) });
    const wmesh = new THREE.Mesh(water.g, wm); wmesh.receiveShadow = true;
    scene.add(wmesh);
    animated.water = waterNormal;
    const lava = buildGeometry(b => b.props.lava);
    // lava: a dark crust broken by bright, slowly flowing cracks. Computed per
    // pixel in world space, so there is no texture to tile.
    const lavaMat = new THREE.ShaderMaterial({
      uniforms: { t: { value: 0 }, fogColor: { value: new THREE.Color(0xcfe3ef) }, fogNear: { value: scene.fog.near }, fogFar: { value: scene.fog.far } },
      toneMapped: false,
      vertexShader: 'varying vec3 vW; varying float vDepth; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: [
        'uniform float t; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; varying vec3 vW; varying float vDepth;',
        'float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
        'float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);',
        '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }',
        'float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return v; }',
        'void main(){',
        '  vec2 p = vW.xz / 1100.0;',
        '  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.04)), fbm(p + vec2(5.2, 1.3) - vec2(t * 0.03, 0.0)));',
        '  float n = fbm(p + 1.8 * q);',
        // a ridge where the warped field crosses 0.5 makes the cracks
        '  float r = 1.0 - abs(n * 2.0 - 1.0);',
        '  float crack = pow(r, 20.0), halo = pow(r, 6.0);',
        '  float grain = fbm(p * 6.0);',
        '  vec3 crust = mix(vec3(0.07, 0.02, 0.02), vec3(0.20, 0.05, 0.03), grain);',
        '  vec3 c = crust + vec3(0.85, 0.22, 0.03) * halo + vec3(1.0, 0.72, 0.30) * crack * 1.3;',
        '  c *= 0.92 + 0.08 * sin(t * 1.3 + n * 14.0);',
        '  float f = smoothstep(fogNear, fogFar, vDepth);',
        '  gl_FragColor = vec4(mix(c, fogColor, f * 0.8), 1.0);',
        '}',
      ].join('\n'),
    });
    scene.add(new THREE.Mesh(lava.g, lavaMat));
    animated.lava = lavaMat;
    const glow = buildGeometry(b => b.props.glow);
    scene.add(new THREE.Mesh(glow.g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 })));
  }

  const roofTanks = []; // water towers on skyline roofs, placed once the models load
  // ------------------------------------------------------------ visual-only props
  // Cornices on buildings, and rooftop clutter on the skyline buildings you
  // can't reach on the route. None of this collides.
  {
    const corniceMat = std({ map: TEX.concrete, color: 0xbfc3c6, vertexColors: false });
    const propMat = std({ map: TEX.paint, color: 0xd6d8d6, vertexColors: false, roughness: 0.6 });
    const darkMat = std({ color: 0x59616a, vertexColors: false, roughness: 0.7 });
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const tankGeo = new THREE.CylinderGeometry(1, 1, 1, 18);
    const legGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
    // pieces are baked into one geometry per material so the props cost a few draw calls
    const batches = new Map();
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion();
    const add = (geo, mat, x, y, z, sx, sy, sz) => {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.applyMatrix4(mtx.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz)));
      if (!batches.has(mat)) batches.set(mat, []);
      batches.get(mat).push(g);
    };
    const isBox = (b) => b.faces.length === 6 && b.faces.every(f => Math.abs(f.n[0]) === 1 || Math.abs(f.n[1]) === 1 || Math.abs(f.n[2]) === 1);
    for (const b of world.brushes) {
      if (b.props.kind !== 'building' || !isBox(b)) continue;
      const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
      const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (y1 - y0 < 200) continue;
      // a cornice band just under the roof line, proud of the wall: four
      // strips outside the walls, so nothing lies in the roof's own plane
      // over the roof (a solid slab here made every roof flicker)
      add(unitBox, corniceMat, cx, y1 - 10, z0 - 2, w + 8, 20, 4);
      add(unitBox, corniceMat, cx, y1 - 10, z1 + 2, w + 8, 20, 4);
      add(unitBox, corniceMat, x0 - 2, y1 - 10, cz, 4, 20, d);
      add(unitBox, corniceMat, x1 + 2, y1 - 10, cz, 4, 20, d);
      if (!b.props.far) continue;
      // rooftop clutter on skyline buildings only
      const n = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const px = x0 + 80 + rand() * Math.max(1, w - 160), pz = z0 + 80 + rand() * Math.max(1, d - 160);
        const r = rand();
        if (r < 0.35) {
          // water tank on legs
          roofTanks.push([px, y1, pz, 150 + rand() * 60, rand()]);
        } else if (r < 0.8) {
          // AC unit with a fan grille
          const sx = 70 + rand() * 60, sz = 50 + rand() * 50, sy = 36 + rand() * 20;
          add(unitBox, propMat, px, y1 + sy / 2, pz, sx, sy, sz);
          add(tankGeo, darkMat, px, y1 + sy + 1, pz, Math.min(sx, sz) * 0.32, 3, Math.min(sx, sz) * 0.32, false);
        } else {
          // antenna mast
          const h = 160 + rand() * 220;
          add(legGeo, darkMat, px, y1 + h / 2, pz, 3, h, 3);
          add(unitBox, darkMat, px, y1 + h * 0.7, pz, 40, 3, 3, false);
          add(unitBox, darkMat, px, y1 + h * 0.85, pz, 26, 3, 3, false);
        }
      }
    }
    for (const [mat, parts] of batches) {
      const merged = new THREE.BufferGeometry();
      for (const attr of ['position', 'normal', 'uv']) {
        const size = parts[0].attributes[attr].itemSize;
        const arr = new Float32Array(parts.reduce((n, g) => n + g.attributes[attr].array.length, 0));
        let off = 0;
        for (const g of parts) { arr.set(g.attributes[attr].array, off); off += g.attributes[attr].array.length; }
        merged.setAttribute(attr, new THREE.BufferAttribute(arr, size));
      }
      // world-space UVs so textures don't stretch across scaled pieces
      const pos = merged.attributes.position.array, nor = merged.attributes.normal.array, uv = merged.attributes.uv.array;
      for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) {
        const ax = Math.abs(nor[i]), ay = Math.abs(nor[i + 1]);
        uv[j] = (ay > 0.5 ? pos[i] : ax > 0.5 ? pos[i + 2] : pos[i] + pos[i + 2]) / 256; uv[j + 1] = (ay > 0.5 ? pos[i + 2] : pos[i + 1]) / 256;
      }
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }

  // ------------------------------------------------------------ models
  // Real models over the code-built city: KayKit buildings for the low city,
  // water towers on skyline roofs, cars, lamps and street clutter on the
  // streets, and an animated runner for the ghost and the Cosmetics preview.
  // All of it is visual; collision stays on the level geometry. If the models
  // can't load, the low city falls back to its plain blocks.
  const models = (() => {
    const A = window.STRAFE_ASSETS || {};
    const parse = (k) => new Promise((res) => {
      try {
        if (!A[k] || !THREE.GLTFLoader) return res(null);
        const raw = atob(A[k]), bin = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i);
        new THREE.GLTFLoader().parse(bin.buffer, '', res, (e) => { console.warn('model', k, e); res(null); });
      } catch (e) { console.warn('model', k, e); res(null); }
    });
    return { city: parse('city'), runner: parse('runner') };
  })();
  // Instanced copies, grouped in square cells. A cell is drawn only when it
  // is in view and within its detail range; past that, buildings swap to the
  // plain blocks they replace and small props are dropped.
  const modelChunks = [];
  const CHUNK = 9000;
  const cellOf = (x, z) => Math.floor(x / CHUNK) + '|' + Math.floor(z / CHUNK);
  function placeModels(kit, list, near, altFor) {
    const cells = new Map();
    for (const it of list) {
      const key = cellOf(it.x, it.z);
      if (!cells.has(key)) cells.set(key, new Map());
      const byName = cells.get(key);
      if (!byName.has(it.name)) byName.set(it.name, []);
      byName.get(it.name).push(it);
    }
    const M = new THREE.Matrix4(), T = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const [key, byName] of cells) {
      const g = new THREE.Group(), pts = [];
      let pad = 0;
      for (const [name, items] of byName) {
        const k = kit[name];
        if (!k) continue;
        for (const part of k.parts) {
          const mesh = new THREE.InstancedMesh(part.geo, part.mat, items.length);
          items.forEach((it, i) => {
            q.setFromAxisAngle(up, it.rot || 0);
            M.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.sx, it.sy, it.sz));
            mesh.setMatrixAt(i, T.multiplyMatrices(M, part.m));
          });
          mesh.frustumCulled = false; // the cell is culled as a whole
          mesh.castShadow = !!k.shadow; mesh.receiveShadow = true;
          g.add(mesh);
        }
        for (const it of items) {
          pts.push(new THREE.Vector3(it.x, it.y, it.z), new THREE.Vector3(it.x, it.y + it.sy * k.size.y, it.z));
          pad = Math.max(pad, Math.max(k.size.x * it.sx, k.size.z * it.sz) * 0.75);
        }
      }
      const sphere = new THREE.Sphere().setFromPoints(pts);
      sphere.radius += pad;
      g.visible = false; scene.add(g);
      const alt = altFor ? altFor(key) : null;
      if (alt) { alt.visible = false; scene.add(alt); }
      modelChunks.push({ g, alt, sphere, near });
    }
  }
  const chunkFrustum = new THREE.Frustum(), chunkPV = new THREE.Matrix4();
  function updateModelChunks() {
    chunkPV.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    chunkFrustum.setFromProjectionMatrix(chunkPV);
    const far = scene.fog.far + 2000;
    for (const c of modelChunks) {
      const d = c.sphere.distanceToPoint(camera.position);
      const seen = d < far && chunkFrustum.intersectsSphere(c.sphere);
      c.g.visible = seen && d < c.near;
      if (c.alt) c.alt.visible = seen && d >= c.near;
    }
  }
  // each top-level node in the city file is one model, measured in its own space
  function cityKit(gltf) {
    const kit = {};
    gltf.scene.updateMatrixWorld(true);
    for (const root of gltf.scene.children) {
      const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      const parts = [], box = new THREE.Box3();
      root.traverse(o => {
        if (!o.isMesh) return;
        const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        box.union(o.geometry.boundingBox.clone().applyMatrix4(m));
        o.material.envMap = envMap; o.material.envMapIntensity = 0.4;
        parts.push({ geo: o.geometry, mat: o.material, m });
      });
      // stand every model on y = 0, centred on its footprint
      const c = box.getCenter(new THREE.Vector3());
      const shift = new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z);
      for (const p of parts) p.m.premultiply(shift);
      kit[root.name] = { parts, size: box.getSize(new THREE.Vector3()) };
    }
    return kit;
  }
  models.city.then((gltf) => {
    if (!gltf) {
      // no models: draw the low city as plain blocks after all
      const low = buildGeometry(b => !!b.props.lowcity, bucketFor);
      for (const [name, part] of Object.entries(low)) { const m = new THREE.Mesh(part.g, MATS[name]); m.receiveShadow = true; scene.add(m); }
      return;
    }
    const kit = cityKit(gltf);
    let seed = 4242;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const list = [], tanks = [], street = [];
    // the low city: the building whose proportions fit the block best, scaled to it
    const towers = Object.keys(kit).filter(n => /^building_[A-H]$/.test(n));
    for (const b of deco.brushes) {
      if (!b.props.lowcity) continue;
      const w = b.max[0] - b.min[0], d = b.max[2] - b.min[2], h = b.max[1] - b.min[1];
      const turn = rnd() < 0.5;
      const fw = turn ? d : w, fd = turn ? w : d;
      let best = null, err = Infinity;
      for (const n of towers) {
        const z = kit[n].size, s = Math.min(fw / z.x, fd / z.z);
        const e = Math.abs(Math.log(h / (z.y * s))) + rnd() * 0.25;
        if (e < err) { err = e; best = n; }
      }
      const z = kit[best].size, s = Math.min(fw / z.x, fd / z.z);
      const sy = Math.min(s * 1.5, Math.max(s * 0.75, h / z.y));
      list.push({ name: best, x: (b.min[0] + b.max[0]) / 2, y: b.min[1], z: (b.min[2] + b.max[2]) / 2, sx: s, sy, sz: s, rot: (turn ? Math.PI / 2 : 0) + (rnd() < 0.5 ? Math.PI : 0) });
    }
    // water towers on the skyline roofs
    for (const [x, y, z, h, r] of roofTanks) {
      const k = kit.watertower; if (!k) break;
      const s = h / k.size.y;
      tanks.push({ name: 'watertower', x, y, z, sx: s, sy: s, sz: s, rot: r * Math.PI * 2 });
    }
    // street level: parked cars, lamps, bins and the like where nothing is built
    const sizes = { car_sedan: 190, car_taxi: 190, car_hatchback: 170, streetlight: 330, trafficlight_A: 330, dumpster: 110, bench: 90, firehydrant: 40, trash_A: 46, box_A: 40, bush: 70 };
    const pick = [['car_sedan', 3], ['car_taxi', 2], ['car_hatchback', 3], ['streetlight', 3], ['trafficlight_A', 1], ['dumpster', 2], ['bench', 1], ['firehydrant', 1], ['trash_A', 2], ['box_A', 1], ['bush', 2]];
    const total = pick.reduce((n, p) => n + p[1], 0);
    const pools = world.brushes.filter(b => b.props.water || b.props.lava);
    const POINT = { min: [0, 0, 0], max: [0, 0, 0] };
    for (const b of world.brushes) {
      if (b.props.kind !== 'street') continue;
      const top = b.max[1];
      if (pools.some(p => p.max[1] >= top - 1 && p.min[0] < b.max[0] && p.max[0] > b.min[0] && p.min[2] < b.max[2] && p.max[2] > b.min[2])) continue;
      for (let x = b.min[0] + 300; x < b.max[0] - 300; x += 620) {
        for (let z = b.min[2] + 300; z < b.max[2] - 300; z += 620) {
          if (rnd() < 0.45) continue;
          const px = x + (rnd() - 0.5) * 300, pz = z + (rnd() - 0.5) * 300;
          // clear sky over it, or at least room to stand under something
          const tr = world.trace([px, top + 4, pz], [px, top + 420, pz], POINT);
          if (tr.fraction < 1) continue;
          let r = rnd() * total, name = pick[0][0];
          for (const [n, wgt] of pick) { if ((r -= wgt) < 0) { name = n; break; } }
          const k = kit[name]; if (!k) continue;
          const s = sizes[name] / Math.max(k.size.x, k.size.y, k.size.z);
          street.push({ name, x: px, y: top, z: pz, sx: s, sy: s, sz: s, rot: Math.floor(rnd() * 4) * Math.PI / 2 + (name.startsWith('car') ? 0 : rnd() * 0.3) });
        }
      }
    }
    for (const n of Object.keys(kit)) if (/^car/.test(n)) kit[n].shadow = true;
    // far low-city cells fall back to their plain blocks, built per cell
    const lowByCell = new Map();
    for (const b of deco.brushes) if (b.props.lowcity) {
      const key = cellOf((b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2);
      if (!lowByCell.has(key)) lowByCell.set(key, new Set());
      lowByCell.get(key).add(b);
    }
    const blocks = (key) => {
      const set = lowByCell.get(key); if (!set) return null;
      const g = new THREE.Group();
      for (const [name, part] of Object.entries(buildGeometry(b => set.has(b), bucketFor))) g.add(new THREE.Mesh(part.g, MATS[name]));
      return g;
    };
    placeModels(kit, list, 9000, blocks);
    placeModels(kit, tanks, 9000);
    placeModels(kit, street, 6000);
  });

  // An animated runner: a copy of the model with its own materials, mixer and
  // run / idle actions. Used for the ghost and the Cosmetics preview.
  const RUNNER_H = 72;
  function makeRunner(gltf, matFor) {
    const root = THREE.SkeletonUtils.clone(gltf.scene);
    const mats = {};
    root.traverse(o => {
      if (!o.isMesh) return;
      const key = /joint/i.test(o.material.name) ? 'joints' : 'surface';
      o.material = mats[key] || (mats[key] = matFor(key));
      o.frustumCulled = false; o.castShadow = true;
    });
    // scale to a runner's height, feet on the floor, facing -z like the player
    // measured from the bones: quantized meshes don't give a usable box
    root.updateMatrixWorld(true);
    let lo = Infinity, hi = -Infinity;
    const v = new THREE.Vector3();
    root.traverse(o => { if (o.isBone) { o.getWorldPosition(v); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); } });
    const h = (hi - lo) / 0.9; // the head bone sits a little under the top of the head
    const s = RUNNER_H / h, holder = new THREE.Group(), inner = new THREE.Group();
    inner.add(root); root.scale.multiplyScalar(s); root.position.y = -lo * s + 2; root.rotation.y = Math.PI;
    holder.add(inner);
    const mixer = new THREE.AnimationMixer(root);
    const clip = (n) => gltf.animations.find(a => a.name === n);
    const run = mixer.clipAction(clip('run')), idle = mixer.clipAction(clip('idle'));
    run.play(); idle.play();
    let w = 0;
    return {
      root: holder, inner, mats,
      // speed in units/s; in the air the stride holds still
      update(dt, speed, air) {
        const target = speed > 30 ? 1 : 0;
        w += (target - w) * Math.min(1, dt * 8);
        run.setEffectiveWeight(w); idle.setEffectiveWeight(1 - w);
        run.setEffectiveTimeScale(air ? 0.05 : Math.max(0.6, Math.min(1.8, speed / 260)));
        mixer.update(dt);
      },
    };
  }

  // doors: solid until a tutorial goal opens them
  const doors = {};
  for (const b of world.brushes) {
    if (!b.props.door) continue;
    const d = buildGeometry(x => x === b);
    const m = new THREE.Mesh(d.g, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.78 }));
    scene.add(m);
    doors[b.props.door] = { brush: b, mesh: m };
  }
  function setDoor(id, open) {
    const d = doors[id];
    if (!d) return;
    d.brush.props.nonsolid = open;
    d.mesh.visible = !open;
  }

  // hub pad beacons + labels
  const beacons = [];
  {
    const pads = world.triggers.filter(t => t.type === 'teleport');
    for (const t of pads) {
      const cx = (t.min[0] + t.max[0]) / 2, cz = (t.min[2] + t.max[2]) / 2;
      const color = map.courses[t.course].color;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(70, 90, 900, 24, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
      beam.position.set(cx, 450, cz);
      scene.add(beam);
      const c = document.createElement('canvas'); c.width = 512; c.height = 128;
      const g = c.getContext('2d');
      g.font = '700 italic 84px "Barlow Condensed", "Arial Narrow", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#' + color.toString(16).padStart(6, '0');
      g.fillText(map.courses[t.course].name.toUpperCase(), 256, 66);
      const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sprite.scale.set(320, 80, 1);
      sprite.position.set(cx, cz < -850 ? 360 : 230, cz);
      scene.add(sprite);
      beacons.push({ beam, sprite, phase: Math.random() * 6, y0: sprite.position.y });
      // redraw once the webfont lands
      document.fonts && document.fonts.ready.then(() => {
        g.clearRect(0, 0, 512, 128);
        g.font = '700 italic 84px "Barlow Condensed", "Arial Narrow", sans-serif';
        g.fillText(map.courses[t.course].name.toUpperCase(), 256, 66);
        tex.needsUpdate = true;
      });
    }
  }

  let onResize = null; // set once the first-person body exists
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (onResize) onResize(w / h);
  }
  window.addEventListener('resize', resize);
  resize();

  // CS-style FOV: horizontal degrees at 4:3, converted to vertical.
  const baseVFov = () => 2 * Math.atan(Math.tan(settings.fov * DEG / 2) * 0.75) / DEG;

  // ------------------------------------------------------------ input
  const keys = new Set();
  let yaw = 0, pitch = 0, turnLeft = 0;
  let wheelJumps = 0, wheelPhase = false;
  let locked = false;
  let muted = false;
  const ed = { on: false, testing: false }; // level editor state, filled in by the editor section

  const KEYMAP = {
    forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    jump: ['Space'], duck: ['ShiftLeft', 'ShiftRight', 'KeyC'],
  };
  const down = (action) => KEYMAP[action].some(k => keys.has(k));

  window.addEventListener('keydown', (e) => {
    if (!locked) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (ed.on) return;
    if (e.code === 'KeyR') restartCourse();
    else if (e.code === 'KeyF') respawn();
    else if (/^Digit[0-9]$/.test(e.code) && map.order[(+e.code.slice(5) + 9) % 10]) goCourse(map.order[(+e.code.slice(5) + 9) % 10]);
    else if (e.code === 'KeyT') goCourse('tutorial');
    else if (e.code === 'KeyP') setPractice(!game.practice);
    else if (e.code === 'KeyZ') practiceSave();
    else if (e.code === 'KeyX') practiceLoad();
    else if (e.code === 'KeyM') { muted = !muted; A.setVolumes({ muted }); toast(muted ? 'Sound off' : 'Sound on'); }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('wheel', (e) => { if (locked) { wheelJumps = Math.min(wheelJumps + 1, 3); e.preventDefault(); } }, { passive: false });

  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    const k = settings.sens * 0.022 * DEG;
    yaw -= e.movementX * k;
    pitch -= e.movementY * k;
    if (pitch > 89 * DEG) pitch = 89 * DEG;
    if (pitch < -89 * DEG) pitch = -89 * DEG;
  });

  function requestLock() {
    if (TOUCH || padStart) { softLock(true); return; }
    try {
      const r = canvas.requestPointerLock({ unadjustedMovement: true });
      if (r && r.catch) r.catch(() => { try { canvas.requestPointerLock(); } catch (e) { /* unsupported */ } });
    } catch (e) {
      try { canvas.requestPointerLock(); } catch (e2) { /* unsupported */ }
    }
  }
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    document.body.classList.toggle('playing', locked);
    if (!locked) keys.clear();
  });
  document.addEventListener('pointerlockerror', () => {
    toast('Pointer lock was refused. Click the view again.');
  });

  function buildCmd() {
    let jump = down('jump');
    // Wheel jumps press for one tick, then release for one, like +jump/-jump.
    if (wheelJumps > 0) {
      if (!wheelPhase) { jump = true; wheelPhase = true; }
      else { wheelPhase = false; wheelJumps--; }
    }
    if (TOUCH) return touchCmd(jump);
    if (pad.on) return padCmd(jump);
    return {
      forward: (down('forward') ? 1 : 0) - (down('back') ? 1 : 0),
      side: (down('right') ? 1 : 0) - (down('left') ? 1 : 0),
      jump, duck: down('duck'), yaw, pitch,
    };
  }

  // ------------------------------------------------------------ touch
  // Only built when TOUCH is set. Left thumb: a stick that appears where you
  // press. Right thumb: drag anywhere to look, or hold Jump and drag to look
  // while hopping. Crouch toggles. Auto strafe presses A or D in the air to
  // match the way you swipe, the way strafing works with a mouse.
  const touch = { fwd: 0, side: 0, jump: false, duck: false, lastYaw: 0, turn: 0 };
  function touchCmd(jump) {
    const dy = Math.atan2(Math.sin(yaw - touch.lastYaw), Math.cos(yaw - touch.lastYaw));
    touch.lastYaw = yaw;
    touch.turn = touch.turn * 0.6 + dy * 0.4;
    let forward = touch.fwd + (down('forward') ? 1 : 0) - (down('back') ? 1 : 0);
    let side = touch.side + (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
    if (settings.autoStrafe && !player.onGround && Math.abs(touch.turn) > 0.0015 && touch.side === 0) { side = touch.turn > 0 ? -1 : 1; forward = 0; }
    return {
      forward: Math.max(-1, Math.min(1, forward)), side: Math.max(-1, Math.min(1, side)),
      jump: jump || touch.jump, duck: down('duck') || touch.duck, yaw, pitch,
    };
  }
  function softLock(on) {
    locked = on;
    document.body.classList.toggle('padplay', on && !TOUCH);
    document.body.classList.toggle('playing', on);
    touch.fwd = touch.side = 0; touch.jump = false; touch.lastYaw = yaw; touch.turn = 0;
    if (on) {
      const el = document.documentElement, fs = el.requestFullscreen || el.webkitRequestFullscreen;
      if (fs && !document.fullscreenElement) {
        try { const r = fs.call(el, { navigationUI: 'hide' }); r && r.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {}); } catch (e) { /* not allowed here */ }
      }
    } else {
      keys.clear();
      touch.duck = false;
      menuOnUnlock();
    }
    touchUI && touchUI.sync();
  }
  // ------------------------------------------------------------ controller
  // Standard-mapping gamepads (Xbox, PlayStation, most others). Left stick
  // moves like WASD, right stick looks. A or LB jumps (hold to hop), B, LT or
  // the right stick click crouches, X goes back to the checkpoint, View
  // restarts, Menu pauses. In menus the D-pad or left stick moves,
  // A picks and B goes back. The pad only takes over once you use it, so
  // keyboard and mouse play is unchanged with a pad plugged in.
  const pad = { on: false, fwd: 0, side: 0, jump: false, duck: false, lastYaw: 0, turn: 0, prev: [], held: {}, padAt: -1, kbmAt: 0, menuAt: 0 };
  let padStart = false;
  const kbm = () => { pad.kbmAt = performance.now(); if (pad.on) { pad.on = false; pad.fwd = pad.side = 0; pad.jump = pad.duck = false; } };
  window.addEventListener('keydown', (e) => { if (e.isTrusted) kbm(); }, true);
  document.addEventListener('mousemove', (e) => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) kbm(); });
  window.addEventListener('mousedown', kbm, true);
  function padCmd(jump) {
    const dy = Math.atan2(Math.sin(yaw - pad.lastYaw), Math.cos(yaw - pad.lastYaw));
    pad.lastYaw = yaw;
    pad.turn = pad.turn * 0.6 + dy * 0.4;
    let forward = pad.fwd + (down('forward') ? 1 : 0) - (down('back') ? 1 : 0);
    let side = pad.side + (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
    // auto strafe: in the air with the stick centred sideways, turning presses A or D
    if (settings.padAutoStrafe && !player.onGround && Math.abs(pad.turn) > 0.0015 && pad.side === 0) { side = pad.turn > 0 ? -1 : 1; forward = 0; }
    return {
      forward: Math.max(-1, Math.min(1, forward)), side: Math.max(-1, Math.min(1, side)),
      jump: jump || pad.jump, duck: down('duck') || pad.duck, yaw, pitch,
    };
  }
  const fireKey = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }));
  function padClick(el) {
    if (!el) return;
    padStart = true;
    try { el.click(); } finally { padStart = false; }
  }
  // focus walking for the drawer and the level-complete card, which have no arrow keys of their own
  function padFocusStep(root, d) {
    const els = [...root.querySelectorAll('button, input, [tabindex="0"]')].filter(el => !el.disabled && el.offsetParent !== null);
    if (!els.length) return;
    const i = els.indexOf(document.activeElement);
    const n = els[i < 0 ? (d > 0 ? 0 : els.length - 1) : Math.max(0, Math.min(els.length - 1, i + d))];
    n.focus({ preventScroll: false });
    n.scrollIntoView && n.scrollIntoView({ block: 'nearest' });
    A.play('hover');
  }
  function padMenu(b, ax, now) {
    const press = (i) => b[i] && !pad.prev[i];
    // held directions repeat, a little slower at first
    const dir = (b[12] || ax[1] < -0.6) ? 'up' : (b[13] || ax[1] > 0.6) ? 'down' : (b[14] || ax[0] < -0.6) ? 'left' : (b[15] || ax[0] > 0.6) ? 'right' : null;
    if (!dir) pad.menuAt = 0;
    else if (!pad.menuAt || now > pad.menuAt) {
      pad.menuAt = now + (pad.menuAt ? 120 : 380);
      const open = !completeEl.hidden ? completeEl : !drawer.hidden ? drawer : null;
      const ae = document.activeElement;
      if (open && ae && ae.type === 'range' && (dir === 'left' || dir === 'right')) {
        ae.stepUp && (dir === 'right' ? ae.stepUp() : ae.stepDown());
        ae.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (open) padFocusStep(open, dir === 'up' || dir === 'left' ? -1 : 1);
      else fireKey({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[dir]);
    }
    if (press(0)) {
      const ae = document.activeElement;
      if (ae && ae !== document.body && (ae.tagName === 'BUTTON' || ae.tagName === 'INPUT')) padClick(ae);
      else { padStart = true; try { fireKey('Enter'); } finally { padStart = false; } }
    }
    if (press(1)) {
      if (!completeEl.hidden) padClick(completeEl.querySelector('[data-act="levels"]'));
      else fireKey('Escape');
    }
    if (press(9) && game.started && completeEl.hidden) padClick($('m-resume'));
  }
  function pollPad(dt) {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const g of list) if (g && g.connected) { gp = g; break; }
    if (!gp) { if (pad.on) { pad.on = false; pad.fwd = pad.side = 0; pad.jump = pad.duck = false; } return; }
    const now = performance.now();
    const b = gp.buttons.map(x => x.pressed || x.value > 0.5);
    const ax = gp.axes.slice(0, 4).map(v => Math.abs(v) < 0.18 ? 0 : v);
    while (ax.length < 4) ax.push(0);
    const any = b.some(Boolean) || ax.some(v => v !== 0);
    if (any && !pad.on && now - pad.kbmAt > 150) { pad.on = true; pad.lastYaw = yaw; pad.turn = 0; }
    if (!pad.on) { pad.prev = b; return; }
    const press = (i) => b[i] && !pad.prev[i];
    if (replay.on) { replayPad(b, ax, press, dt); pad.prev = b; return; }
    if (locked) {
      pad.side = ax[0] > 0.4 ? 1 : ax[0] < -0.4 ? -1 : 0;
      pad.fwd = ax[1] < -0.4 ? 1 : ax[1] > 0.4 ? -1 : 0;
      pad.jump = !!(b[0] || b[4] || b[5]);
      pad.duck = !!(b[1] || b[6] || b[11]);
      // look: a soft curve so small tilts aim finely and full tilt turns fast
      const lx = ax[2], ly = ax[3] * (settings.padInvert ? -1 : 1);
      const k = settings.padSens * 4.2 * dt;
      yaw -= Math.sign(lx) * Math.pow(Math.abs(lx), 1.7) * k;
      pitch -= Math.sign(ly) * Math.pow(Math.abs(ly), 1.7) * k * 0.7;
      if (pitch > 89 * DEG) pitch = 89 * DEG;
      if (pitch < -89 * DEG) pitch = -89 * DEG;
      if (press(2)) respawn();
      if (press(8)) restartCourse();
      if (press(9)) { if (document.pointerLockElement) document.exitPointerLock(); else softLock(false); }
    } else {
      pad.fwd = pad.side = 0; pad.jump = pad.duck = false;
      padMenu(b, ax, now);
    }
    pad.prev = b;
  }
  window.addEventListener('gamepadconnected', () => toast('Controller connected'));
  window.addEventListener('gamepaddisconnected', () => toast('Controller disconnected'));
  // Esc leaves a controller session the way it leaves pointer lock
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && locked && !document.pointerLockElement && !TOUCH) softLock(false); });
  // clicking the view during a controller session hands it to the mouse
  canvas.addEventListener('click', () => { if (locked && !TOUCH && !document.pointerLockElement) requestLock(); });

  const touchUI = TOUCH ? buildTouch() : null;
  function buildTouch() {
    const meta = document.createElement('meta');
    meta.name = 'viewport'; meta.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    document.head.appendChild(meta);
    document.body.classList.add('touch');
    const css = document.createElement('style');
    css.textContent = `
body.touch { touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; overscroll-behavior: none; }
#touch { position: fixed; inset: 0; z-index: 40; display: none; }
body.touch.playing:not(.complete) #touch { display: block; }
#t-pad { position: absolute; inset: 0; touch-action: none; }
#t-stick { position: absolute; width: 130px; height: 130px; margin: -65px 0 0 -65px; border-radius: 50%; border: 2px solid rgba(255,255,255,.35); background: rgba(0,0,0,.18); pointer-events: none; opacity: .0; transition: opacity .15s; }
#t-stick.on { opacity: 1; }
#t-knob { position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%; background: rgba(255,255,255,.55); }
#t-hint { position: absolute; left: max(18px, env(safe-area-inset-left)); bottom: 22px; font: 600 12px/1.3 Barlow, sans-serif; color: rgba(255,255,255,.55); pointer-events: none; }
.t-btn { position: absolute; border-radius: 50%; border: 2px solid rgba(255,255,255,.45); background: rgba(10,14,18,.38); color: #fff;
  font: 700 14px/1 'Barlow Condensed', sans-serif; letter-spacing: .06em; text-transform: uppercase; touch-action: none; display: grid; place-items: center; padding: 0; }
.t-btn.on { background: rgba(255,255,255,.75); color: #15191d; }
#t-jump { width: 96px; height: 96px; right: max(24px, env(safe-area-inset-right)); bottom: max(24px, env(safe-area-inset-bottom)); }
#t-duck { width: 64px; height: 64px; font-size: 11px; right: calc(max(24px, env(safe-area-inset-right)) + 30px); bottom: calc(max(24px, env(safe-area-inset-bottom)) + 112px); }
#t-bar { position: absolute; top: max(8px, env(safe-area-inset-top)); right: max(10px, env(safe-area-inset-right)); display: flex; gap: 6px; }
#t-bar .t-btn { position: static; width: 42px; height: 42px; border-radius: 10px; font-size: 11px; }
#t-rotate { position: fixed; inset: 0; z-index: 60; display: none; place-items: center; background: #0d1114; color: #f6f6f3; font: 700 22px/1.3 'Barlow Condensed', sans-serif; text-align: center; padding: 24px; }
@media (orientation: portrait) { body.touch.playing #t-rotate { display: grid; } }
body.touch #help, body.touch #keys, #t-hint { display: none; }
body.touch #tut { zoom: .6; top: calc(14px + env(safe-area-inset-top, 0px)); left: calc(14px + env(safe-area-inset-left, 0px)); }
/* phone HUD: small timer up top, speed low and centred between the thumbs */
body.touch #top { zoom: .58; top: calc(8px + env(safe-area-inset-top, 0px)); }
body.touch #speedwrap { zoom: .6; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); }
body.touch #graph { display: none; }
body.touch #toast { zoom: .7; top: 22vh; }
body.touch #fps { top: calc(8px + env(safe-area-inset-top, 0px)); left: calc(12px + env(safe-area-inset-left, 0px)); }
@media (max-height: 560px) { body.touch #menu, body.touch #drawer, body.touch #complete { zoom: .62; } }
body.touch #menu button, body.touch #drawer button { min-height: 40px; }
`;
    document.head.appendChild(css);
    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = '<div id="t-pad"></div><div id="t-stick"><div id="t-knob"></div></div>' +
      '<div id="t-hint">Left: move · Right: look · Hold Jump and drag to steer</div>' +
      '<button class="t-btn" id="t-duck" aria-label="Crouch">Crouch</button><button class="t-btn" id="t-jump" aria-label="Jump">Jump</button>' +
      '<div id="t-bar"><button class="t-btn" data-k="cp" aria-label="Back to checkpoint">CP</button>' +
      '<button class="t-btn" data-k="restart" aria-label="Restart">Reset</button><button class="t-btn" data-k="pause" aria-label="Pause">II</button></div>';
    document.body.appendChild(root);
    const rot = document.createElement('div');
    rot.id = 't-rotate'; rot.textContent = 'Turn your phone sideways to play';
    document.body.appendChild(rot);

    const pad = root.querySelector('#t-pad'), stick = root.querySelector('#t-stick'), knob = root.querySelector('#t-knob');
    const R = 52, ptrs = new Map();
    const look = (dx, dy) => {
      const k = settings.lookSens * 0.0045;
      yaw -= dx * k; pitch -= dy * k;
      if (pitch > 89 * DEG) pitch = 89 * DEG;
      if (pitch < -89 * DEG) pitch = -89 * DEG;
    };
    const setStick = (p, x, y) => {
      let dx = x - p.ox, dy = y - p.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      touch.side = dx > R * 0.38 ? 1 : dx < -R * 0.38 ? -1 : 0;
      touch.fwd = dy < -R * 0.38 ? 1 : dy > R * 0.38 ? -1 : 0;
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { pad.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      const isStick = e.clientX < window.innerWidth * 0.42 && ![...ptrs.values()].some(p => p.stick);
      const p = { stick: isStick, x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY };
      ptrs.set(e.pointerId, p);
      if (isStick) { stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; stick.classList.add('on'); setStick(p, e.clientX, e.clientY); }
    });
    pad.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      if (p.stick) setStick(p, e.clientX, e.clientY);
      else look(e.clientX - p.x, e.clientY - p.y);
      p.x = e.clientX; p.y = e.clientY;
    });
    const lift = (e) => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      ptrs.delete(e.pointerId);
      if (p.stick) { touch.fwd = touch.side = 0; stick.classList.remove('on'); knob.style.transform = ''; }
    };
    pad.addEventListener('pointerup', lift);
    pad.addEventListener('pointercancel', lift);

    // Jump: hold to hop (auto bunnyhop), drag while holding to look
    const jumpB = root.querySelector('#t-jump');
    let jp = null;
    jumpB.addEventListener('pointerdown', (e) => { e.preventDefault(); try { jumpB.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ } jp = { id: e.pointerId, x: e.clientX, y: e.clientY }; touch.jump = true; jumpB.classList.add('on'); });
    jumpB.addEventListener('pointermove', (e) => { if (!jp || jp.id !== e.pointerId) return; look(e.clientX - jp.x, e.clientY - jp.y); jp.x = e.clientX; jp.y = e.clientY; });
    const jumpUp = (e) => { if (!jp || jp.id !== e.pointerId) return; jp = null; touch.jump = false; jumpB.classList.remove('on'); };
    jumpB.addEventListener('pointerup', jumpUp);
    jumpB.addEventListener('pointercancel', jumpUp);

    const duckB = root.querySelector('#t-duck');
    duckB.addEventListener('pointerdown', (e) => { e.preventDefault(); touch.duck = !touch.duck; duckB.classList.toggle('on', touch.duck); });

    for (const b of root.querySelectorAll('#t-bar [data-k]')) b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const k = b.dataset.k;
      if (k === 'pause') { swallowUntil = performance.now() + 600; softLock(false); }
      else if (k === 'restart') restartCourse();
      else if (k === 'cp') respawn();
    });
    // the tap that pauses would land as a click on whatever the menu puts
    // under the thumb (or the view, which resumes), so drop it
    let swallowUntil = 0;
    const swallow = (e) => { if (performance.now() < swallowUntil) { e.stopPropagation(); e.preventDefault(); } };
    for (const t of ['click', 'pointerup', 'mouseup', 'touchend']) document.addEventListener(t, swallow, true);
    // the page never scrolls or zooms under the thumbs
    document.addEventListener('touchmove', (e) => { if (locked) e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    return { sync: () => duckB.classList.toggle('on', touch.duck) };
  }

  // ------------------------------------------------------------ game state
  const game = {
    course: null, cp: 0, cpSpawn: null, running: false, inStart: false,
    startTick: 0, tick: 0, finished: null, mission: null, practice: false, save: null,
  };
  const prev = { pos: player.pos.slice(), eye: player.viewOffset };

  function place(spawn) {
    player.reset(spawn.pos, spawn.yaw);
    yaw = spawn.yaw; pitch = 0; turnLeft = 0;
    prev.pos = player.pos.slice(); prev.eye = player.viewOffset;
    cam.dip = 0; cam.roll = 0;
  }
  // no level loaded: the menu is showing
  function goIdle() {
    game.course = null; game.running = false; game.finished = null; game.mission = null;
    resetTutorial();
    place(map.hubSpawn);
    updateCourseHud();
  }
  function goCourse(name, mission = null) {
    const c = map.courses[name];
    if (name !== game.course) game.save = null; // R keeps practice saves
    game.course = name; game.cp = 0; game.cpSpawn = c.spawn; game.running = false; game.finished = null;
    game.mission = mission;
    ghost.stop();
    closeComplete();
    $('split').classList.remove('show');
    resetTutorial();
    place(c.spawn);
    updateCourseHud();
    toast(mission === null ? c.name : (mission ? 'Job ' + mission : 'Prologue') + ': ' + STORY[mission].title);
    A.play('teleport');
  }
  function restartCourse() { if (game.course) goCourse(game.course, game.mission); }
  function respawn() {
    if (!game.course) return;
    if (game.practice && game.save) { practiceLoad(); return; }
    place(game.cpSpawn);
    A.play('respawn');
  }

  // ------------------------------------------------------------ practice
  // Save points: Z stores the whole movement state (position, velocity,
  // wallrun, slide and the rest) plus the run clock, X puts you back. Falling
  // or F also go back to the save. Practice runs never count: no best times,
  // splits, ghosts, leaderboard entries or stars, and leaving practice
  // restarts the level so a saved line can't sneak into a real run.
  const copyState = (v) => Array.isArray(v) ? v.map(copyState) : v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype
    ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copyState(x)])) : v;
  const SAVED = ['pos', 'vel', 'approach', 'ducked', 'onGround', 'groundNormal', 'groundBrush', 'viewOffset', 'prevJump', 'prevDuck', 'jumpPressed',
    'slide', 'slideCooldown', 'wallrun', 'wallrunCooldown', 'lastWall', 'climb', 'climbAvailable', 'mantle', 'airTime'];
  function setPractice(on) {
    if (on === game.practice) return;
    game.practice = on; game.save = null;
    $('practice').hidden = !on;
    if (on) toast('Practice on: Z saves, X loads. Runs are not recorded.', 2600);
    else { toast('Practice off'); restartCourse(); }
  }
  function practiceSave() {
    if (!game.practice) { toast('Press P for practice mode to use save points'); return; }
    const st = {};
    for (const k of SAVED) st[k] = copyState(player[k]);
    game.save = { st, yaw, pitch, cp: game.cp, cpSpawn: game.cpSpawn, running: game.running,
      elapsed: game.running ? game.tick - game.startTick : 0, splits: game.run ? copyState(game.run.splits) : {} };
    toast('Saved');
    A.play('checkpoint');
  }
  function practiceLoad() {
    const sv = game.save;
    if (!game.practice || !sv) { toast(game.practice ? 'No save yet, press Z' : 'Press P for practice mode to use save points'); return; }
    for (const k of SAVED) player[k] = copyState(sv.st[k]);
    yaw = sv.yaw; pitch = sv.pitch; turnLeft = 0;
    player.yaw = yaw; player.pitch = pitch;
    prev.pos = player.pos.slice(); prev.eye = player.viewOffset;
    cam.dip = 0; cam.dipVel = 0; cam.roll = 0;
    game.cp = sv.cp; game.cpSpawn = sv.cpSpawn; game.finished = null;
    game.running = sv.running; game.inStart = false;
    if (sv.running) { game.startTick = game.tick - sv.elapsed; game.run = { top: 0, dist: 0, jumps: 0, splits: copyState(sv.splits) }; }
    ghost.stop();
    closeComplete();
    A.play('respawn');
  }

  function handleTriggers() {
    let inStart = false;
    for (const t of player.triggersTouching()) {
      if (t.type === 'teleport') { goCourse(t.course); return; }
      if (t.type === 'kill') { respawn(); return; }
      if (t.course !== game.course) continue;
      if (t.type === 'start') inStart = true;
      else if (t.type === 'hint') enterStep(t);
      else if (t.type === 'checkpoint' && t.idx > game.cp) {
        game.cp = t.idx; game.cpSpawn = t.spawn;
        const c = map.courses[game.course];
        A.play('checkpoint');
        if (game.running) {
          const ticks = game.tick - game.startTick;
          game.run.splits[t.idx] = ticks;
          const pb = bestSplits[game.course] && bestSplits[game.course][t.idx];
          showSplit('Checkpoint ' + (t.idx + 1), ticks, pb);
        } else toast('Checkpoint ' + (t.idx + 1) + ' / ' + c.stages);
      } else if (t.type === 'end' && game.running && game.practice) {
        game.running = false;
        const ticks = game.tick - game.startTick;
        showSplit('Practice finish', ticks, best[game.course]);
        game.finished = ticks;
        ghost.stop();
        A.play('finish');
      } else if (t.type === 'end' && game.running) {
        game.running = false;
        const ticks = game.tick - game.startTick;
        const prevBest = best[game.course];
        const isBest = !prevBest || ticks < prevBest;
        showSplit('Finish', ticks, prevBest);
        if (isBest) {
          best[game.course] = ticks; save(BEST_KEY, best);
          bestSplits[game.course] = game.run.splits; save(SPLITS_KEY, bestSplits);
        }
        const runGhost = ghost.current();
        game.lastRun = runGhost && game.course !== 'custom' ? { course: game.course, ticks, g: runGhost, saved: false } : null;
        if (isBest || !ghost.has(game.course)) ghost.keep(game.course);
        lbSubmit(game.course, ticks, runGhost);
        raceFinish();
        ghost.stop();
        game.finished = ticks;
        A.play('finish');
        if (game.course === 'tutorial') finishTutorial();
        updateCourseHud();
        showComplete(ticks, prevBest, isBest);
      }
    }
    if (inStart) {
      if (game.running) ghost.stop();
      game.running = false; game.finished = null; game.cp = 0;
      game.cpSpawn = map.courses[game.course].spawn;
    } else if (game.inStart && game.course) {
      game.running = true; game.startTick = game.tick;
      game.run = { top: 0, dist: 0, jumps: 0, splits: {} };
      ghost.start();
      A.play('start');
    }
    game.inStart = inStart;
  }

  // ------------------------------------------------------------ ghost
  // The run is sampled every few ticks. Each level's best run is kept and
  // replays as a see-through runner, so you race your own best line.
  const GHOST_KEY = 'strafe.ghost.v1.', GHOST_EVERY = 4;
  const ghost = (() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x63d6ff).convertSRGBToLinear(), emissive: new THREE.Color(0x2a9fd8).convertSRGBToLinear(),
      roughness: 0.6, transparent: true, opacity: 0.55, depthWrite: false,
    });
    const part = (w, h, d, x, y, z, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    part(20, 26, 11, 0, 47, 0, body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(7.5, 12, 8), mat); head.position.set(0, 68, 0); body.add(head);
    const limb = (x, y, len, w) => { const g = new THREE.Group(); g.position.set(x, y, 0); part(w, len, w, 0, -len / 2, 0, g); body.add(g); return g; };
    const legs = [limb(-5.5, 34, 33, 8), limb(5.5, 34, 33, 8)];
    const arms = [limb(-13.5, 58, 25, 6), limb(13.5, 58, 25, 6)];
    // a marker over its head that shows through walls, so you can always find it
    const mk = document.createElement('canvas'); mk.width = mk.height = 64;
    const mc = mk.getContext('2d');
    mc.fillStyle = '#63d6ff'; mc.strokeStyle = 'rgba(0,0,0,.45)'; mc.lineWidth = 4;
    mc.beginPath(); mc.moveTo(10, 14); mc.lineTo(54, 14); mc.lineTo(32, 50); mc.closePath(); mc.stroke(); mc.fill();
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mk), depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false }));
    marker.scale.set(0.035, 0.035, 1); marker.position.y = 96; marker.renderOrder = 10;
    root.add(marker);
    root.visible = false;
    scene.add(root);
    // the animated runner takes over from the block figure once it loads
    const smat = mat.clone(); smat.skinning = true;
    let runner = null;
    models.runner.then(g => { if (!g) return; runner = makeRunner(g, () => smat); root.add(runner.root); body.visible = false; });
    const runs = {};
    let rec = null, phase = 0, match = 0;
    const gapEl = document.getElementById('ghostgap');
    const get = (course) => remote && remote.course === course ? remote.g : course in runs ? runs[course] : (runs[course] = load(GHOST_KEY + course));
    let remote = null; // someone else's run from the online board, raced instead of yours
    const sample = () => rec.push(Math.round(player.pos[0]), Math.round(player.pos[1]), Math.round(player.pos[2]), Math.round(yaw * 100), player.ducked ? 1 : 0);
    const api = {
      start() { rec = []; sample(); },
      stop() { rec = null; },
      tick(offset) { if (rec && offset % GHOST_EVERY === 0) sample(); },
      keep(course) {
        if (!rec) return;
        runs[course] = { e: GHOST_EVERY, s: rec };
        save(GHOST_KEY + course, runs[course]);
        rec = null;
      },
      has: (course) => !!(course in runs ? runs[course] : (runs[course] = load(GHOST_KEY + course))),
      // the run being recorded, and your saved best run, as posted online
      current: () => rec ? { e: GHOST_EVERY, s: rec.slice() } : null,
      saved(course) { const g = course in runs ? runs[course] : (runs[course] = load(GHOST_KEY + course)); return g ? { e: g.e, s: g.s } : null; },
      useRemote(course, g) { remote = g ? { course, g } : null; },
      remoteFor: (course) => !!(remote && remote.course === course),
      forget(course) { delete runs[course]; try { localStorage.removeItem(GHOST_KEY + course); } catch (e) { /* storage blocked */ } },
      root,
      tint(c) {
        const col = new THREE.Color(c).convertSRGBToLinear();
        mat.color.copy(col); mat.emissive.copy(col).multiplyScalar(0.55);
        smat.color.copy(mat.color); smat.emissive.copy(mat.emissive);
      },
      // t: ticks since the run started, or null to hide
      update(dt, t) {
        const g = game.course && t !== null && settings.ghost ? get(game.course) : null;
        if (!g) { root.visible = false; gapEl.className = ''; return; }
        const { x, y, z, n, moving } = pose(g, t, dt);
        // stay visible beside you; only thin out when it is inside your view
        const d = Math.hypot(x - player.pos[0], y - player.pos[1], z - player.pos[2]);
        mat.opacity = smat.opacity = d < 22 ? 0 : 0.25 + 0.4 * Math.min(1, (d - 22) / 60);
        root.visible = true;
        marker.visible = d > 120;
        // time gap: when did the ghost pass the point nearest to you?
        if (!moving) { match = 0; gapEl.className = ''; return; }
        const s = g.s, P = player.pos;
        let bestD = Infinity, bi = match;
        for (let q = Math.max(0, match - 15); q < Math.min(n, match + 60); q++) {
          const dd = (s[q * 5] - P[0]) ** 2 + (s[q * 5 + 1] - P[1]) ** 2 + (s[q * 5 + 2] - P[2]) ** 2;
          if (dd < bestD) { bestD = dd; bi = q; }
        }
        match = bi;
        if (bestD > 400 * 400) { gapEl.className = ''; return; }
        const gap = (t - bi * g.e) * TICK;
        gapEl.textContent = 'Ghost ' + (gap >= 0 ? '+' : '−') + Math.abs(gap).toFixed(1) + 's';
        gapEl.className = 'show ' + (Math.abs(gap) < 0.05 ? 'even' : gap > 0 ? 'behind' : 'ahead');
      },
      // the replay viewer: any run at any moment, fully visible
      show(g, t, dt) {
        const p = pose(g, t, dt);
        mat.opacity = smat.opacity = 0.85;
        root.visible = true;
        marker.visible = false;
        gapEl.className = '';
        return p;
      },
      hide() { root.visible = false; gapEl.className = ''; },
    };
    // place the runner at t ticks into run g and animate its stride
    function pose(g, t, dt) {
      const s = g.s, n = s.length / 5, f = Math.max(0, Math.min(t / g.e, n - 1)), i = Math.floor(f), j = Math.min(i + 1, n - 1), k = f - i;
      const at = (q, o) => s[q * 5 + o];
      const x = at(i, 0) + (at(j, 0) - at(i, 0)) * k, y = at(i, 1) + (at(j, 1) - at(i, 1)) * k, z = at(i, 2) + (at(j, 2) - at(i, 2)) * k;
      let dy = (at(j, 3) - at(i, 3)) / 100;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      root.position.set(x, y, z);
      root.rotation.y = at(i, 3) / 100 + dy * k;
      const hs = Math.hypot(at(j, 0) - at(i, 0), at(j, 2) - at(i, 2)) / (g.e * TICK);
      const air = Math.abs(at(j, 1) - at(i, 1)) > 2;
      // waiting at the start it stands still rather than running on the spot
      const moving = t > 0;
      if (moving) phase += dt * Math.min(hs, 400) * 0.034;
      const sw = air || !moving ? 0 : Math.sin(phase) * Math.min(1, hs / 250);
      const lift = air && moving;
      legs[0].rotation.x = sw * 0.7 + (lift ? 0.5 : 0); legs[1].rotation.x = -sw * 0.7 - (lift ? 0.2 : 0);
      arms[0].rotation.x = -sw * 0.8 + (lift ? -1.2 : 0); arms[1].rotation.x = sw * 0.8 + (lift ? -1.2 : 0);
      body.scale.y = at(i, 4) ? 0.72 : 1;
      if (runner) { runner.update(dt, moving ? hs : 0, air && moving); runner.inner.scale.y = at(i, 4) ? 0.72 : 1; }
      return { x, y, z, n, moving, hs, yaw: root.rotation.y, duck: !!at(i, 4), air };
    }
    return api;
  })();

  // ------------------------------------------------------------ cosmetics
  // Story stars unlock runner skins and trails. A skin recolours your arms,
  // legs and your ghost; a trail is a fading ribbon behind you and the ghost.
  const SKINS = [
    { id: 'kite', name: 'Kite', need: 0, sleeve: 0x1d2026, glove: 0x1a1c20, accent: 0xdb2f2a, pants: 0x2c3139, shirt: 0xf2f2ee, ghost: 0x63d6ff },
    { id: 'courier', name: 'Courier', need: 3, sleeve: 0x22324a, glove: 0x2a2f36, accent: 0xf08a24, pants: 0x1f2a3a, shirt: 0xe9e4d8 },
    { id: 'blueline', name: 'Blueline', need: 6, sleeve: 0xe8ecef, glove: 0x2b3440, accent: 0x2f7de1, pants: 0x3a4450, shirt: 0xffffff },
    { id: 'nightshift', name: 'Night Shift', need: 10, sleeve: 0x0e0f12, glove: 0x0b0c0e, accent: 0x39e07a, pants: 0x121418, shirt: 0x1b1e23 },
    { id: 'spillway', name: 'Spillway', need: 14, sleeve: 0x17595e, glove: 0x1d2a2c, accent: 0x3fd0c9, pants: 0x203236, shirt: 0xdff3f1 },
    { id: 'ember', name: 'Ember', need: 18, sleeve: 0x2a2523, glove: 0x5a1712, accent: 0xff5a1f, pants: 0x2b2725, shirt: 0x3a302c },
    { id: 'gold', name: 'Gold Run', need: 24, sleeve: 0x16130d, glove: 0x3a2e14, accent: 0xe0a400, pants: 0x1c1a16, shirt: 0xf3e6c0 },
    { id: 'prism', name: 'Prism', need: 30, sleeve: 0xf4f5f7, glove: 0xd9dde2, accent: 'hue', pants: 0xc8cdd3, shirt: 0xffffff },
  ];
  const TRAILS = [
    { id: 'none', name: 'None', need: 0 },
    { id: 'streak', name: 'Streak', need: 2, color: 0xffffff, tail: 0xbfd3e6 },
    { id: 'redline', name: 'Red Line', need: 5, color: 0xff3b30, tail: 0xb3141a },
    { id: 'skyline', name: 'Skyline', need: 8, color: 0x7fdcff, tail: 0x2f7de1 },
    { id: 'ember', name: 'Ember', need: 12, color: 0xffb02e, tail: 0xd8241c },
    { id: 'toxic', name: 'Toxic', need: 16, color: 0xc8ff4f, tail: 0x22b35a },
    { id: 'gold', name: 'Gold', need: 21, color: 0xffe07a, tail: 0xb87a00 },
    { id: 'rainbow', name: 'Rainbow', need: 27, color: 'hue' },
  ];
  const storyStars = () => STORY.reduce((n, job, i) => n + (job.stars && storyProgress[i] ? storyProgress[i].stars : 0), 0);
  const unlocked = (it) => it.need <= storyStars();
  const pick = (list, id) => { const it = list.find(x => x.id === id); return it && unlocked(it) ? it : list[0]; };
  const hueColor = (h) => new THREE.Color().setHSL(h % 1, 0.85, 0.58).getHex();

  // height: [centre above the feet, half width]; life: seconds a point lasts
  function makeTrail(height, life, into = scene, cam = camera) {
    const N = 120;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 6), age = new Float32Array(N * 2), side = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) side[i * 2 + 1] = 1;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAge', new THREE.BufferAttribute(age, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aV', new THREE.BufferAttribute(side, 1));
    const idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, rainbow: { value: 0 }, t: { value: 0 }, op: { value: 1 } },
      vertexShader: 'attribute float aAge; attribute float aV; varying float vA; varying float vV;' +
        'void main() { vA = aAge; vV = aV; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 c0; uniform vec3 c1; uniform float rainbow; uniform float t; uniform float op; varying float vA; varying float vV;' +
        'vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }' +
        'void main() { vec3 c = mix(mix(c0, c1, vA), hue(fract(t * 0.25 - vA * 0.9)), rainbow);' +
        'float a = (1.0 - vA) * smoothstep(0.0, 0.06, vA) * sin(vV * 3.14159) * op;' +
        'gl_FragColor = vec4(c, a * 0.8); }',
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 2;
    into.add(mesh);
    const pts = [];
    return {
      mat, life,
      clear() { pts.length = 0; mesh.visible = false; },
      // x, y, z: the runner's feet; now in seconds; moving: speed is high enough to draw
      update(x, y, z, now, moving) {
        const last = pts[pts.length - 1];
        if (last && Math.hypot(x - last.x, y - last.y, z - last.z) > 600) pts.length = 0; // teleported
        if (moving && (!last || Math.hypot(x - last.x, y - last.y, z - last.z) > 8)) pts.push({ x, y, z, t: now });
        while (pts.length && (now - pts[0].t > this.life || pts.length > N)) pts.shift();
        const n = pts.length;
        if (n < 2) { mesh.visible = false; return; }
        // a ribbon that always turns its face to the camera, so it reads from any angle
        const cp = cam.position, at = (i) => pts[Math.max(0, Math.min(n - 1, n - 1 - i))];
        for (let i = 0; i < N; i++) {
          // the newest point is index 0, so age runs 0 (fresh) to 1 (gone)
          const q = at(i), qa = at(i - 1), qb = at(i + 1);
          const a = i < n ? Math.min(1, (now - q.t) / this.life) : 1;
          const dx = qa.x - qb.x, dy = qa.y - qb.y, dz = qa.z - qb.z;
          const cy = q.y + height[0], vx = cp.x - q.x, vy = cp.y - cy, vz = cp.z - q.z;
          let sx = dy * vz - dz * vy, sy = dz * vx - dx * vz, sz = dx * vy - dy * vx;
          const sl = Math.hypot(sx, sy, sz), w = height[1] * (1 - a * 0.6);
          if (sl > 1e-6) { sx *= w / sl; sy *= w / sl; sz *= w / sl; } else { sx = 0; sy = w; sz = 0; }
          pos[i * 6] = q.x - sx; pos[i * 6 + 1] = cy - sy; pos[i * 6 + 2] = q.z - sz;
          pos[i * 6 + 3] = q.x + sx; pos[i * 6 + 4] = cy + sy; pos[i * 6 + 5] = q.z + sz;
          age[i * 2] = age[i * 2 + 1] = a;
        }
        g.attributes.position.needsUpdate = true; g.attributes.aAge.needsUpdate = true;
        mesh.visible = true;
      },
    };
  }
  const trails = { me: makeTrail([22, 14], 0.85), ghost: makeTrail([30, 14], 0.85) };
  const cosmetics = {
    skin: SKINS[0], trail: TRAILS[0], trails,
    apply() {
      const k = this.skin = pick(SKINS, settings.skin), tr = this.trail = pick(TRAILS, settings.trail);
      body.setSkin(Object.assign({}, k, { accent: k.accent === 'hue' ? hueColor(0) : k.accent }));
      if (k.accent !== 'hue') ghost.tint(k.ghost || k.accent);
      for (const t of [trails.me, trails.ghost]) {
        t.mat.uniforms.rainbow.value = tr.color === 'hue' ? 1 : 0;
        if (tr.color !== 'hue') { t.mat.uniforms.c0.value.set(tr.color); t.mat.uniforms.c1.value.set(tr.tail || tr.color); }
        if (tr.id === 'none') t.clear();
      }
    },
    // per frame: Prism cycles its colour, trails follow the runner and the ghost
    update(now, x, y, z, hs, show) {
      const ts = now / 1000;
      if (this.skin.accent === 'hue') { const c = hueColor(ts * 0.12); body.setAccent(c); ghost.tint(c); }
      const on = this.trail.id !== 'none';
      trails.me.mat.uniforms.t.value = trails.ghost.mat.uniforms.t.value = ts;
      if (on && show) trails.me.update(x, y, z, ts, hs > 300); else trails.me.clear();
      const gr = ghost.root;
      if (on && show && gr.visible && game.running) trails.ghost.update(gr.position.x, gr.position.y, gr.position.z, ts, true); else trails.ghost.clear();
    },
  };

  // The Cosmetics screen's preview: a small runner on a turntable, jogging a
  // circle in whatever skin and trail you point at, locked ones included.
  const preview = (() => {
    const cv = document.getElementById('cos-view');
    let r = null, pScene, pCam, fig, trail, mats, parts;
    const st = { skin: null, trail: null, on: false, t: 0, last: 0 };
    function build() {
      r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.outputEncoding = THREE.sRGBEncoding;
      pScene = new THREE.Scene();
      pCam = new THREE.PerspectiveCamera(32, 2, 1, 2000);
      pCam.position.set(0, 105, 250); pCam.lookAt(0, 26, 0);
      pScene.add(new THREE.HemisphereLight(0xeef6ff, 0x5a5f66, 0.9));
      const sunL = new THREE.DirectionalLight(0xfff3e2, 0.9); sunL.position.set(1, 2, 1.5); pScene.add(sunL);
      const M = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
      mats = { skin: M(0xc79275), sleeve: M(0), glove: M(0), accent: M(0), pants: M(0), shirt: M(0), hair: M(0x2a2420) };
      mats.skin.color.set(0xc79275).convertSRGBToLinear(); mats.hair.color.set(0x2a2420).convertSRGBToLinear();
      const box = (w, h, d, m, x, y, z, parent) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); parent.add(o); return o; };
      const limb = (x, y, parent) => { const g = new THREE.Group(); g.position.set(x, y, 0); parent.add(g); return g; };
      fig = new THREE.Group(); pScene.add(fig);
      const bodyG = new THREE.Group(); fig.add(bodyG);
      box(20, 24, 11, mats.shirt, 0, 48, 0, bodyG);
      box(20.4, 3, 11.4, mats.accent, 0, 37.5, 0, bodyG);
      box(19, 6, 10, mats.pants, 0, 34, 0, bodyG);
      box(13, 13, 13, mats.skin, 0, 67, 0, bodyG);
      box(13.6, 5, 13.6, mats.hair, 0, 72.5, 0.4, bodyG);
      const legs = [-5, 5].map(x => { const g = limb(x, 32, bodyG); box(8, 30, 8, mats.pants, 0, -15, 0, g); box(8.4, 5, 13, mats.accent, 0, -31, -2, g); return g; });
      const arms = [-13.5, 13.5].map(x => {
        const g = limb(x, 58, bodyG);
        box(6.4, 11, 6.4, mats.sleeve, 0, -5.5, 0, g); box(5.6, 10, 5.6, mats.skin, 0, -15, 0, g);
        box(6, 2.4, 6, mats.accent, 0, -18.5, 0, g); box(6.4, 6, 6.4, mats.glove, 0, -22.5, 0, g);
        return g;
      });
      parts = { bodyG, legs, arms };
      models.runner.then(g => {
        if (!g) return;
        const R = makeRunner(g, (key) => (mats[key] = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: key === 'joints' ? 0.45 : 0.6, metalness: key === 'joints' ? 0.2 : 0, skinning: true })));
        fig.add(R.root); bodyG.visible = false; parts.runner = R;
        if (st.skin) setSkin(st.skin);
      });
      const floor = new THREE.Mesh(new THREE.CylinderGeometry(118, 118, 6, 48), new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2a3038).convertSRGBToLinear(), roughness: 0.9 }));
      floor.position.y = -3; pScene.add(floor);
      trail = makeTrail([24, 12], 1.2, pScene, pCam);
    }
    function setSkin(k) {
      const c = (m, v) => m.color.set(v).convertSRGBToLinear();
      c(mats.sleeve, k.sleeve); c(mats.glove, k.glove); c(mats.pants, k.pants); c(mats.shirt, k.shirt);
      if (k.accent !== 'hue') c(mats.accent, k.accent);
      // the model: shirt colour on the body, accent on the joints
      if (mats.surface) c(mats.surface, k.shirt);
      if (mats.joints && k.accent !== 'hue') c(mats.joints, k.accent);
    }
    function setTrail(tr) {
      const u = trail.mat.uniforms;
      u.rainbow.value = tr.color === 'hue' ? 1 : 0;
      if (tr.color !== 'hue' && tr.id !== 'none') { u.c0.value.set(tr.color); u.c1.value.set(tr.tail || tr.color); }
      if (tr.id === 'none') trail.clear();
    }
    function loop(now) {
      if (!st.on) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.25, (now - (st.last || now)) / 1000); st.last = now; st.t += dt;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (w && (cv.width !== Math.round(w * r.getPixelRatio()) || cv.height !== Math.round(h * r.getPixelRatio()))) { r.setSize(w, h, false); pCam.aspect = w / h; pCam.updateProjectionMatrix(); }
      // jog a circle, facing along it
      const a = st.t * 1.6, R = 72;
      fig.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
      fig.rotation.y = -a + Math.PI;
      const sw = Math.sin(st.t * 11);
      parts.legs[0].rotation.x = sw * 0.75; parts.legs[1].rotation.x = -sw * 0.75;
      parts.arms[0].rotation.x = -sw * 0.8; parts.arms[1].rotation.x = sw * 0.8;
      parts.bodyG.position.y = Math.abs(Math.cos(st.t * 11)) * 3;
      if (parts.runner) parts.runner.update(dt, 300, false);
      if (st.skin.accent === 'hue') { mats.accent.color.set(hueColor(now / 1000 * 0.12)).convertSRGBToLinear(); if (mats.joints) mats.joints.color.copy(mats.accent.color); }
      trail.mat.uniforms.t.value = now / 1000;
      if (st.trail.id !== 'none') trail.update(fig.position.x, 0, fig.position.z, now / 1000, true);
      r.render(pScene, pCam);
    }
    return {
      show(skin, tr) {
        if (!r) build();
        if (skin !== st.skin) { st.skin = skin; setSkin(skin); }
        if (tr !== st.trail) { st.trail = tr; setTrail(tr); }
        if (!st.on) { st.on = true; st.last = 0; requestAnimationFrame(loop); }
      },
      stop() { st.on = false; },
      get skin() { return st.skin; }, get trail() { return st.trail; },
      get trailObj() { return trail; },
    };
  })();

  // ------------------------------------------------------------ stats
  const stats = { jumps: 0, jumpSpeed: 0, syncGood: 0, syncAll: 0, lastSync: null, lastYaw: 0, gain: 0 };
  const speedHist = new Float32Array(360);
  let histIdx = 0;

  // Strafe efficiency: each air tick, the speed your keys and mouse added,
  // as a share of the most one tick of air strafing can add at that speed
  // (wish exactly sideways to your velocity, which gives sqrt(v^2 + 30^2)).
  // Measured on the input alone, so walls and ramps don't skew it.
  const eff = { live: 0, sum: 0, n: 0, last: null, show: 0 };
  const _wv = [0, 0, 0];
  function trackStrafe(cmd) {
    const p = player;
    if (p.onGround || p.wallrun || p.climb || p.mantle || p.slide || p.groundNormal) return;
    const v = p.hspeed();
    if (v < 100) return;
    const y0 = p.yaw, p0 = p.pitch; p.yaw = cmd.yaw; p.pitch = cmd.pitch;
    const w = p.wish(cmd);
    p.yaw = y0; p.pitch = p0;
    let gain = 0;
    if (w.speed > 0) {
      const cap = Math.min(w.speed, p.cfg.airCap);
      const add = cap - (p.vel[0] * w.dir[0] + p.vel[2] * w.dir[2]);
      if (add > 0) {
        const as = Math.min(add, p.cfg.airaccelerate * w.speed * TICK);
        _wv[0] = p.vel[0] + as * w.dir[0]; _wv[2] = p.vel[2] + as * w.dir[2];
        gain = Math.hypot(_wv[0], _wv[2]) - v;
      }
    }
    const best = Math.hypot(v, p.cfg.airCap) - v;
    const e = Math.max(-1, Math.min(1, gain / best));
    eff.live += (e - eff.live) * 0.12;
    eff.sum += e; eff.n++;
    eff.show = 0.6;
  }

  function trackSync(cmd) {
    const dy = cmd.yaw - stats.lastYaw;
    stats.lastYaw = cmd.yaw;
    if (player.onGround || Math.abs(dy) < 1e-6) return;
    stats.syncAll++;
    // turning left (yaw increasing) should be paired with A, right with D
    if ((dy > 0 && cmd.side < 0) || (dy < 0 && cmd.side > 0)) stats.syncGood++;
  }

  // ------------------------------------------------------------ camera feel
  const cam = { dip: 0, dipVel: 0, roll: 0, fovKick: 0, bobPhase: 0, bob: 0, flip: 0, kick: 0, kickVel: 0, kickRoll: 0 };

  const EVENT_SFX = { jump: 'jump', slide: 'slide', wallrun: 'wallrun', walljump: 'walljump', climbjump: 'walljump', climb: 'climb', vault: 'vault', mantle: 'vault' };
  function handleEvents() {
    for (const e of player.events) {
      if (EVENT_SFX[e.type]) A.play(EVENT_SFX[e.type]);
      tutorialEvent(e.type);
      if (e.type === 'land' && e.speed > 120) A.play('land', { speed: e.speed, surface: surfaceOf(player.groundBrush) });
      if (e.type === 'jump') {
        if (stats.syncAll > 10) stats.lastSync = stats.syncGood / stats.syncAll;
        if (eff.n > 10) eff.last = eff.sum / eff.n;
        eff.sum = eff.n = 0;
        stats.syncGood = stats.syncAll = 0;
        stats.jumps++;
        stats.gain = e.speed - stats.jumpSpeed;
        stats.jumpSpeed = e.speed;
      } else if (e.type === 'land') {
        // big drop with crouch held: tuck and roll (camera only, speed is untouched)
        if (e.speed > 620 && down('duck')) { if (settings.flip) cam.flip = 0.0001; body.act('roll', 0.55); A.play('slide'); }
        else if (e.speed > 200) {
          cam.dipVel -= Math.min(260, (e.speed - 150) * 0.5);
          // a hard landing nods the view down and jolts it sideways a touch
          if (settings.landKick && e.speed > 330) {
            const k = Math.min(1, (e.speed - 330) / 700);
            cam.kickVel += 30 + k * 75;
            cam.kickRoll = (Math.random() < 0.5 ? -1 : 1) * k * 2.2 * DEG;
          }
        }
        if (player.hspeed() < 20) { stats.jumps = 0; eff.last = null; }
      } else if (e.type === 'climbjump') {
        turnLeft = Math.PI;
      } else if (e.type === 'mantle' || e.type === 'vault') {
        cam.dipVel -= e.type === 'vault' ? 60 : 120;
        body.act('vault', e.type === 'vault' ? 0.4 : 0.55);
      }
    }
    player.events.length = 0;
  }

  // ------------------------------------------------------------ first-person body
  // Mirror's Edge style: you see your own arms and legs. They live in their own
  // little scene drawn over the world, posed procedurally from the move state.
  const body = (() => {
    const vScene = new THREE.Scene();
    const vCam = new THREE.PerspectiveCamera(66, 1, 0.5, 600);
    vCam.rotation.order = 'YXZ';
    const vHemi = new THREE.HemisphereLight(0xeef6ff, 0x6f747d, 0.85);
    vScene.add(vHemi);
    const vSun = new THREE.DirectionalLight(0xfff3e2, 0.85);
    vSun.position.set(0.4, 1, 0.5);
    vScene.add(vSun);
    const M = (c, r) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).convertSRGBToLinear(), roughness: r, metalness: 0, envMap, envMapIntensity: 0.35 });
    const skin = M(0xc79275, 0.6), sleeve = M(0x1d2026, 0.85), glove = M(0x1a1c20, 0.55), red = M(0xdb2f2a, 0.5);
    const pants = M(0x2c3139, 0.9), shoe = M(0xdb2f2a, 0.45), sole = M(0xf4f4f0, 0.6), shirt = M(0xf2f2ee, 0.85);
    // limb pieces hang down -Y from their joint
    const seg = (r1, r2, h, mat, y0 = 0) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 16), mat); m.position.y = y0 - h / 2; return m; };
    const ball = (r, mat, y = 0) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat); m.position.y = y; return m; };
    const boxm = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };

    const UPPER = 11, FORE = 10.5;
    function makeArm(side) {
      const shoulder = new THREE.Group();
      shoulder.rotation.order = 'YZX';
      shoulder.add(ball(2.1, sleeve), seg(2.15, 1.95, 4.5, sleeve), seg(1.75, 1.55, UPPER - 4, skin, -4.5));
      const elbow = new THREE.Group(); elbow.position.y = -UPPER; shoulder.add(elbow);
      elbow.add(ball(1.6, skin), seg(1.6, 1.2, FORE, skin), seg(1.32, 1.32, 1.6, red, -FORE + 2.6));
      const wrist = new THREE.Group(); wrist.position.y = -FORE; elbow.add(wrist);
      wrist.add(boxm(3.1, 3.6, 1.4, glove, 0, -1.8, 0));
      const knuckles = new THREE.Group(); knuckles.position.y = -3.5; wrist.add(knuckles);
      knuckles.add(boxm(2.9, 2.6, 1.15, glove, 0, -1.3, 0));
      wrist.add(boxm(0.95, 2.4, 0.95, glove, -side * 1.7, -1.6, -0.6));
      return { shoulder, elbow, wrist, knuckles, side, cur: { x: 0.6, z: 0, y: 0, e: 1.4, w: 0, k: 0.4, p: -1.2 } };
    }
    function makeLeg(side) {
      const hip = new THREE.Group();
      hip.position.set(side * 4.2, 0, 0);
      hip.add(seg(3.0, 2.4, 17, pants));
      const knee = new THREE.Group(); knee.position.y = -17; hip.add(knee);
      knee.add(ball(2.3, pants), seg(2.3, 1.8, 17, pants));
      const foot = new THREE.Group(); foot.position.y = -17; knee.add(foot);
      foot.add(boxm(3.4, 3.2, 9.5, shoe, 0, -1.4, -2.6), boxm(3.6, 1.2, 10, sole, 0, -3.4, -2.6), boxm(3.5, 0.8, 4, sole, 0, 0.2, -5.2));
      return { hip, knee, foot, side, cur: { h: 0, k: 0, s: 0 } };
    }
    const armsRoot = new THREE.Group(); armsRoot.rotation.order = 'YXZ';
    const arms = [makeArm(-1), makeArm(1)];
    for (const a of arms) { a.shoulder.position.set(a.side * 9, -6.5, 3); armsRoot.add(a.shoulder); }
    vScene.add(armsRoot);
    // lower body hangs off the hips, facing along the view yaw only
    const hips = new THREE.Group();
    hips.add(boxm(13, 9, 7, pants, 0, 3, 1.5), boxm(14, 14, 8, shirt, 0, 13, 1.5), boxm(14.2, 1.6, 8.2, red, 0, 6.8, 1.5));
    const legs = [makeLeg(-1), makeLeg(1)];
    for (const l of legs) hips.add(l.hip);
    vScene.add(hips);

    // The runner model takes over once it loads. The block rig above keeps
    // posing, hidden, and the model's arm and leg bones copy the directions
    // of its limbs, so every move keeps its pose. The head is shrunk away so
    // the camera can sit inside it; look down and you see your own body.
    let fp = null;
    models.runner.then(g => {
      if (!g) return;
      const root = THREE.SkeletonUtils.clone(g.scene);
      const mats = { surface: M(0xf2f2ee, 0.6), joints: M(0xdb2f2a, 0.45) };
      mats.surface.skinning = mats.joints.skinning = true;
      const bone = {};
      root.traverse(o => {
        if (o.isMesh) { o.material = /joint/i.test(o.material.name) ? mats.joints : mats.surface; o.frustumCulled = false; }
        if (o.isBone) bone[o.name.replace(/^mixamorig:?/, '')] = o;
      });
      const holder = new THREE.Group();
      holder.add(root); root.rotation.y = Math.PI;
      holder.updateMatrixWorld(true);
      const v = new THREE.Vector3();
      let lo = Infinity, hi = -Infinity;
      for (const b of Object.values(bone)) { b.getWorldPosition(v); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); }
      const sc = 72 / ((hi - lo) / 0.9);
      root.scale.multiplyScalar(sc); root.position.y = -lo * sc;
      bone.Head.scale.setScalar(0.001);
      holder.updateMatrixWorld(true);
      const hipH = bone.Hips.getWorldPosition(v).y;
      const bind = new Map(Object.values(bone).map(b => [b, b.quaternion.clone()]));
      const L = (n) => bone['Left' + n], R = (n) => bone['Right' + n];
      // [model bone, its child, rig piece from, rig piece to]
      const chains = [];
      for (const [a, side] of [[arms[0], L], [arms[1], R]]) {
        // the forearm and hand also take a palm direction, so the wrist
        // turns the right way instead of whatever the shortest swing gives
        chains.push([side('Arm'), side('ForeArm'), a.shoulder, a.elbow], [side('ForeArm'), side('Hand'), a.elbow, a.wrist, a], [side('Hand'), side('HandMiddle1'), a.wrist, a.knuckles, a]);
      }
      for (const [l, side] of [[legs[0], L], [legs[1], R]]) {
        chains.push([side('UpLeg'), side('Leg'), l.hip, l.knee], [side('Leg'), side('Foot'), l.knee, l.foot]);
      }
      // lift the body so its shoulders sit where the rig's shoulders are when
      // standing and looking level, so the hands come into view the same way
      holder.position.set(0, -30 - hipH, 6); holder.updateMatrixWorld(true);
      const sh = L('Arm').getWorldPosition(new THREE.Vector3()).add(R('Arm').getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
      const lift = new THREE.Vector3(0, -6.5, 3).sub(sh);
      vScene.add(holder);
      armsRoot.visible = hips.visible = false;
      // finger joints curl toward the palm with the rig's knuckles. In the
      // model's rest pose every bone shares one frame: arms out along X,
      // palms down (-Y), so the curl axis is the same for a whole hand
      const fingers = [];
      for (const [a, side, sgn] of [[arms[0], 'Left', -1], [arms[1], 'Right', 1]]) {
        const ax = new THREE.Vector3(0, 0, sgn);
        for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const j of [1, 2, 3]) { const b = bone[side + 'Hand' + f + j]; if (b) fingers.push([b, a, ax, j === 1 ? 0.8 : 1]); }
        // the thumb folds in across the curled fingers
        const t1 = bone[side + 'HandThumb1'], t3 = bone[side + 'HandThumb3'];
        if (t1 && t3) {
          const d = t3.position.clone().add(bone[side + 'HandThumb2'].position).normalize();
          const tax = d.clone().cross(new THREE.Vector3(0, -1, 0)).normalize();
          fingers.push([t1, a, new THREE.Vector3(1, 0, 0), 0.8], [bone[side + 'HandThumb2'], a, tax, 0.6], [t3, a, tax, 0.7]);
        }
      }
      bone.LeftHand.scale.setScalar(HAND); bone.RightHand.scale.setScalar(HAND);
      // first-person cheat: the collarbones slide forward and out, so the
      // hands sit further from the eye (smaller, higher, off to the sides)
      // without bending the arms up into view
      const reach = [[L('Shoulder') || L('Arm'), -1], [R('Shoulder') || R('Arm'), 1]].map(([b, s]) => [b, b.position.clone(), s]);
      fp = { holder, mats, bind, chains, hipH, lift, fingers, reach, spine: [bone.Spine1, bone.Spine2].filter(Boolean) };
      cosmetics.apply();
    });
    const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
    const _q = new THREE.Quaternion(), _w = new THREE.Quaternion(), _p = new THREE.Quaternion();
    function poseModel() {
      const h = fp.holder;
      // hips where the rig's hips are, feet below them
      h.position.set(hips.position.x, hips.position.y - fp.hipH, hips.position.z).add(fp.lift);
      h.rotation.x = hips.rotation.x;
      for (const [b, q] of fp.bind) b.quaternion.copy(q);
      vScene.updateMatrixWorld(true);
      // looking up, the upper body leans back with the view so the arms
      // follow; looking down, the body stays put and slips back a little so
      // you see your chest and legs rather than the inside of your collar
      const look = vCam.rotation.x;
      h.position.z += Math.max(0, -look) * 9;
      h.updateMatrixWorld(true);
      _q.setFromAxisAngle(_a.set(1, 0, 0), Math.max(0, look) * 0.35);
      for (const b of fp.spine) {
        b.getWorldQuaternion(_w).premultiply(_q);
        b.parent.getWorldQuaternion(_p);
        b.quaternion.copy(_p.invert().multiply(_w));
        b.updateMatrixWorld(true);
      }
      const R = REACH;
      for (const [b, p0, s] of fp.reach) {
        b.position.copy(p0); b.updateMatrixWorld(true);
        b.getWorldPosition(_c).add(_d.set(s * R[0], R[1], -R[2]));
        b.position.copy(b.parent.worldToLocal(_c));
        b.updateMatrixWorld(true);
      }
      for (const [b, child, from, to, arm] of fp.chains) {
        if (!b || !child) continue;
        from.getWorldPosition(_a); to.getWorldPosition(_b); _b.sub(_a).normalize();
        if (arm) {
          // bone frame from rest: along the bone (+-X), palm down (-Y)
          _c.copy(child.position).normalize(); _d.set(0, -1, 0);
          _m1.makeBasis(_c, _d, _e.crossVectors(_c, _d));
          // target: along the rig limb, palm turned in from the rig's palm side
          arm.wrist.getWorldQuaternion(_w); _d.set(0, 0, -1).applyQuaternion(_w);
          _d.applyAxisAngle(_b, arm.side * arm.cur.p);
          _d.addScaledVector(_b, -_d.dot(_b)).normalize();
          _m2.makeBasis(_b, _d, _e.crossVectors(_b, _d));
          _w.setFromRotationMatrix(_m2.multiply(_m1.transpose()));
        } else {
          b.getWorldPosition(_c); child.getWorldPosition(_d); _d.sub(_c).normalize();
          _q.setFromUnitVectors(_d, _b);
          b.getWorldQuaternion(_w).premultiply(_q);
        }
        b.parent.getWorldQuaternion(_p);
        b.quaternion.copy(_p.invert().multiply(_w));
        b.updateMatrixWorld(true);
      }
      for (const [b, a, ax, w] of fp.fingers) b.quaternion.multiply(_q.setFromAxisAngle(ax, w * FCURL * a.cur.k));
      if (fp.fingers.length) fp.holder.updateMatrixWorld(true);
    }
    const FCURL = 1.5, HAND = 0.85, REACH = [3, 0, 5];
    const _e = new THREE.Vector3(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();

    const st = { phase: 0, act: null, actT: 0, actDur: 0, roll: 0 };
    const lerp = (a, b, k) => a + (b - a) * k;
    function act(name, dur) { st.act = name; st.actT = 0; st.actDur = dur; }

    // targets in radians: x swings the arm forward, z lifts it out sideways,
    // e bends the elbow, w tips the wrist, k curls the fingers
    function armTarget(a, mode, t, hs) {
      // p turns the palm around the forearm: -1.2 makes fists with the palms
      // facing each other and the thumbs on top, 1 keeps an open hand flat to whatever it is reaching for
      const g = armPose(a, mode, t, hs);
      g.p = OPEN[mode] ? 1 : -1.2;
      return g;
    }
    const OPEN = { climb: 1, wallhand: 1, vault: 1, surf: 1 };
    function armPose(a, mode, t, hs) {
      const s = a.side, run = Math.min(1, hs / 260);
      const swing = Math.sin(st.phase + (s > 0 ? 0 : Math.PI));
      switch (mode) {
        case 'roll': return { x: 2.0, z: -s * 0.3, y: 0, e: 2.2, w: 0, k: 1 };
        case 'vault': return { x: 1.55, z: s * 0.35, y: 0, e: 0.55, w: -0.9, k: 0 };
        case 'climb': { const c = Math.sin(t * 13 + (s > 0 ? 0 : Math.PI)); return { x: 2.05 + c * 0.25, z: s * 0.05, y: 0, e: 0.6 + c * 0.3, w: -0.4, k: 0.2 }; }
        case 'wallhand': return { x: 1.3, z: s * 1.0, y: 0, e: 0.2, w: 0, k: 0 };
        case 'slide': return s < 0 ? { x: -0.25, z: -0.35, y: 0, e: 0.3, w: 0.2, k: 0.2 } : { x: 1.0, z: 0.25, y: 0, e: 1.0, w: 0, k: 0.6 };
        case 'surf': return { x: 0.75, z: s * 1.15, y: 0, e: 0.35, w: 0, k: 0.3 };
        case 'air': return { x: 1.15 + Math.sin(t * 3 + s) * 0.05, z: s * 0.45, y: 0, e: 0.75, w: 0, k: 0.35 };
        default: return { x: 0.9 + swing * 0.45 * run, z: s * 0.15, y: 0, e: 1.1 - swing * 0.3 * run, w: -0.6, k: 1 };
      }
    }
    function legTarget(l, mode, hs) {
      const s = l.side, run = Math.min(1, hs / 260);
      const swing = Math.sin(st.phase + (s > 0 ? Math.PI : 0));
      switch (mode) {
        case 'slide': return s < 0 ? { h: 1.45, k: -0.15, s: 0 } : { h: 1.1, k: -0.9, s: 0 };
        case 'roll': return { h: 1.9, k: -2.2, s: 0 };
        case 'air': case 'surf': return { h: 0.55 + s * 0.15, k: -0.9, s: 0 };
        case 'climb': case 'wallrun': return { h: 0.5 + swing * 0.5, k: -0.9 - swing * 0.4, s: 0 };
        default: return { h: swing * 0.6 * run, k: -(0.2 + Math.max(0, -swing) * 1.0 * run), s: 0 };
      }
    }

    function update(dt, hs, pitchNow, rollNow, bob, dip) {
      const p = player;
      st.phase += dt * Math.max(hs, 0) * 0.034;
      if (st.act) { st.actT += dt; if (st.actT > st.actDur) st.act = null; }
      let mode = 'run';
      if (st.act === 'roll') mode = 'roll';
      else if (p.mantle || st.act === 'vault') mode = 'vault';
      else if (p.climb) mode = 'climb';
      else if (p.wallrun) mode = 'wallrun';
      else if (p.slide && p.onGround) mode = 'slide';
      else if (!p.onGround && surfing()) mode = 'surf';
      else if (!p.onGround) mode = 'air';
      const k = Math.min(1, dt * 14);
      const t = performance.now() / 1000;
      for (const a of arms) {
        let m = mode;
        if (mode === 'wallrun') m = a.side === p.wallrun.side ? 'wallhand' : 'run';
        const g = armTarget(a, m, t, mode === 'wallrun' ? 260 : hs);
        for (const key in g) a.cur[key] = lerp(a.cur[key], g[key], k);
        a.shoulder.rotation.set(a.cur.x, a.cur.y, a.cur.z);
        a.elbow.rotation.x = a.cur.e;
        a.wrist.rotation.x = a.cur.w;
        a.knuckles.rotation.x = a.cur.k;
      }
      for (const l of legs) {
        const g = legTarget(l, mode, hs);
        for (const key in g) l.cur[key] = lerp(l.cur[key], g[key], k);
        l.hip.rotation.x = l.cur.h;
        l.knee.rotation.x = l.cur.k;
        l.foot.rotation.x = -l.cur.h - l.cur.k;
      }
      // the arms ride with the view; the body only turns with yaw
      vCam.rotation.set(pitchNow, 0, rollNow);
      armsRoot.rotation.copy(vCam.rotation);
      armsRoot.position.set(0, bob * 0.6 + dip * 0.25, 0);
      const eye = p.viewOffset;
      const slideBack = mode === 'slide' ? 10 : 0;
      hips.position.set(0, -Math.min(eye, 64) + 34 + (p.ducked ? 6 : 0), 6 + slideBack);
      hips.rotation.x = mode === 'slide' ? -0.35 : 0;
      if (fp) poseModel();
    }
    function render() {
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(vScene, vCam);
      renderer.autoClear = true;
    }
    function resize(aspect) { vCam.aspect = aspect; vCam.updateProjectionMatrix(); }
    // a runner skin recolours the kit; skin tone and soles stay
    const lin = (c) => new THREE.Color(c).convertSRGBToLinear();
    function setSkin(k) {
      sleeve.color.copy(lin(k.sleeve)); glove.color.copy(lin(k.glove)); pants.color.copy(lin(k.pants)); shirt.color.copy(lin(k.shirt));
      if (fp) fp.mats.surface.color.copy(lin(k.shirt));
      setAccent(k.accent);
    }
    function setAccent(c) { red.color.copy(lin(c)); shoe.color.copy(lin(c)); if (fp) fp.mats.joints.color.copy(lin(c)); }
    // night levels: moonlight with a little city glow
    const setNight = (on) => { vHemi.color.set(on ? 0x8a9ad0 : 0xeef6ff); vHemi.groundColor.set(on ? 0x4a2a55 : 0x6f747d); vHemi.intensity = on ? 0.38 : 0.85; vSun.color.set(on ? 0xa8b8ff : 0xfff3e2); vSun.intensity = on ? 0.22 : 0.85; };
    return { update, render, resize, act, st, armsRoot, hips, setSkin, setAccent, setNight };
  })();
  cosmetics.apply();
  onResize = body.resize;
  body.resize(window.innerWidth / window.innerHeight);

  // ------------------------------------------------------------ HUD
  const $ = (id) => document.getElementById(id);
  const hud = {
    speed: $('speed'), speedWrap: $('speedwrap'), jump: $('jumpstat'), timer: $('timer'), course: $('course'),
    bestEl: $('best'), stage: $('stage'), toast: $('toast'), graph: $('graph'), keys: $('keys'),
    k: { w: $('k-w'), a: $('k-a'), s: $('k-s'), d: $('k-d'), j: $('k-j'), c: $('k-c'), ml: $('k-ml'), mr: $('k-mr') },
    strafe: $('strafe'), strafeFill: $('strafe-fill'), strafePct: $('strafe-pct'),
    state: $('movestate'),
  };
  const gctx = hud.graph.getContext('2d');
  let toastTimer = 0;
  function toast(msg, ms) {
    hud.toast.textContent = msg;
    hud.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hud.toast.classList.remove('show'), ms || 1800);
  }
  // split popup under the timer: the time, and how far ahead (-) or behind (+) the best run
  let splitTimer = 0;
  function showSplit(label, ticks, pb) {
    $('split-label').textContent = label;
    $('split-time').textContent = fmt(ticks);
    const d = $('split-delta');
    if (pb) {
      const diff = (ticks - pb) * TICK;
      d.textContent = (diff < 0 ? '-' : '+') + Math.abs(diff).toFixed(2);
      d.className = diff < 0 ? 'ahead' : diff > 0 ? 'behind' : 'even';
    } else { d.textContent = ''; d.className = ''; }
    const el = $('split');
    el.classList.add('show');
    clearTimeout(splitTimer);
    splitTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }
  function fmt(ticks) {
    const t = ticks * TICK;
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  }
  function updateCourseHud() {
    const c = game.course && map.courses[game.course];
    hud.course.textContent = c ? c.name : '';
    hud.bestEl.textContent = c && best[game.course] ? 'Best ' + fmt(best[game.course]) : c ? 'No time yet' : 'Pick a beacon or press 1, 2, 3';
  }
  updateCourseHud();

  let smoothSpeed = 0, lastShown = -1, trend = 0, hudYaw = 0, mouseTurn = 0, mouseHold = 0, turnStep = 0;
  function drawHud(dt) {
    const hs = player.hspeed();
    const prevSmooth = smoothSpeed;
    smoothSpeed += (hs - smoothSpeed) * Math.min(1, dt * 20);
    trend += ((smoothSpeed - prevSmooth) / Math.max(dt, 1e-3) - trend) * Math.min(1, dt * 6);
    const shown = Math.round(hs);
    if (shown !== lastShown) { hud.speed.textContent = shown; lastShown = shown; }
    hud.speedWrap.dataset.trend = trend > 25 ? 'up' : trend < -25 ? 'down' : 'flat';

    let jt = '';
    if (stats.jumps > 0) {
      jt = 'Jump ' + stats.jumps + '  ·  ' + Math.round(stats.jumpSpeed) + ' u/s';
      if (stats.jumps > 1) jt += '  ·  ' + (stats.gain >= 0 ? '+' : '') + Math.round(stats.gain);
      if (stats.lastSync !== null) jt += '  ·  sync ' + Math.round(stats.lastSync * 100) + '%';
      if (eff.last !== null) jt += '  ·  strafe ' + Math.round(Math.max(0, eff.last) * 100) + '%';
    }
    hud.jump.textContent = jt;

    const st = player.mantle ? (player.mantle.vault ? 'Vault' : 'Mantle') : player.wallrun ? 'Wallrun' : player.climb ? 'Climb'
      : player.slide ? 'Slide' : !player.onGround && player.groundNormal === null && surfing() ? 'Surf' : '';
    hud.state.textContent = st;
    hud.state.classList.toggle('on', !!st);

    if (game.course) {
      const ticks = game.running ? game.tick - game.startTick : game.finished !== null ? game.finished : 0;
      hud.timer.textContent = fmt(ticks);
      hud.timer.classList.toggle('idle', !game.running);
      hud.stage.textContent = 'Stage ' + (game.cp + 1) + ' / ' + map.courses[game.course].stages;
    } else {
      hud.timer.textContent = '';
      hud.stage.textContent = '';
    }

    if (settings.keys) {
      hud.k.w.classList.toggle('on', down('forward'));
      hud.k.a.classList.toggle('on', down('left'));
      hud.k.s.classList.toggle('on', down('back'));
      hud.k.d.classList.toggle('on', down('right'));
      hud.k.j.classList.toggle('on', player.jumpPressed || down('jump'));
      hud.k.c.classList.toggle('on', down('duck'));
      // mouse turn direction this frame, the other half of a strafe
      // (held a moment so it doesn't flicker between mouse events)
      const dy = yaw - hudYaw - turnStep;
      if (Math.abs(dy) > 1e-4) { mouseTurn = Math.sign(dy); mouseHold = 0.08; } else if ((mouseHold -= dt) <= 0) mouseTurn = 0;
      hud.k.ml.classList.toggle('on', mouseTurn > 0);
      hud.k.mr.classList.toggle('on', mouseTurn < 0);
    }
    hudYaw = yaw; turnStep = 0;

    // strafe meter: live while you are airborne, fades out after you land
    eff.show = Math.max(0, eff.show - dt);
    const showStrafe = settings.strafeMeter && eff.show > 0;
    hud.strafe.classList.toggle('on', showStrafe);
    if (showStrafe) {
      const e = Math.max(0, eff.live);
      hud.strafeFill.style.width = (e * 100).toFixed(1) + '%';
      hud.strafeFill.className = e > 0.8 ? 'good' : e < 0.4 ? 'bad' : '';
      hud.strafePct.textContent = Math.round(e * 100) + '%';
    }

    // speed trace, last ~6 seconds
    const W = hud.graph.width, H = hud.graph.height;
    gctx.clearRect(0, 0, W, H);
    let max = 600;
    for (let i = 0; i < speedHist.length; i++) if (speedHist[i] > max) max = speedHist[i];
    max = Math.ceil(max / 250) * 250;
    gctx.strokeStyle = 'rgba(255,255,255,0.18)';
    gctx.lineWidth = 1;
    for (let v = 250; v < max; v += 250) {
      const y = H - (v / max) * (H - 2);
      gctx.beginPath(); gctx.moveTo(0, y + 0.5); gctx.lineTo(W, y + 0.5); gctx.stroke();
    }
    gctx.beginPath();
    for (let i = 0; i < speedHist.length; i++) {
      const v = speedHist[(histIdx + i) % speedHist.length];
      const x = (i / (speedHist.length - 1)) * W, y = H - (v / max) * (H - 2) - 1;
      if (i === 0) gctx.moveTo(x, y); else gctx.lineTo(x, y);
    }
    gctx.strokeStyle = '#ffffff';
    gctx.lineWidth = 2;
    gctx.stroke();
  }

  function surfing() {
    const p = player.pos;
    const tr = world.trace(p, [p[0], p[1] - 4, p[2]], player.hull);
    return tr.normal && tr.normal[1] > 0.05 && tr.normal[1] < 0.7;
  }

  // ------------------------------------------------------------ level complete
  const LEVEL_ORDER = ['tutorial'].concat(map.order, map.gauntlet, map.night);
  const completeEl = $('complete');
  let completeTimer = 0;
  function nextLevel(name) {
    const i = LEVEL_ORDER.indexOf(name);
    return i >= 0 && i < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[i + 1] : null;
  }
  function showComplete(ticks, prevBest, isBest) {
    const c = map.courses[game.course], r = game.run || { top: 0, dist: 0, jumps: 0 };
    const secs = ticks * TICK;
    $('c-name').textContent = c.name;
    lbRenderComplete();
    $('c-time').textContent = fmt(ticks);
    const badge = $('c-best');
    badge.classList.toggle('new', isBest);
    badge.textContent = isBest ? (prevBest ? 'New best, ' + fmt(prevBest - ticks).replace(/^0:0?/, '-') + 's' : 'First clear') : 'Best ' + fmt(prevBest) + '  (+' + (((ticks - prevBest) * TICK).toFixed(2)) + 's)';
    $('c-top').textContent = Math.round(r.top);
    $('c-avg').textContent = Math.round(r.dist / Math.max(secs, 0.01));
    $('c-jumps').textContent = r.jumps;
    $('c-dist').textContent = (r.dist * 0.0254).toFixed(0);
    $('c-watch').hidden = game.course === 'custom' || !ghost.has(game.course);
    const sv = $('c-save');
    sv.hidden = !game.lastRun || game.lastRun.course !== game.course;
    sv.disabled = false; sv.innerHTML = 'Save replay <kbd>S</kbd>';
    const nx = nextLevel(game.course);
    $('c-next').textContent = game.course === 'custom' ? 'Back to editor' : nx ? 'Next: ' + map.courses[nx].name : 'Back to levels';
    $('c-next').dataset.target = game.course === 'custom' ? 'editor' : nx || 'levels';
    const job = game.mission !== null ? STORY[game.mission] : null;
    $('c-label').textContent = job ? (game.mission ? 'Job ' + game.mission : 'Prologue') + ' complete' : 'Level complete';
    $('c-story').hidden = !job;
    if (job) {
      $('c-name').textContent = job.title;
      const before = storyStars();
      const got = finishJob(game.mission, secs);
      const fresh = SKINS.concat(TRAILS).filter(it => it.need > before && it.need <= storyStars());
      $('c-unlock').hidden = !fresh.length;
      $('c-unlock').textContent = 'Unlocked: ' + fresh.map(it => it.name + (SKINS.includes(it) ? ' skin' : ' trail')).join(', ') + '. Pick it in Cosmetics.';
      $('c-stars').innerHTML = job.stars ? starHtml(got) + '<small>' + starNote(job, got) + '</small>' : '';
      $('c-debrief').textContent = job.debrief;
      const nj = game.mission + 1 < STORY.length ? game.mission + 1 : null;
      $('c-next').textContent = nj !== null ? 'Next job: ' + STORY[nj].title : 'Story complete';
      $('c-next').dataset.target = nj !== null ? 'job:' + nj : 'story';
    }
    // let the landing play out, then hand back the mouse
    clearTimeout(completeTimer);
    completeTimer = setTimeout(() => {
      document.body.classList.add('complete');
      completeEl.hidden = false;
      if (document.pointerLockElement) document.exitPointerLock();
      else if (locked) softLock(false);
      $('c-next').focus({ preventScroll: true });
    }, 900);
  }
  function closeComplete() {
    clearTimeout(completeTimer);
    document.body.classList.remove('complete');
    completeEl.hidden = true;
  }
  function completeAction(what) {
    A.init(); A.play('click');
    if (what === 'save') { saveLastRun(); return; }
    closeComplete();
    if (what === 'next') {
      const t = $('c-next').dataset.target;
      if (t === 'story') { goIdle(); showMenuState(); openDrawer('story'); return; }
      if (t === 'editor') { edBack(); return; }
      if (t === 'levels') { goIdle(); game.started = false; showMenuState(); showScreen('levels'); return; }
      if (t.startsWith('job:')) { startJob(+t.slice(4)); return; }
      goCourse(t);
      startPlay();
    }
    else if (what === 'retry') { restartCourse(); startPlay(); }
    else if (what === 'watch') watchBest(game.course, 'levels');
    else if (ed.testing) edBack();
    else { showMenuState(); showScreen('levels'); } // levels: back to level select
  }
  for (const b of completeEl.querySelectorAll('[data-act]')) b.addEventListener('click', () => completeAction(b.dataset.act));
  window.addEventListener('keydown', (e) => {
    if (completeEl.hidden) return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (e.code === 'Enter') { e.preventDefault(); completeAction('next'); }
    else if (e.code === 'KeyR') completeAction('retry');
    else if (e.code === 'Escape') completeAction('levels');
    else if (e.code === 'KeyV' && game.course !== 'custom' && ghost.has(game.course)) completeAction('watch');
    else if (e.code === 'KeyS' && !$('c-save').hidden) completeAction('save');
  });

  // ------------------------------------------------------------ tutorial
  const tut = { step: -1, done: false, hops: 0, surfTicks: 0 };
  const tutEl = $('tut');
  // the same steps told with the on-screen controls
  const TOUCH_TUT = {
    Move: ['Push the left stick to move, drag on the right to look. Head down the corridor.', ['Stick', 'Drag']],
    Jump: ['Tap Jump to clear the gap. Fall in and you go back to the last step.', ['Jump']],
    Bunnyhop: ['Hold Jump through the landings. You jump again the moment you touch down, so you never lose speed to ground friction.', ['Hold Jump']],
    'Air strafe': ['Hold Jump and drag your thumb left and right on it. Auto strafe presses A and D for you as you turn, so smooth swipes add speed. Reach 350 u/s to open the gate.', ['Hold Jump + swipe']],
    Slide: ['Run, then tap Crouch to slide under the pipe. Tap it again to stand.', ['Crouch']],
    Vault: ['Run at the low wall and tap Jump just before it. You hop over without losing speed.', ['Stick up', 'Jump']],
    Climb: ['Run straight at the wall and tap Jump to run up it. Keep the stick pushed up to pull yourself onto the ledge.', ['Stick up', 'Jump']],
    Wallrun: ['Run along a wall at a slight angle and jump toward it with the stick pushed up to run on it. Tap Jump again to kick off.', ['Stick up', 'Jump']],
    Surf: ['Jump onto the ramp. Push the stick sideways toward it to ride the slope, not up. Aim a little down the ramp to go faster.', ['Stick toward ramp']],
  };
  function resetTutorial() {
    tut.step = -1; tut.done = false;
    setDoor('strafe', false);
    tutEl.hidden = true;
  }
  function stepInfo() { return tut.step >= 0 ? map.courses.tutorial.steps[tut.step] : null; }
  function enterStep(t) {
    if (game.course !== 'tutorial' || t.idx <= tut.step) return;
    if (t.idx > game.cp) { game.cp = t.idx; game.cpSpawn = t.spawn; }
    // the previous step counts as done once you reach the next one
    tut.step = t.idx; tut.done = false; tut.hops = 0; tut.surfTicks = 0;
    renderStep();
  }
  function renderStep(final) {
    tutEl.hidden = false;
    tutEl.classList.toggle('done', tut.done);
    if (final) {
      $('tut-step').textContent = 'Tutorial complete';
      $('tut-title').textContent = 'You know the moves';
      $('tut-body').textContent = (TOUCH ? 'Tap II' : 'Press Esc') + ' and pick a level. Surf and Bhop are the gentlest starts; Crossover uses everything you just did.';
      $('tut-keys').textContent = '';
      tutEl.classList.add('done');
      return;
    }
    const s = stepInfo();
    const n = map.courses.tutorial.steps.length;
    $('tut-step').textContent = 'Step ' + (tut.step + 1) + ' of ' + n;
    $('tut-title').textContent = s.title;
    const tt = TOUCH && TOUCH_TUT[s.title];
    $('tut-body').textContent = tt ? tt[0] : s.body;
    const keysEl = $('tut-keys');
    keysEl.textContent = '';
    for (const k of tt ? tt[1] : s.keys) { const kc = document.createElement('span'); kc.className = 'kc'; kc.textContent = k; keysEl.appendChild(kc); }
  }
  function completeStep() {
    if (tut.done) return;
    tut.done = true;
    const s = stepInfo();
    if (s && s.done === 'strafe') { setDoor('strafe', true); toast('Gate open'); }
    A.play('checkpoint');
    renderStep();
  }
  function tutorialEvent(type) {
    const s = game.course === 'tutorial' && stepInfo();
    if (!s || tut.done) return;
    if (s.done === 'jump' && type === 'jump') completeStep();
    else if (s.done === 'bhop' && type === 'jump' && ++tut.hops >= 3) completeStep();
    else if (s.done === 'slide' && type === 'slide') completeStep();
    else if (s.done === 'vault' && (type === 'vault' || type === 'mantle')) completeStep();
    else if (s.done === 'mantle' && (type === 'mantle' || type === 'climb')) completeStep();
    else if (s.done === 'wallrun' && type === 'wallrun') completeStep();
  }
  function tutorialTick() {
    const s = game.course === 'tutorial' && stepInfo();
    if (!s || tut.done) return;
    if (s.done === 'move' && player.hspeed() > 200) completeStep();
    else if (s.done === 'strafe' && player.hspeed() >= 350) completeStep();
    else if (s.done === 'surf') {
      tut.surfTicks = !player.onGround && surfing() ? tut.surfTicks + 1 : 0;
      if (tut.surfTicks > 60) completeStep();
    }
  }
  function finishTutorial() {
    tut.step = -1;
    renderStep(true);
  }

  // footsteps from distance covered, faster and lighter on walls
  let stride = 0;
  // what a footstep sounds like on each kind of brush
  const SURFACE = { route: 'metal', ramp: 'metal', crane: 'metal', door: 'metal', wall: 'metal', block: 'wood', pad: 'tile', lane: 'tile', floor: 'tile', interior: 'tile', cliff: 'gravel' };
  const surfaceOf = (b) => (b && b.props && SURFACE[b.props.kind]) || 'concrete';
  function footsteps() {
    const hs = player.hspeed();
    const walking = player.onGround && !player.slide && hs > 60;
    if (!walking && !player.wallrun && !player.climb) { stride = Math.min(stride, 40); return; }
    stride += (player.climb ? 300 : hs) * TICK;
    const len = player.wallrun ? 70 : player.climb ? 45 : 64 + hs * 0.06;
    if (stride > len) {
      stride = 0;
      const surface = player.wallrun ? 'metal' : player.climb ? 'concrete' : surfaceOf(player.groundBrush);
      A.play('step', { pitch: player.wallrun ? 1.35 : player.ducked ? 0.8 : 1, soft: player.ducked, surface });
    }
  }

  // ------------------------------------------------------------ speed lines and fps
  // Thin streaks rush past the edges of the screen as you pass about 450 u/s
  // and thicken toward 1500. A 2D canvas over the view keeps it cheap.
  const speedLines = (() => {
    const cv = document.getElementById('lines'), ctx = cv.getContext('2d');
    const N = 70, ls = [];
    const spawn = (l, fresh) => { l.a = Math.random() * Math.PI * 2; l.r = fresh ? 0.35 + Math.random() * 0.9 : 0.35 + Math.random() * 0.25; l.v = 1.2 + Math.random() * 1.6; l.w = 0.6 + Math.random() * 1.4; };
    for (let i = 0; i < N; i++) { const l = {}; spawn(l, true); ls.push(l); }
    let amt = 0, shown = false;
    return {
      update(dt, hs, on) {
        amt += ((on ? Math.max(0, Math.min(1, (hs - 450) / 1050)) : 0) - amt) * Math.min(1, dt * 5);
        if (amt < 0.01) { if (shown) { ctx.clearRect(0, 0, cv.width, cv.height); shown = false; } return; }
        const w = cv.clientWidth, h = cv.clientHeight, pr = Math.min(window.devicePixelRatio || 1, 2);
        if (cv.width !== Math.round(w * pr) || cv.height !== Math.round(h * pr)) { cv.width = Math.round(w * pr); cv.height = Math.round(h * pr); }
        ctx.setTransform(pr, 0, 0, pr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        shown = true;
        const cx = w / 2, cy = h / 2, R = Math.hypot(cx, cy);
        ctx.lineCap = 'round';
        const n = Math.round(N * (0.35 + 0.65 * amt));
        for (let i = 0; i < n; i++) {
          const l = ls[i];
          l.r += l.v * dt * (0.6 + amt * 1.4);
          if (l.r > 1.15) spawn(l, false);
          const r0 = l.r * R, r1 = r0 + R * (0.06 + 0.22 * amt) * l.v / 2;
          const c = Math.cos(l.a), s = Math.sin(l.a);
          // fade in from the middle so the centre of the screen stays clear
          const fade = Math.min(1, Math.max(0, (l.r - 0.4) / 0.25));
          const al = amt * fade;
          ctx.beginPath(); ctx.moveTo(cx + c * r0, cy + s * r0); ctx.lineTo(cx + c * r1, cy + s * r1);
          // a faint dark edge keeps the white streak readable over pale buildings and sky
          ctx.strokeStyle = 'rgba(20,28,38,' + (0.16 * al).toFixed(3) + ')'; ctx.lineWidth = l.w * (1.2 + amt) + 2; ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 * al).toFixed(3) + ')'; ctx.lineWidth = l.w * (1.2 + amt); ctx.stroke();
        }
      },
    };
  })();
  const fpsEl = document.getElementById('fps');
  const fpsMeter = { n: 0, t: 0 };
  function updateFps(dt) {
    fpsEl.hidden = !settings.fps;
    if (!settings.fps) return;
    fpsMeter.n++; fpsMeter.t += dt;
    if (fpsMeter.t >= 0.5) { fpsEl.textContent = Math.round(fpsMeter.n / fpsMeter.t) + ' FPS'; fpsMeter.n = 0; fpsMeter.t = 0; }
  }

  // ------------------------------------------------------------ loop
  let acc = 0, last = performance.now(), histTimer = 0;

  function step() {
    const cmd = buildCmd();
    raceHold(cmd);
    prev.pos = player.pos.slice();
    prev.eye = player.viewOffset;
    trackSync(cmd);
    trackStrafe(cmd);
    player.tick(cmd, TICK);
    game.tick++;
    footsteps();
    if (game.running) {
      const hs = player.hspeed();
      game.run.top = Math.max(game.run.top, hs);
      game.run.dist += hs * TICK;
      for (const e of player.events) if (e.type === 'jump') game.run.jumps++;
      ghost.tick(game.tick - game.startTick);
    }
    handleEvents();
    handleTriggers();
    tutorialTick();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    pollPad(dt);

    if (turnLeft > 0) {
      const s = Math.min(turnLeft, dt * Math.PI / 0.24);
      yaw += s; turnLeft -= s; turnStep += s;
    }

    if ((locked || game.demo) && !game.freeze && !ed.on) {
      acc += dt;
      let n = 0;
      while (acc >= TICK && n < 12) { step(); acc -= TICK; n++; }
      if (n === 12) acc = 0;
    }
    const alpha = acc / TICK;
    if (!replay.on) ghost.update(dt, game.running ? game.tick - game.startTick + alpha : game.inStart && game.course ? 0 : null);
    raceFrame(dt);

    histTimer += dt;
    while (histTimer > 1 / 60) { speedHist[histIdx] = player.hspeed(); histIdx = (histIdx + 1) % speedHist.length; histTimer -= 1 / 60; }

    // camera
    const p = player.pos;
    const ix = prev.pos[0] + (p[0] - prev.pos[0]) * alpha;
    const iy = prev.pos[1] + (p[1] - prev.pos[1]) * alpha;
    const iz = prev.pos[2] + (p[2] - prev.pos[2]) * alpha;
    const eye = prev.eye + (player.viewOffset - prev.eye) * alpha;

    // landing dip: critically damped spring
    cam.dipVel += (-cam.dip * 160 - cam.dipVel * 22) * dt;
    cam.dip += cam.dipVel * dt;
    if (cam.dip < -14) { cam.dip = -14; cam.dipVel = Math.max(cam.dipVel, 0); }
    cam.kickVel += (-cam.kick * 220 - cam.kickVel * 24) * dt;
    cam.kick += cam.kickVel * dt;
    cam.kickRoll += (0 - cam.kickRoll) * Math.min(1, dt * 7);

    const hs = player.hspeed();
    if (settings.bob && player.onGround && !player.slide && hs > 40) {
      cam.bobPhase += dt * hs * 0.034;
      cam.bob += (Math.sin(cam.bobPhase) * Math.min(hs / 250, 1) * 1.1 - cam.bob) * Math.min(1, dt * 12);
    } else {
      cam.bob += (0 - cam.bob) * Math.min(1, dt * 8);
    }

    let rollTarget = 0;
    if (player.wallrun) rollTarget = -player.wallrun.side * 11 * DEG;
    else if (player.slide) rollTarget = 2.5 * DEG;
    cam.roll += (rollTarget - cam.roll) * Math.min(1, dt * 9);

    const kick = settings.fovKick ? Math.max(0, Math.min(1, (hs - 320) / 1600)) * 12 : 0;
    cam.fovKick += (kick - cam.fovKick) * Math.min(1, dt * 4);
    const vf = baseVFov() + cam.fovKick;
    if (Math.abs(camera.fov - vf) > 0.01) { camera.fov = vf; camera.updateProjectionMatrix(); }

    if (ed.on) {
      edUpdate(dt);
    } else if (replay.on) {
      replayFrame(dt);
    } else if (!locked && !game.demo && attract.active) {
      updateAttract(dt, now / 1000);
    } else {
      // landing roll: one forward somersault of the view
      let flipPitch = 0;
      if (cam.flip > 0) {
        cam.flip += dt / 0.55;
        if (cam.flip >= 1) cam.flip = 0;
        else { const u = cam.flip; flipPitch = -Math.PI * 2 * (u * u * (3 - 2 * u)); }
      }
      camera.position.set(ix, iy + eye + cam.dip + cam.bob - (cam.flip > 0 ? Math.sin(cam.flip * Math.PI) * 26 : 0), iz);
      const tilt = settings.roll / 100;
      camera.rotation.set(pitch + flipPitch - cam.kick * DEG, yaw, (cam.roll + cam.kickRoll) * tilt);
      if (settings.body) body.update(dt, hs, pitch + flipPitch, cam.roll * tilt, cam.bob, cam.dip);
    }
    cosmetics.update(now, ix, iy, iz, hs, (locked || !!game.demo) && !attract.active && !ed.on && !replay.on);
    speedLines.update(dt, hs, settings.speedLines && (locked || !!game.demo) && !attract.active && !ed.on && !replay.on);
    updateFps(dt);
    A.update({
      speed: hs, playing: locked || !!game.demo, airborne: !player.onGround,
      surfing: !player.onGround && surfing(), sliding: !!player.slide && player.onGround, slideTime: player.slide ? player.slide.t : 0,
      wallrun: !!player.wallrun, wallrunTime: player.wallrun ? player.wallrun.t : 0,
    });
    sky.position.copy(camera.position);
    // the Night City levels light the world for night
    const viewing = !locked && !game.demo && attract.active ? attract.course : game.course;
    const wantNight = !!(viewing && map.courses[viewing] && map.courses[viewing].set === 'night');
    if (wantNight !== nightOn) setNight(wantNight);

    const cp = camera.position;
    sun.position.set(cp.x + sunDir.x * 5000, cp.y + sunDir.y * 5000, cp.z + sunDir.z * 5000);
    sun.target.position.copy(cp);

    const t = now / 1000;
    for (const b of beacons) {
      b.beam.material.opacity = 0.12 + Math.sin(t * 2 + b.phase) * 0.05;
      b.sprite.position.y = b.y0 + Math.sin(t * 1.6 + b.phase) * 8;
    }

    drawHud(dt);
    const ts = now / 1000;
    animated.water.offset.set(ts * 0.012, ts * 0.007);
    animated.lava.uniforms.t.value = ts;
    // Runner Vision: route pieces glow and breathe
    MATS.paint.emissiveIntensity = 0.15 + Math.sin(ts * 2.4) * 0.06;
    camera.updateMatrixWorld();
    updateModelChunks();
    renderer.render(scene, camera);
    if (settings.body && (locked || game.demo) && !attract.active && !ed.on && !replay.on) body.render();
  }

  // ------------------------------------------------------------ online leaderboard
  // Each player's best per level lives in one shared doc, times/<their id>,
  // which only they can write and everyone can read. Names come from the
  // viewer's own claude.ai directory and are never stored. The board only
  // lights up inside claude.ai; anywhere else the game runs without it.
  const LB_AA = 150; // only runs at the standard air acceleration count
  const lb = { db: null, user: null, me: null, docs: null, readOnly: false, writing: Promise.resolve(), backfilled: false };
  // reworked levels post under a new field, so old times drop off the board
  const lbKey = (c) => REBUILT[c] ? c + REBUILT[c] : c;
  const lbMine = () => { const d = lb.docs && lb.docs.find(x => x.id === lb.me); return d ? d.t : {}; };
  function lbWrite(changes) {
    if (!lb.db || !lb.me || lb.readOnly) return;
    lb.writing = lb.writing.then(() => {
      const body = Object.assign({}, lbMine(), changes, { at: Date.now() });
      return lb.db.doc('times/' + lb.me).set(body);
    }).catch((e) => {
      if (e && (e.code === 'invalid_argument' || e.code === 'not_granted' || e.code === 'revoked')) { lb.readOnly = true; lbRender(); }
    });
  }
  function lbSubmit(course, ticks, run) {
    if (course === 'custom') return;
    if (net.ok) { netSubmit(course, ticks, run); return; }
    if (!lb.db || settings.airaccelerate !== LB_AA) return;
    const cur = lbMine()[lbKey(course)];
    if (!(typeof cur === 'number' && cur <= ticks)) lbWrite({ [lbKey(course)]: ticks });
  }
  // put bests set before the leaderboard existed online, once
  function lbBackfill() {
    if (lb.backfilled || !lb.me || settings.airaccelerate !== LB_AA) return;
    lb.backfilled = true;
    const mine = lbMine(), up = {};
    for (const c of LEVEL_ORDER) if (best[c] && !(typeof mine[lbKey(c)] === 'number' && mine[lbKey(c)] <= best[c])) up[lbKey(c)] = best[c];
    if (Object.keys(up).length) lbWrite(up);
  }
  function lbStandings(course) {
    const k = lbKey(course);
    return (lb.docs || []).filter(d => typeof d.t[k] === 'number' && d.t[k] > 0)
      .map(d => ({ id: d.id, ticks: d.t[k] })).sort((a, b) => a.ticks - b.ticks);
  }
  let lbToken = 0;
  async function lbRender() {
    if (net.ok) { netRenderLb(); return; }
    const el = $('lb');
    if (!lb.db) { el.hidden = true; return; }
    const course = typeof selected === 'string' ? selected : null;
    if (!course) { el.hidden = true; return; }
    el.hidden = false;
    const token = ++lbToken;
    const all = lbStandings(course);
    const top = all.slice(0, 10);
    const myRank = all.findIndex(r => r.id === lb.me);
    if (myRank >= 10) top.push(null, Object.assign({ rank: myRank }, all[myRank]));
    const ps = await lb.user.profiles(top.filter(Boolean).map(r => r.id));
    if (token !== lbToken) return;
    $('lb-title').textContent = 'Online top times · ' + rowCourse(course).name;
    const ol = $('lb-list');
    ol.textContent = '';
    top.forEach((r, i) => {
      const li = document.createElement('li');
      if (!r) { li.className = 'gap'; ol.appendChild(li); return; }
      if (r.id === lb.me) li.className = 'me';
      const p = ps[r.id] || {};
      const rank = document.createElement('span'); rank.className = 'r'; rank.textContent = (r.rank !== undefined ? r.rank : i) + 1;
      const img = document.createElement('img'); img.alt = ''; img.src = p.avatarUrl || '';
      const name = document.createElement('span'); name.className = 'n'; name.textContent = r.id === lb.me ? (p.name || 'You') + ' (you)' : p.name || 'Someone';
      const t = document.createElement('span'); t.className = 't'; t.textContent = fmt(r.ticks);
      li.append(rank, img, name, t);
      ol.appendChild(li);
    });
    $('lb-note').textContent = !lb.docs ? 'Loading times…' : !all.length ? 'No times yet. Finish a run to set the first.' :
      lb.readOnly ? 'You can see the board but not post to it. Ask the owner for Contributor access.' :
      settings.airaccelerate !== LB_AA ? 'Your air acceleration is not ' + LB_AA + ', so your runs are not posted.' : '';
    lbRenderComplete();
  }
  function lbRenderComplete() {
    if (net.ok) { netRenderComplete(); return; }
    const el = $('c-online');
    const all = game.course && game.course !== 'custom' ? lbStandings(game.course) : [];
    const k = all.findIndex(r => r.id === lb.me);
    el.hidden = !lb.db || k < 0;
    if (k >= 0) el.textContent = 'Online rank #' + (k + 1) + ' of ' + all.length;
  }
  (async () => {
    const C = window.claude;
    if (!C || typeof C.use !== 'function') return;
    const [db, user] = await Promise.all([C.use('db'), C.use('user')]);
    if (!db || !user) return;
    const me = await user.id();
    if (!me) return;
    Object.assign(lb, { db, user, me });
    if ((await user.can('data.write')) === false) lb.readOnly = true;
    if (typeof noteReach === 'function') noteReach();
    db.collection('times').limit(1000).onSnapshot((snap) => {
      lb.docs = snap.docs.map(d => ({ id: d.id, t: d.data() || {} }));
      if (!snap.metadata.fromCache) lbBackfill();
      lbRender();
    }, () => { lb.db = null; lbRender(); });
    lbRender();
  })();

  // ------------------------------------------------------------ online
  // The Strafe server (server/ in the repo, on Cloudflare) holds one board
  // for every version of the game: browser, desktop and phone. You pick a
  // name the first time you post; the server keeps a key for it on this
  // device. Each run goes up with its ghost, and the server checks that it
  // starts at the start, ends in the finish and never moves faster than the
  // game allows. Live races go through a room on the same server. When the
  // server can't be reached the game falls back to the claude.ai board.
  const SERVER = decodeURIComponent((location.search.match(/[?&]server=([^&]+)/) || [])[1] || '') || 'https://strafe-online.strafe-game.workers.dev';
  const ONLINE_KEY = 'strafe.online.v1';
  const net = Object.assign({ id: null, token: null, name: null }, load(ONLINE_KEY) || {}, { ok: null, boards: {}, pending: null, last: null });
  const saveNet = () => save(ONLINE_KEY, { id: net.id, token: net.token, name: net.name });
  async function api(path, body) {
    const headers = {};
    if (body) headers['content-type'] = 'application/json';
    if (net.token) headers.authorization = 'Bearer ' + net.token;
    const r = await fetch(SERVER + '/api' + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
    let j = {};
    try { j = await r.json(); } catch (e) { /* not json */ }
    if (!r.ok) { const e = new Error(j.error || 'The server said no (' + r.status + ').'); e.status = r.status; throw e; }
    return j;
  }
  const canPost = () => settings.airaccelerate === LB_AA;
  async function getBoard(course, fresh) {
    const k = lbKey(course), c = net.boards[k];
    if (!fresh && c && performance.now() - c.at < 20000) return c.data;
    const data = await api('/board?course=' + encodeURIComponent(k) + (net.id ? '&me=' + net.id : ''));
    net.boards[k] = { at: performance.now(), data };
    return data;
  }
  function boardRow(r, me, raceBtn) {
    const li = document.createElement('li');
    if (r.id === me) li.className = 'me';
    const rank = document.createElement('span'); rank.className = 'r'; rank.textContent = r.rank;
    const name = document.createElement('span'); name.className = 'n'; name.textContent = r.name + (r.id === me ? ' (you)' : '');
    if (r.legacy) { const o = document.createElement('span'); o.className = 'old'; o.textContent = ' older time'; name.appendChild(o); }
    const t = document.createElement('span'); t.className = 't'; t.textContent = fmt(r.ticks);
    li.append(rank, name, t);
    if (raceBtn) li.appendChild(raceBtn);
    return li;
  }
  // the board beside the level select (wide screens)
  let netToken = 0;
  async function netRenderLb() {
    const el = $('lb');
    const course = typeof selected === 'string' && selected !== 'custom' ? selected : null;
    if (!course) { el.hidden = true; return; }
    el.hidden = false;
    $('lb-title').textContent = 'Online top times · ' + rowCourse(course).name;
    const token = ++netToken;
    let data;
    try { data = await getBoard(course); } catch (e) { if (token === netToken) $('lb-note').textContent = 'Could not load times.'; return; }
    if (token !== netToken) return;
    const ol = $('lb-list');
    ol.textContent = '';
    const rows = data.rows.slice(0, 10);
    for (const r of rows) {
      const li = boardRow(r, net.id);
      li.insertBefore(document.createElement('span'), li.children[1]); // the avatar column
      ol.appendChild(li);
    }
    if (data.mine && data.mine.rank > 10) {
      const gap = document.createElement('li'); gap.className = 'gap'; ol.appendChild(gap);
      const li = boardRow({ rank: data.mine.rank, id: net.id, name: net.name, ticks: data.mine.ticks }, net.id);
      li.insertBefore(document.createElement('span'), li.children[1]);
      ol.appendChild(li);
    }
    $('lb-note').textContent = !data.total ? 'No times yet. Finish a run to set the first.' :
      !canPost() ? 'Your air acceleration is not ' + LB_AA + ', so your runs are not posted.' :
      !net.token ? 'Finish a run to post your time.' : '';
  }
  function netRenderComplete() {
    const el = $('c-online'), l = net.last;
    const here = l && l.course === game.course;
    el.hidden = !here;
    if (here) el.textContent = l.error ? 'Not posted: ' + l.error : l.mine ? 'Online rank #' + l.mine.rank + ' of ' + l.total : 'Posting…';
    $('c-post').hidden = !(net.pending && net.pending.course === game.course && !net.token);
  }
  async function netSubmit(course, ticks, run) {
    if (!canPost() || !run) return;
    if (!net.token) { net.pending = { course, ticks, run }; net.last = null; netRenderComplete(); return; }
    net.last = { course };
    netRenderComplete();
    try {
      const res = await api('/run', { course: lbKey(course), ticks, ghost: run });
      net.last = { course, mine: res.mine, total: res.total };
      delete net.boards[lbKey(course)];
    } catch (e) {
      if (e.status === 401) { net.token = null; saveNet(); net.pending = { course, ticks, run }; net.last = null; }
      else net.last = { course, error: e.message };
    }
    if (game.course === course) netRenderComplete();
    lbRender();
  }
  // a new name: make the account, then bring this device's best times over
  async function netRegister(name) {
    const res = await api('/register', { name });
    Object.assign(net, { id: res.id, token: res.token, name: res.name });
    saveNet();
    const legacy = {}, mine = lbMine();
    for (const c of LEVEL_ORDER) {
      if (!best[c]) continue;
      const g = ghost.saved(c);
      if (g && g.e === 4 && Array.isArray(g.s)) {
        try { await api('/run', { course: lbKey(c), ticks: best[c], ghost: g }); continue; } catch (e) { /* fall back to an older time */ }
      }
      legacy[lbKey(c)] = best[c];
    }
    for (const k in mine) if (typeof mine[k] === 'number' && k !== 'at' && !(legacy[k] <= mine[k])) legacy[k] = mine[k];
    try { await api('/import', { times: legacy }); } catch (e) { /* already imported */ }
    const p = net.pending;
    net.pending = null;
    net.boards = {};
    if (p) await netSubmit(p.course, p.ticks, p.run);
    lbRender();
  }
  async function netSetName(name, msgEl) {
    msgEl.className = 'onmsg'; msgEl.textContent = 'Saving…';
    try {
      if (net.token) { const r = await api('/name', { name }); net.name = r.name; saveNet(); net.boards = {}; }
      else await netRegister(name);
      msgEl.textContent = 'You post as ' + net.name + '.';
      if (race.ws) raceSend({ t: 'hello', name: net.name });
      lbRender();
      return true;
    } catch (e) {
      msgEl.className = 'onmsg err'; msgEl.textContent = e.message;
      return false;
    }
  }
  $('c-post').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = await netSetName($('c-postname').value, $('c-postmsg'));
    if (ok) netRenderComplete();
  });
  $('on-nameform').addEventListener('submit', (e) => { e.preventDefault(); netSetName($('on-name').value, $('on-namemsg')); });

  // the Online pane: name, race room and the full board
  function fillLevels(sel, value) {
    if (!sel.options.length) for (const n of LEVEL_ORDER) sel.add(new Option(rowCourse(n).name, n));
    if (value && LEVEL_ORDER.includes(value)) sel.value = value;
  }
  function onlineOpen() {
    $('on-off').hidden = net.ok !== false;
    $('on-body').hidden = net.ok === false;
    $('on-name').value = net.name || '';
    $('on-namemsg').className = 'onmsg';
    $('on-namemsg').textContent = net.token ? '' : 'Pick a name to post your times and race.';
    fillLevels($('on-level'), typeof selected === 'string' && selected !== 'custom' ? selected : null);
    renderRacePane();
    renderBoard();
  }
  let boardToken = 0;
  async function renderBoard() {
    const course = $('on-level').value, ol = $('on-board'), msg = $('on-boardmsg');
    const token = ++boardToken;
    msg.textContent = 'Loading…';
    let data;
    try { data = await getBoard(course, true); } catch (e) { if (token === boardToken) msg.textContent = 'Could not load times.'; return; }
    if (token !== boardToken) return;
    ol.textContent = '';
    for (const r of data.rows) {
      const btn = document.createElement('span');
      btn.className = 'rowbtns';
      if (r.ghost) {
        const w = document.createElement('button'); w.className = 'ghost small'; w.textContent = 'Watch';
        w.title = 'Watch this run';
        w.addEventListener('click', () => watchOnline(course, r.id, r.name));
        const b = document.createElement('button'); b.className = 'ghost small'; b.textContent = 'Race';
        b.title = 'Race this ghost';
        b.addEventListener('click', () => raceGhost(course, r.id, r.name));
        btn.append(w, b);
      }
      ol.appendChild(boardRow(r, net.id, btn));
    }
    msg.textContent = !data.total ? 'No times yet.' : data.mine && data.mine.rank > data.rows.length ? 'You are #' + data.mine.rank + ' of ' + data.total + '.' : data.total + (data.total === 1 ? ' runner' : ' runners') + ' on this level.';
  }
  $('on-level').addEventListener('change', renderBoard);
  async function raceGhost(course, id, name) {
    try {
      const g = await api('/ghost?course=' + encodeURIComponent(lbKey(course)) + '&id=' + encodeURIComponent(id));
      ghost.useRemote(course, g.ghost);
      selected = course;
      playSelected();
      toast('Racing ' + name + "'s ghost (" + fmt(g.ticks) + ')', 2600);
    } catch (e) { $('on-boardmsg').textContent = 'Could not load that ghost.'; }
  }

  // ------------------------------------------------------------ live races
  const RACE_CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const race = { ws: null, code: null, you: null, room: null, offset: 0, round: 0, active: false, hold: false, course: null, finished: false, sendT: 0, results: 0, peers: new Map(), leaving: false };
  const raceNow = () => Date.now() + race.offset;
  const raceSend = (m) => { if (race.ws && race.ws.readyState === 1) race.ws.send(JSON.stringify(m)); };
  const raceMe = () => race.room && race.room.players.find(p => p.id === race.you);
  function raceConnect(code) {
    raceLeave();
    if (!net.name) { $('on-namemsg').className = 'onmsg err'; $('on-namemsg').textContent = 'Pick a name first.'; $('on-name').focus(); return; }
    race.code = code; race.leaving = false;
    $('race-msg').textContent = 'Connecting…';
    let ws;
    try { ws = new WebSocket(SERVER.replace(/^http/, 'ws') + '/race/' + code); } catch (e) { $('race-msg').textContent = 'Could not connect.'; return; }
    race.ws = ws;
    ws.onopen = () => { raceSend({ t: 'hello', name: net.name }); };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } raceMessage(m); };
    ws.onclose = () => {
      if (race.ws !== ws) return;
      const was = race.leaving;
      raceReset();
      if (!was) { $('race-msg').textContent = 'Lost the connection to the room.'; toast('Left the race room', 2000); }
      renderRacePane();
    };
    renderRacePane();
  }
  function raceReset() {
    race.ws = null; race.room = null; race.active = false; race.hold = false; race.you = null;
    for (const p of race.peers.values()) scene.remove(p.root);
    race.peers.clear();
    $('racehud').hidden = true; $('racecount').hidden = true;
  }
  function raceLeave() {
    if (!race.ws) return;
    race.leaving = true;
    const ws = race.ws;
    raceReset();
    try { ws.close(1000); } catch (e) { /* already closed */ }
    renderRacePane();
  }
  function raceMessage(m) {
    if (m.t === 'you') { race.you = m.id; return; }
    if (m.t === 's') { racePeerState(m); return; }
    if (m.t !== 'room') return;
    race.offset = m.now - Date.now();
    race.room = m;
    const me = raceMe();
    if (m.phase === 'race' && m.round !== race.round && me && me.racing) raceBegin(m);
    if (m.phase === 'results' && race.results !== m.round && race.round === m.round) { race.results = m.round; A.play('finish'); toast('Race over', 2000); }
    // drop runners who left
    for (const [id, p] of race.peers) if (!m.players.some(q => q.id === id)) { scene.remove(p.root); race.peers.delete(id); }
    renderRacePane();
  }
  function raceBegin(m) {
    race.round = m.round; race.active = true; race.finished = false; race.hold = true; race.course = m.course;
    closeDrawer();
    closeComplete();
    game.mission = null;
    selected = m.course;
    ghost.useRemote(null, null);
    goCourse(m.course);
    if (!locked) { showMenuState(); startPlay(); }
  }
  function raceHold(cmd) {
    if (!race.hold) return;
    if (!race.active || game.course !== race.course || raceNow() >= race.room.startAt) { race.hold = false; return; }
    cmd.forward = 0; cmd.side = 0; cmd.jump = false; cmd.duck = false;
  }
  function raceFinish() {
    if (!race.active || race.finished || game.course !== race.course || !race.room || race.room.phase !== 'race') return;
    race.finished = true;
    raceSend({ t: 'fin', ticks: 0 }); // the room times it from the go
  }
  // other racers: a see-through runner each, with a name over its head
  function racePeerState(m) {
    let p = race.peers.get(m.id);
    if (!p) {
      const hue = (parseInt(m.id, 16) % 360) / 360;
      const col = new THREE.Color().setHSL(hue, 0.8, 0.6);
      const mat = new THREE.MeshStandardMaterial({ color: col.clone().convertSRGBToLinear(), emissive: col.clone().convertSRGBToLinear().multiplyScalar(0.5), transparent: true, opacity: 0.7, depthWrite: false });
      const root = new THREE.Group();
      const box = (w, h, d, x, y) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, 0); root.add(b); return b; };
      box(20, 26, 11, 0, 47); box(8, 33, 8, -5.5, 17); box(8, 33, 8, 5.5, 17); box(6, 25, 6, -13.5, 46); box(6, 25, 6, 13.5, 46);
      const head = new THREE.Mesh(new THREE.SphereGeometry(7.5, 12, 8), mat); head.position.y = 68; root.add(head);
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
      const tex = new THREE.CanvasTexture(cv);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false }));
      tag.scale.set(0.16, 0.04, 1); tag.position.y = 100; tag.renderOrder = 11; root.add(tag);
      root.visible = false;
      scene.add(root);
      p = { root, cv, tex, name: '', buf: [] };
      race.peers.set(m.id, p);
    }
    const info = race.room && race.room.players.find(q => q.id === m.id);
    const name = info ? info.name : '';
    if (name !== p.name) {
      p.name = name;
      const g = p.cv.getContext('2d');
      g.clearRect(0, 0, 256, 64);
      g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(name, 128, 32);
      g.fillStyle = '#fff'; g.fillText(name, 128, 32);
      p.tex.needsUpdate = true;
    }
    p.c = m.c;
    p.buf.push({ at: performance.now(), p: m.p, y: m.y / 100, d: m.d });
    if (p.buf.length > 6) p.buf.shift();
  }
  function raceFrame(dt) {
    const on = race.active && race.room && game.course === race.course;
    // send where I am, ten times a second
    if (on && race.room.phase === 'race' && !race.finished) {
      race.sendT += dt;
      if (race.sendT >= 0.1) { race.sendT = 0; raceSend({ t: 's', p: player.pos, y: Math.round(yaw * 100), d: player.ducked ? 1 : 0, c: game.cp }); }
    }
    // others, drawn a little in the past so the motion is smooth
    const t = performance.now() - 150;
    for (const p of race.peers.values()) {
      const b = p.buf;
      p.root.visible = !!on && b.length > 0 && performance.now() - b[b.length - 1].at < 3000;
      if (!p.root.visible) continue;
      let i = b.length - 1;
      while (i > 0 && b[i - 1].at > t) i--;
      const a = b[Math.max(0, i - 1)], c = b[i], k = c.at > a.at ? Math.min(1, Math.max(0, (t - a.at) / (c.at - a.at))) : 1;
      p.root.position.set(a.p[0] + (c.p[0] - a.p[0]) * k, a.p[1] + (c.p[1] - a.p[1]) * k, a.p[2] + (c.p[2] - a.p[2]) * k);
      p.root.rotation.y = c.y;
      p.root.scale.y = c.d ? 0.72 : 1;
    }
    // countdown
    const cnt = $('racecount');
    const left = on && race.room.phase === 'race' ? race.room.startAt - raceNow() : -9999;
    if (left > 0) { cnt.hidden = false; const n = String(Math.ceil(left / 1000)); if (cnt.dataset.n !== n) { cnt.dataset.n = n; cnt.innerHTML = n + (locked ? '' : '<small>Resume to get ready</small>'); A.play('hover'); } }
    else if (left > -900) { cnt.hidden = false; if (cnt.dataset.n !== 'go') { cnt.dataset.n = 'go'; cnt.textContent = 'GO'; A.play('start'); } }
    else cnt.hidden = true;
    raceHud(on);
  }
  let hudKey = '';
  function raceHud(on) {
    const el = $('racehud');
    el.hidden = !on || !game.started;
    if (el.hidden) return;
    const ps = race.room.players.filter(p => p.racing).map(p => {
      const peer = race.peers.get(p.id);
      return { id: p.id, name: p.name, fin: p.fin, c: p.id === race.you ? game.cp : peer ? peer.c || 0 : 0 };
    });
    ps.sort((a, b) => (a.fin === null ? 1e9 : a.fin < 0 ? 2e9 : a.fin) - (b.fin === null ? 1e9 : b.fin < 0 ? 2e9 : b.fin) || b.c - a.c);
    const key = race.room.phase + ps.map(p => p.id + p.fin + p.c).join();
    if (key === hudKey) return;
    hudKey = key;
    $('rh-title').textContent = (race.room.phase === 'results' ? 'Results' : 'Race') + ' · ' + rowCourse(race.course).name;
    const ol = $('rh-list');
    ol.textContent = '';
    ps.forEach((p, i) => {
      const li = document.createElement('li');
      if (p.id === race.you) li.className = 'me';
      const r = document.createElement('span'); r.textContent = i + 1;
      const n = document.createElement('span'); n.textContent = p.name; n.style.overflow = 'hidden';
      const t = document.createElement('span'); t.className = 't';
      t.textContent = p.fin === null ? 'CP ' + p.c : p.fin < 0 ? 'Out' : fmt(p.fin);
      li.append(r, n, t);
      ol.appendChild(li);
    });
  }
  function renderRacePane() {
    const inRoom = !!race.ws;
    $('race-out').hidden = inRoom;
    $('race-in').hidden = !inRoom;
    if (!inRoom) return;
    const m = race.room;
    $('race-codeview').textContent = race.code;
    const ol = $('race-players');
    ol.textContent = '';
    if (!m) return;
    const host = m.host === race.you;
    const sorted = m.players.slice().sort((a, b) => (a.fin === null || a.fin < 0 ? 1e9 : a.fin) - (b.fin === null || b.fin < 0 ? 1e9 : b.fin));
    sorted.forEach((p, i) => {
      const li = document.createElement('li');
      if (p.id === race.you) li.className = 'me';
      const r = document.createElement('span'); r.className = 'r'; r.textContent = m.phase === 'lobby' ? '' : i + 1;
      const n = document.createElement('span'); n.className = 'n'; n.textContent = p.name + (p.id === race.you ? ' (you)' : '') + (p.id === m.host ? ' · host' : '');
      const t = document.createElement('span'); t.className = 't';
      t.textContent = m.phase === 'lobby' ? '' : !p.racing ? 'Watching' : p.fin === null ? (m.phase === 'race' ? 'Racing' : 'Did not finish') : p.fin < 0 ? 'Gave up' : fmt(p.fin);
      li.append(r, n, t, document.createElement('span'));
      ol.appendChild(li);
    });
    $('race-hostrow').hidden = !host;
    const lv = $('race-level');
    fillLevels(lv, m.course || null);
    if (host && !m.course) raceSend({ t: 'level', course: lv.value, key: lbKey(lv.value) });
    $('race-start').disabled = m.phase === 'race';
    $('race-start').textContent = m.phase === 'race' ? 'Racing…' : m.phase === 'results' ? 'Race again' : 'Start race';
    const hostName = (m.players.find(p => p.id === m.host) || {}).name || 'the host';
    $('race-msg').textContent = m.phase === 'race' ? 'Race on: ' + rowCourse(m.course).name + '.' :
      m.players.length < 2 ? 'Send the code to a friend. You can also start on your own.' :
      host ? '' : 'Level: ' + (m.course ? rowCourse(m.course).name : 'not picked yet') + '. Waiting for ' + hostName + ' to start.';
  }
  $('race-make').addEventListener('click', () => {
    let c = '';
    for (let i = 0; i < 5; i++) c += RACE_CODE[Math.floor(Math.random() * RACE_CODE.length)];
    raceConnect(c);
  });
  $('race-joinform').addEventListener('submit', (e) => {
    e.preventDefault();
    const c = $('race-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length < 4) { $('race-msg').textContent = ''; $('race-code').focus(); return; }
    raceConnect(c);
  });
  $('race-leave').addEventListener('click', () => { raceLeave(); $('race-msg').textContent = ''; });
  $('race-level').addEventListener('change', () => { const v = $('race-level').value; raceSend({ t: 'level', course: v, key: lbKey(v) }); });
  $('race-start').addEventListener('click', () => { A.init(); raceSend({ t: 'start' }); });
  $('race-copy').addEventListener('click', () => {
    const done = () => toast('Room code copied', 1500);
    try { navigator.clipboard.writeText(race.code).then(done, () => toast('Room code: ' + race.code, 2500)); } catch (e) { toast('Room code: ' + race.code, 2500); }
  });

  // is the server there? if not, the claude.ai board carries on as before
  (async () => {
    try {
      if (net.token) {
        try { const me = await api('/me'); net.name = me.name; saveNet(); } catch (e) { if (e.status === 401) { net.token = null; net.id = null; saveNet(); } else throw e; }
      } else await api('/board?course=tutorial');
      net.ok = true;
    } catch (e) { net.ok = false; }
    lbRender();
    if (!drawer.hidden && !$('on-body').closest('[data-pane]').hidden) onlineOpen();
    // inside claude.ai, note whether the page could reach the server
    noteReach();
  })();
  function noteReach() {
    if (lb.db && lb.me && !lb.readOnly && net.ok !== null) lb.db.doc('reach/' + lb.me).set({ ok: net.ok, at: Date.now() }).catch(() => {});
  }

  // ------------------------------------------------------------ replay viewer
  // Watch any run that has a ghost: your own best on a level, or a run from
  // the online board. Play, pause, slow it down, scrub, and pick a camera:
  // behind the runner, through its eyes, or a free camera you fly yourself
  // (keyboard and mouse). Drag the view to look around. Nothing here touches
  // the physics: the replay only moves the ghost runner and the camera.
  const RP_SPEEDS = [0.1, 0.25, 0.5, 1, 2, 4];
  const replay = {
    on: false, course: null, g: null, name: '', ticks: 0, t: 0, rate: 3, playing: true, cam: 'follow', from: null,
    orbit: { yaw: 0, pitch: -0.3, dist: 300 }, free: { pos: [0, 0, 0], yaw: 0, pitch: 0 }, look: [0, 0, 0], camPos: null, keys: new Set(), drag: null, last: null,
  };
  const rpEl = $('replay');
  function replayOpen(course, g, name, ticks, from) {
    if (!g || !Array.isArray(g.s) || !g.s.length) return;
    A.init();
    if (document.pointerLockElement) document.exitPointerLock();
    else if (locked) softLock(false);
    if (race.ws && race.active) raceLeave();
    closeDrawer();
    closeComplete();
    ghost.stop();
    goCourse(course);
    $('toast').classList.remove('show');
    game.started = false; attract.active = false;
    Object.assign(replay, { on: true, course, g, name, ticks: ticks || (g.s.length / 5 - 1) * g.e, t: 0, rate: 3, playing: true, cam: 'follow', from, camPos: null, last: null });
    replay.orbit.yaw = 0; replay.orbit.pitch = -0.3; replay.orbit.dist = 300;
    document.body.classList.add('replaying');
    rpEl.hidden = false;
    $('rp-who').textContent = name + ' · ' + rowCourse(course).name;
    const sc = $('rp-scrub');
    sc.max = String(replay.ticks); sc.value = '0';
    for (const b of rpEl.querySelectorAll('[data-cam]')) b.hidden = b.dataset.cam === 'free' && TOUCH;
    replayUi();
    $('rp-play').focus({ preventScroll: true });
  }
  function replayClose() {
    if (!replay.on) return;
    replay.on = false;
    replay.keys.clear();
    document.body.classList.remove('replaying');
    rpEl.hidden = true;
    ghost.hide();
    goIdle();
    game.started = false;
    selected = replay.course;
    showScreen('levels');
    if (replay.from === 'online' || replay.from === 'replays') openDrawer(replay.from);
  }
  function replayUi() {
    $('rp-play').textContent = replay.playing ? 'Pause' : 'Play';
    $('rp-rate').textContent = RP_SPEEDS[replay.rate] + '×';
    for (const b of rpEl.querySelectorAll('[data-cam]')) b.setAttribute('aria-pressed', String(b.dataset.cam === replay.cam));
  }
  const replaySeek = (t) => { replay.t = Math.max(0, Math.min(replay.ticks, t)); };
  function replayCamMode(m) {
    if (m === 'free' && TOUCH) m = 'follow';
    if (m === 'free' && replay.cam !== 'free') {
      // start the free camera where the view is now
      replay.free.pos = [camera.position.x, camera.position.y, camera.position.z];
      replay.free.yaw = camera.rotation.y; replay.free.pitch = camera.rotation.x;
    }
    replay.cam = m;
    replayUi();
  }
  // called from frame() instead of the physics and the game camera
  function replayFrame(dt) {
    if (replay.playing) {
      replay.t += dt / TICK * RP_SPEEDS[replay.rate];
      if (replay.t >= replay.ticks) { replay.t = replay.ticks; replay.playing = false; replayUi(); }
    }
    const p = ghost.show(replay.g, replay.t, dt * RP_SPEEDS[replay.rate]);
    if (document.activeElement !== $('rp-scrub')) $('rp-scrub').value = String(Math.round(replay.t));
    $('rp-time').textContent = fmt(Math.round(replay.t)) + ' / ' + fmt(replay.ticks);
    $('rp-speed').textContent = Math.round(p.hs) + ' u/s';
    const eye = p.duck ? 46 : 64;
    if (replay.cam === 'pov') {
      ghost.root.visible = false; // the camera is inside it
      camera.position.set(p.x, p.y + eye, p.z);
      camera.rotation.set(replay.orbit.pitch + 0.3, p.yaw + replay.orbit.yaw, 0);
    } else if (replay.cam === 'free') {
      const f = replay.free, k = replay.keys;
      const sp = (k.has('ShiftLeft') || k.has('ShiftRight') ? 2400 : 700) * dt;
      const fx = -Math.sin(f.yaw) * Math.cos(f.pitch), fy = Math.sin(f.pitch), fz = -Math.cos(f.yaw) * Math.cos(f.pitch);
      const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
      const mv = (a, b) => (k.has(a) || k.has(b) ? 1 : 0);
      const fw = mv('KeyW', 'ArrowUp') - mv('KeyS', 'ArrowDown'), sd = mv('KeyD', 'ArrowRight') - mv('KeyA', 'ArrowLeft'), up = mv('KeyE', 'Space') - mv('KeyQ', 'KeyC');
      f.pos[0] += (fx * fw + rx * sd) * sp; f.pos[1] += (fy * fw + up) * sp; f.pos[2] += (fz * fw + rz * sd) * sp;
      camera.position.set(f.pos[0], f.pos[1], f.pos[2]);
      camera.rotation.set(f.pitch, f.yaw, 0);
    } else {
      // behind the runner, swinging round smoothly as it turns
      const o = replay.orbit, yawC = p.yaw + o.yaw;
      const tx = p.x, ty = p.y + 50, tz = p.z;
      const want = [tx + Math.sin(yawC) * Math.cos(o.pitch) * o.dist, ty - Math.sin(o.pitch) * o.dist, tz + Math.cos(yawC) * Math.cos(o.pitch) * o.dist];
      const c = replay.camPos || (replay.camPos = want.slice());
      const a = Math.min(1, dt * 6);
      for (let q = 0; q < 3; q++) c[q] += (want[q] - c[q]) * a;
      // never let a big jump in the run (a respawn, a scrub) drag the camera across the map
      if (Math.hypot(want[0] - c[0], want[1] - c[1], want[2] - c[2]) > 1500) for (let q = 0; q < 3; q++) c[q] = want[q];
      camera.position.set(c[0], c[1], c[2]);
      camera.lookAt(tx, ty, tz);
    }
    if (Math.abs(camera.fov - baseVFov()) > 0.01) { camera.fov = baseVFov(); camera.updateProjectionMatrix(); }
  }
  $('rp-play').addEventListener('click', () => {
    if (!replay.playing && replay.t >= replay.ticks) replay.t = 0;
    replay.playing = !replay.playing; replayUi(); A.play('click');
  });
  $('rp-slower').addEventListener('click', () => { replay.rate = Math.max(0, replay.rate - 1); replayUi(); });
  $('rp-faster').addEventListener('click', () => { replay.rate = Math.min(RP_SPEEDS.length - 1, replay.rate + 1); replayUi(); });
  $('rp-back').addEventListener('click', () => replaySeek(replay.t - 1 / TICK));
  $('rp-fwd').addEventListener('click', () => replaySeek(replay.t + 1 / TICK));
  $('rp-scrub').addEventListener('input', () => replaySeek(+$('rp-scrub').value));
  $('rp-exit').addEventListener('click', () => { A.play('click'); replayClose(); });
  for (const b of rpEl.querySelectorAll('[data-cam]')) b.addEventListener('click', () => { replayCamMode(b.dataset.cam); A.play('click'); });
  // drag the view to look around (follow: swing round the runner)
  canvas.addEventListener('pointerdown', (e) => { if (replay.on) { replay.drag = { x: e.clientX, y: e.clientY }; try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* fine */ } } });
  canvas.addEventListener('pointermove', (e) => {
    if (!replay.on || !replay.drag) return;
    const dx = (e.clientX - replay.drag.x) * 0.006, dy = (e.clientY - replay.drag.y) * 0.006;
    replay.drag = { x: e.clientX, y: e.clientY };
    if (replay.cam === 'free') {
      replay.free.yaw -= dx; replay.free.pitch = Math.max(-1.5, Math.min(1.5, replay.free.pitch - dy));
    } else {
      replay.orbit.yaw -= dx;
      replay.orbit.pitch = Math.max(-1.3, Math.min(0.6, replay.orbit.pitch - dy));
    }
  });
  const endDrag = () => { replay.drag = null; };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    if (!replay.on || replay.cam !== 'follow') return;
    replay.orbit.dist = Math.max(90, Math.min(1600, replay.orbit.dist * (e.deltaY > 0 ? 1.12 : 0.89)));
  }, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (!replay.on) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); replayClose(); return; }
    if (replay.cam === 'free' && /^(Key[WASDQEC]|Arrow(Up|Down|Left|Right)|Space|Shift(Left|Right))$/.test(e.code)) { e.preventDefault(); replay.keys.add(e.code); return; }
    if (tag === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return; // the focused button handles it
    if (e.code === 'Space' || e.code === 'KeyK') { e.preventDefault(); $('rp-play').click(); }
    else if (e.code === 'ArrowLeft' || e.code === 'KeyJ') { e.preventDefault(); replaySeek(replay.t - (e.shiftKey ? 5 : 1) / TICK); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyL') { e.preventDefault(); replaySeek(replay.t + (e.shiftKey ? 5 : 1) / TICK); }
    else if (e.code === 'Comma') { replay.playing = false; replaySeek(replay.t - replay.g.e); replayUi(); }
    else if (e.code === 'Period') { replay.playing = false; replaySeek(replay.t + replay.g.e); replayUi(); }
    else if (e.code === 'Minus' || e.code === 'ArrowDown') { e.preventDefault(); $('rp-slower').click(); }
    else if (e.code === 'Equal' || e.code === 'ArrowUp') { e.preventDefault(); $('rp-faster').click(); }
    else if (e.code === 'KeyC') replayCamMode({ follow: 'pov', pov: TOUCH ? 'follow' : 'free', free: 'follow' }[replay.cam]);
    else if (e.code === 'Home') replaySeek(0);
  });
  window.addEventListener('keyup', (e) => replay.keys.delete(e.code));
  window.addEventListener('blur', () => replay.keys.clear());
  // controller: A play or pause, B exit, LB and RB speed, D-pad left and right
  // skip a second, Y camera, right stick looks, left stick flies the free camera
  function replayPad(b, ax, press, dt) {
    if (press(0)) $('rp-play').click();
    if (press(1) || press(9)) replayClose();
    if (press(4)) $('rp-slower').click();
    if (press(5)) $('rp-faster').click();
    if (press(14)) replaySeek(replay.t - 1 / TICK);
    if (press(15)) replaySeek(replay.t + 1 / TICK);
    if (press(3)) replayCamMode({ follow: 'pov', pov: 'free', free: 'follow' }[replay.cam]);
    const lx = ax[2] * 2.4 * dt, ly = ax[3] * 1.6 * dt;
    if (replay.cam === 'free') {
      const f = replay.free;
      f.yaw -= lx; f.pitch = Math.max(-1.5, Math.min(1.5, f.pitch - ly));
      const sp = (b[7] ? 2400 : 700) * dt, fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw), rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
      f.pos[0] += (-fx * ax[1] + rx * ax[0]) * sp; f.pos[2] += (-fz * ax[1] + rz * ax[0]) * sp; f.pos[1] += Math.sin(f.pitch) * -ax[1] * sp;
    } else {
      replay.orbit.yaw -= lx; replay.orbit.pitch = Math.max(-1.3, Math.min(0.6, replay.orbit.pitch - ly));
    }
  }
  // where replays start: your best on the selected level, a board run, the finish screen
  function watchBest(course, from) {
    const g = ghost.saved(course);
    if (g) replayOpen(course, g, 'Your best', best[course], from);
  }
  async function watchOnline(course, id, name) {
    try {
      const r = await api('/ghost?course=' + encodeURIComponent(lbKey(course)) + '&id=' + encodeURIComponent(id));
      replayOpen(course, r.ghost, name, r.ticks, 'online');
    } catch (e) { $('on-boardmsg').textContent = 'Could not load that run.'; }
  }
  $('watch').addEventListener('click', () => { A.play('click'); watchBest(selected, 'levels'); });

  // saved replays: a run you chose to keep from the finish screen. The list
  // lives in localStorage (strafe.replays.v1) and each run in its own key, so
  // a full storage only stops new saves. Your best run on each level is kept
  // anyway (the ghost) and shows in the same list.
  const RP_LIST = 'strafe.replays.v1', RP_DATA = 'strafe.replay.v1.', RP_MAX = 60;
  const rpList = () => load(RP_LIST) || [];
  function saveLastRun() {
    const r = game.lastRun, btn = $('c-save');
    if (!r || r.saved) return;
    const list = rpList();
    if (list.length >= RP_MAX) { toast('You have ' + RP_MAX + ' saved replays. Delete some in Replays first.', 2600); return; }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try {
      localStorage.setItem(RP_DATA + id, JSON.stringify(r.g));
      list.unshift({ id, course: r.course, key: lbKey(r.course), ticks: r.ticks, at: Date.now() });
      localStorage.setItem(RP_LIST, JSON.stringify(list));
    } catch (e) {
      try { localStorage.removeItem(RP_DATA + id); } catch (x) { /* nothing to undo */ }
      toast('No room left to save replays on this device. Delete some in Replays.', 2800);
      return;
    }
    r.saved = true;
    btn.disabled = true; btn.textContent = 'Replay saved';
    A.play('checkpoint');
  }
  const rpDate = (t) => { const d = new Date(t); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
  function rpRow(title, sub, ticks, onWatch, onDelete) {
    const li = document.createElement('li');
    const n = document.createElement('span'); n.className = 'n';
    const b = document.createElement('b'); b.textContent = title;
    const sm = document.createElement('small'); sm.textContent = sub;
    n.append(b, sm);
    const t = document.createElement('span'); t.className = 't'; t.textContent = fmt(ticks);
    const btns = document.createElement('span'); btns.className = 'rowbtns';
    const w = document.createElement('button'); w.className = 'ghost small'; w.textContent = 'Watch'; w.addEventListener('click', onWatch);
    btns.appendChild(w);
    if (onDelete) { const d = document.createElement('button'); d.className = 'ghost small'; d.textContent = 'Delete'; d.addEventListener('click', onDelete); btns.appendChild(d); }
    li.append(n, t, btns);
    return li;
  }
  function replaysRender() {
    const level = $('rpl-level').value;
    if (!$('rpl-level').options.length) {
      $('rpl-level').add(new Option('All levels', ''));
      for (const n of LEVEL_ORDER) $('rpl-level').add(new Option(rowCourse(n).name, n));
    }
    const saved = $('rpl-saved'), bests = $('rpl-bests');
    saved.textContent = ''; bests.textContent = '';
    const list = rpList().filter(r => !level || r.course === level);
    for (const r of list) {
      const old = r.key !== lbKey(r.course) ? ' · older layout' : '';
      saved.appendChild(rpRow(rowCourse(r.course).name, rpDate(r.at) + old, r.ticks, () => {
        const g = load(RP_DATA + r.id);
        if (g) replayOpen(r.course, g, 'Saved run', r.ticks, 'replays'); else toast('That replay could not be read.');
      }, () => {
        try { localStorage.removeItem(RP_DATA + r.id); } catch (e) { /* gone already */ }
        save(RP_LIST, rpList().filter(x => x.id !== r.id));
        A.play('click');
        replaysRender();
      }));
    }
    $('rpl-savedmsg').textContent = list.length ? '' : level ? 'No saved replays on this level yet.' : 'No saved replays yet. Finish a run and press Save replay.';
    let nb = 0;
    for (const c of LEVEL_ORDER) {
      if (level && c !== level) continue;
      if (!best[c] || !ghost.has(c)) continue;
      nb++;
      bests.appendChild(rpRow(rowCourse(c).name, 'Personal best', best[c], () => watchBest(c, 'replays')));
    }
    $('rpl-bestsmsg').textContent = nb ? '' : 'Your best run on each level shows here once you set one.';
  }
  $('rpl-level').addEventListener('change', replaysRender);

  // ------------------------------------------------------------ menu
  const menu = $('menu');
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');

  // live preview camera behind the menu
  const attract = { active: true, course: map.order[0], hover: null, t0: 0, cycle: 0 };
  const flashEl = $('flash');
  const MENU_ROWS = [{ name: 'tutorial', key: 'T' }].concat(map.order.map((name, i) => ({ name, key: String((i + 1) % 10) })),
    map.gauntlet.map((name, i) => ({ name, key: 'G' + (i + 1) })), map.night.map((name, i) => ({ name, key: 'N' + (i + 1) })));
  const ALL_LEVELS = map.order.concat(map.gauntlet, map.night);
  // difficulty pips: five, or more for levels off the scale
  const pipHtml = (d, label) => '<span class="pips" aria-label="' + label + d + ' of ' + Math.max(5, d) + '">' +
    Array.from({ length: Math.max(5, d) }, (_, k) => '<i class="' + (k < d ? 'on' : '') + '"></i>').join('') + '</span>';
  const rowCourse = (name) => map.courses[name];
  let selected = best.tutorial ? map.order[0] : 'tutorial';
  // the hero always describes the selected level
  function showHero(name) {
    const c = rowCourse(name);
    const tutorial = name === 'tutorial';
    $('h-type').innerHTML = '<span class="chip" style="--c:' + hex(c.color) + '">' + c.type + '</span>' +
      (tutorial ? 'Start here' : c.set === 'gauntlet' ? 'Gauntlet ' + (map.gauntlet.indexOf(name) + 1) + ' of 6' : c.set === 'night' ? 'Night City ' + (map.night.indexOf(name) + 1) + ' of 6' : map.order.indexOf(name) >= 6 ? 'Advanced' : 'Level ' + (map.order.indexOf(name) + 1));
    $('h-name').textContent = c.name;
    $('h-desc').textContent = c.desc;
    $('h-diff').innerHTML = c.difficulty ? pipHtml(c.difficulty, '') : (tutorial ? 'Easy' : 'None');
    $('h-stages').textContent = c.stages ? String(c.stages) : '—';
    $('h-best').textContent = best[name] ? fmt(best[name]) : '—';
    updatePlayButtons();
    lbRender();
  }
  function previewCourse(name) {
    if (attract.course === name) return;
    attract.course = name;
    attract.t0 = performance.now() / 1000;
    if (settings.flash) { flashEl.classList.remove('go'); void flashEl.offsetWidth; flashEl.classList.add('go'); }
  }
  // fly through a level; when paused on that level, show the frozen game instead
  function showPreview(name) {
    attract.active = !(game.started && game.course === name);
    previewCourse(name);
  }
  function select(name, focus) {
    selected = name;
    for (const b of document.querySelectorAll('.card')) {
      const on = b.dataset.course === name;
      b.setAttribute('aria-current', String(on));
      if (on) { b.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); if (focus) b.focus({ preventScroll: true }); }
    }
    attract.hover = name;
    showPreview(name);
    showHero(name);
  }
  function updateAttract(dt, t) {
    const c = attract.course ? map.courses[attract.course] : null;
    const sp = c ? (c.preview || c.spawn) : map.hubSpawn;
    const fy = sp.yaw, fx = -Math.sin(fy), fz = -Math.cos(fy);
    let u = t - attract.t0;
    if (screen === 'title' && !game.started && u > 14) {
      previewCourse(ALL_LEVELS[(ALL_LEVELS.indexOf(attract.course) + 1) % ALL_LEVELS.length]);
      u = 0;
    }
    const dolly = Math.min(u, 30) * 55;
    camera.position.set(sp.pos[0] - fx * 700 + fx * dolly, sp.pos[1] + 620, sp.pos[2] - fz * 700 + fz * dolly);
    camera.rotation.set(-0.34, fy + Math.sin(u * 0.13) * 0.28, 0);
    if (camera.fov !== baseVFov()) { camera.fov = baseVFov(); camera.updateProjectionMatrix(); }
  }

  function buildLevelList() {
    const ol = $('levels');
    ol.textContent = '';
    MENU_ROWS.forEach((r, i) => {
      const c = rowCourse(r.name);
      if (i === 7 || i === 11 || i === 17) { const sep = document.createElement('li'); sep.className = 'sep'; sep.setAttribute('aria-hidden', 'true'); ol.appendChild(sep); }
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.className = 'card'; b.dataset.course = r.name;
      b.style.setProperty('--c', hex(c.color));
      const pips = c.difficulty ? pipHtml(c.difficulty, 'Difficulty ') : '<span>' + c.type + '</span>';
      const bt = best[r.name] ? fmt(best[r.name]) : '';
      const adv = c.set === 'gauntlet' ? '<span class="adv">GAUNTLET</span>' : c.set === 'night' ? '<span class="adv">NIGHT</span>' : map.order.indexOf(r.name) >= 6 ? '<span class="adv">ADV</span>' : '';
      b.innerHTML = '<span class="ck"><span>' + r.key + '</span>' + adv + '</span><span class="cn">' + c.name + '</span>' +
        '<span class="cm">' + pips + '<span>' + bt + '</span></span>';
      b.addEventListener('mouseenter', () => { A.play('hover'); showPreview(r.name); });
      b.addEventListener('mouseleave', () => showPreview(selected));
      b.addEventListener('focus', () => { if (selected !== r.name) select(r.name); });
      b.addEventListener('click', () => {
        A.init();
        if (selected === r.name) playSelected(); else { A.play('click'); select(r.name); }
      });
      b.addEventListener('dblclick', () => playSelected());
      li.appendChild(b);
      ol.appendChild(li);
    });
  }

  function updatePlayButtons() {
    const paused = game.started;
    const here = paused && game.course === selected;
    $('play').innerHTML = (here ? 'Resume' : paused ? 'Play ' + rowCourse(selected).name : 'Play') + ' <kbd>Enter</kbd>';
    $('resume').hidden = !paused || here;
    $('restart').hidden = !here || !game.course;
    $('menunote').hidden = paused;
    $('watch').hidden = !ghost.has(selected);
  }

  // two screens: the title (main or pause menu) and level select behind Play
  let screen = 'title';
  const titleButtons = () => [...document.querySelectorAll('#mainnav .mbtn')].filter(b => !b.hidden);
  function refreshTitle() {
    const paused = game.started;
    $('m-resume').hidden = !paused;
    $('m-restart').hidden = !paused || !game.course;
    $('m-quit').hidden = !paused;
    let stars = 0, max = 0;
    STORY.forEach((job, i) => { if (job.stars) { stars += (storyProgress[i] || { stars: 0 }).stars; max += 3; } });
    $('m-story-sub').textContent = stars ? stars + ' / ' + max + ' ★' : 'New';
    const done = ALL_LEVELS.filter(n => best[n]).length;
    $('m-play-sub').textContent = done + ' / ' + ALL_LEVELS.length + ' levels';
    $('m-tut-sub').textContent = best.tutorial ? 'Done' : 'Start here';
    const all = SKINS.concat(TRAILS);
    $('m-cos-sub').textContent = all.filter(unlocked).length + ' / ' + all.length + ' unlocked';
  }
  function showScreen(which, focus = true) {
    screen = which;
    menu.dataset.screen = which;
    menu.classList.toggle('paused', game.started);
    if (which === 'levels') { buildLevelList(); select(selected, focus); return; }
    refreshTitle();
    if (!game.started) { attract.active = true; attract.hover = null; previewCourse(attract.course || map.order[0]); }
    if (focus) { const b = titleButtons()[0]; b && b.focus({ preventScroll: true }); }
  }

  function showMenuState() {
    const paused = game.started;
    $('paused').hidden = !paused;
    if (paused) {
      const c = game.course && map.courses[game.course];
      $('p-course').textContent = c ? c.name : '';
      $('p-time').textContent = c ? fmt(game.running ? game.tick - game.startTick : game.finished || 0) : '';
      $('p-stage').textContent = c ? 'Stage ' + (game.cp + 1) + ' / ' + c.stages : '';
      if (game.course) selected = game.course;
    }
    buildLevelList();
    select(selected);
    showScreen('title');
  }

  function startPlay() {
    A.init();
    game.started = true;
    attract.hover = null;
    attract.active = false;
    closeDrawer();
    requestLock();
  }
  function playSelected() {
    A.init(); A.play('click');
    const here = game.started && game.course === selected;
    if (!here) goCourse(selected);
    startPlay();
  }

  // settings and controls slide in from the right
  const drawer = $('drawer');
  function openDrawer(which) {
    A.play('click');
    drawer.hidden = false;
    $('d-title').textContent = { settings: 'Settings', story: 'Story', cosmetics: 'Cosmetics', controls: 'Controls', online: 'Online', replays: 'Replays' }[which];
    if (which === 'online') onlineOpen();
    if (which === 'replays') replaysRender();
    drawer.classList.toggle('wide', which === 'story' || which === 'cosmetics');
    if (which === 'cosmetics') buildCosmetics(); else preview.stop();
    if (which === 'story') {
      // brief the first job that still has stars to win
      if (briefed === null) { let i = 0; while (i + 1 < STORY.length && jobOpen(i + 1) && storyProgress[i]) i++; briefed = i; }
      brief(briefed);
    }
    for (const p of drawer.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== which;
    for (const o of document.querySelectorAll('[data-open]')) o.setAttribute('aria-expanded', String(o.dataset.open === which));
    $('d-close').focus({ preventScroll: true });
  }
  function closeDrawer() {
    if (drawer.hidden) return;
    drawer.hidden = true;
    preview.stop();
    for (const o of document.querySelectorAll('[data-open]')) o.setAttribute('aria-expanded', 'false');
  }
  for (const t of document.querySelectorAll('[data-open]')) {
    t.addEventListener('click', () => {
      if (!drawer.hidden && t.getAttribute('aria-expanded') === 'true') closeDrawer(); else openDrawer(t.dataset.open);
    });
  }
  $('d-close').addEventListener('click', () => { A.play('click'); closeDrawer(); });

  // story: jobs list, briefing, stars
  const starCount = (job, secs) => !job.stars ? 0 : secs <= job.stars[0] ? 3 : secs <= job.stars[1] ? 2 : 1;
  const starHtml = (n) => '★'.repeat(n) + '<i>' + '★'.repeat(3 - n) + '</i>';
  const clock = (secs) => fmt(Math.round(secs / TICK)).replace(/\.00$/, '');
  function starNote(job, n) {
    return n === 3 ? 'All three stars' : n === 2 ? 'Under ' + clock(job.stars[0]) + ' for three' : 'Under ' + clock(job.stars[1]) + ' for two';
  }
  function finishJob(i, secs) {
    const job = STORY[i], prev = storyProgress[i] || { stars: 0, best: null };
    const got = starCount(job, secs);
    storyProgress[i] = { stars: Math.max(prev.stars, got), best: prev.best === null ? secs : Math.min(prev.best, secs) };
    save(STORY_KEY, storyProgress);
    return got;
  }
  const jobOpen = (i) => i === 0 || !!storyProgress[i - 1];
  let briefed = null;
  function buildStory() {
    const ol = $('st-jobs');
    ol.textContent = '';
    let total = 0, max = 0;
    STORY.forEach((job, i) => {
      if (job.stars) { total += (storyProgress[i] || { stars: 0 }).stars; max += 3; }
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.className = 'job';
      b.disabled = !jobOpen(i);
      const pr = storyProgress[i];
      const stars = !jobOpen(i) ? 'Locked' : job.stars ? starHtml(pr ? pr.stars : 0) : pr ? 'Done' : '';
      b.innerHTML = '<span class="n">' + (i === 0 ? 'P' : i) + '</span><span class="t">' + job.title + '<small>' + map.courses[job.course].name +
        (pr && pr.best !== null && job.stars ? ' · best ' + clock(pr.best) : '') + '</small></span><span class="s">' + stars + '</span>';
      if (briefed === i) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => { A.play('click'); brief(i); });
      li.appendChild(b);
      ol.appendChild(li);
    });
    $('st-total').textContent = 'Stars ' + total + ' / ' + max;
  }
  function brief(i) {
    briefed = i;
    const job = STORY[i];
    $('st-brief').hidden = false;
    $('st-num').textContent = i === 0 ? 'Prologue' : 'Job ' + i + ' of ' + (STORY.length - 1);
    $('st-title').textContent = job.title;
    $('st-level').textContent = map.courses[job.course].name;
    $('st-text').textContent = job.brief;
    $('st-targets').textContent = job.stars ? '★★★ under ' + clock(job.stars[0]) + '   ★★ under ' + clock(job.stars[1]) + '   ★ finish' : 'No time targets. Just finish.';
    buildStory();
    $('st-start').focus({ preventScroll: true });
  }
  function startJob(i) {
    goCourse(STORY[i].course, i);
    startPlay();
  }
  // cosmetics: pick a skin and a trail; locked ones show the stars they need
  function buildCosmetics() {
    const have = storyStars();
    $('cos-total').textContent = 'Stars ' + have + ' / ' + STORY.filter(j => j.stars).length * 3;
    const hexs = (n) => '#' + n.toString(16).padStart(6, '0');
    const RAINBOW = 'linear-gradient(90deg,#ff4d4d,#ffb02e,#f5ff4f,#4fff8a,#4fc3ff,#8a5bff,#ff4dd2)';
    const fill = (el, list, key) => {
      el.textContent = '';
      for (const it of list) {
        const b = document.createElement('button');
        b.className = 'cos';
        const locked = !unlocked(it);
        if (locked) b.setAttribute('aria-disabled', 'true');
        if (preview[key] === it && cosmetics[key] !== it) b.classList.add('previewing');
        b.setAttribute('aria-pressed', String(cosmetics[key] === it));
        const sw = document.createElement('span');
        if (key === 'skin') {
          sw.className = 'sw';
          const acc = it.accent === 'hue' ? RAINBOW : hexs(it.accent);
          sw.innerHTML = '<i style="background:' + hexs(it.sleeve) + '"></i><i class="band" style="background:' + acc + '"></i><i style="background:' + hexs(it.glove) + '"></i>';
        } else {
          sw.className = 'sw trail';
          sw.style.background = it.id === 'none' ? 'rgba(255,255,255,.08)' : it.color === 'hue' ? RAINBOW : 'linear-gradient(90deg,' + hexs(it.tail) + '00,' + hexs(it.tail) + ',' + hexs(it.color) + ')';
        }
        const cn = document.createElement('span');
        cn.className = 'cn';
        cn.innerHTML = it.name + '<small>' + (locked ? '★ ' + it.need : cosmetics[key] === it ? 'Equipped' : it.need ? '★ ' + it.need : 'Default') + '</small>';
        b.append(sw, cn);
        // pointing at an item previews it; clicking equips it, or pins the preview if locked
        b.addEventListener('pointerenter', () => showPreview(key, it));
        b.addEventListener('focus', () => showPreview(key, it));
        b.addEventListener('click', () => {
          A.play('click');
          if (locked) { pinned[key] = it; showPreview(key, it); buildCosmetics(); return; }
          pinned[key] = null;
          settings[key] = it.id; save(SETTINGS_KEY, settings);
          cosmetics.apply(); buildCosmetics(); refreshTitle();
          const again = $(key === 'skin' ? 'cos-skins' : 'cos-trails').children[list.indexOf(it)];
          again && again.focus({ preventScroll: true });
        });
        el.appendChild(b);
      }
    };
    fill($('cos-skins'), SKINS, 'skin');
    fill($('cos-trails'), TRAILS, 'trail');
    showPreview();
  }
  // the preview shows what you point at, else a pinned locked item, else what you wear
  const pinned = { skin: null, trail: null };
  const hovering = { skin: null, trail: null };
  function showPreview(key, it) {
    if (key) { hovering.skin = hovering.trail = null; hovering[key] = it; }
    const sk = hovering.skin || pinned.skin || cosmetics.skin, tr = hovering.trail || pinned.trail || cosmetics.trail;
    preview.show(sk, tr);
    const lock = [sk, tr].filter(x => !unlocked(x));
    $('cos-cap').innerHTML = sk.name + ' skin · ' + (tr.id === 'none' ? 'no trail' : tr.name + ' trail') +
      (lock.length ? '<small>Locked: ' + lock.map(x => x.name + ' needs ★ ' + x.need).join(', ') + '</small>' : '');
  }
  for (const id of ['cos-skins', 'cos-trails']) $(id).addEventListener('pointerleave', () => { hovering.skin = hovering.trail = null; showPreview(); });
  $('st-start').addEventListener('click', () => { A.init(); A.play('click'); if (briefed !== null) startJob(briefed); });

  function bindRange(id, key, fmtv, apply) {
    const el = $(id), out = $(id + '-v');
    el.value = settings[key];
    const sync = () => { out.textContent = fmtv(+el.value); };
    sync();
    el.addEventListener('input', () => { settings[key] = +el.value; sync(); apply && apply(); save(SETTINGS_KEY, settings); });
  }
  function bindCheck(id, key, apply) {
    const el = $(id);
    el.checked = !!settings[key];
    el.addEventListener('change', () => { settings[key] = el.checked; apply && apply(); save(SETTINGS_KEY, settings); A.play('click'); });
  }
  const applyAudio = () => A.setVolumes({ master: settings.master / 100, music: settings.music / 100, sfx: settings.sfx / 100 });
  bindRange('s-master', 'master', v => v + '%', applyAudio);
  bindRange('s-music', 'music', v => v + '%', applyAudio);
  bindRange('s-sfx', 'sfx', v => v + '%', applyAudio);
  bindRange('s-sens', 'sens', v => v.toFixed(2));
  bindRange('s-fov', 'fov', v => v + '°');
  bindRange('s-aa', 'airaccelerate', v => String(v), () => { player.cfg.airaccelerate = settings.airaccelerate; });
  bindRange('s-pad', 'padSens', v => v.toFixed(2));
  bindCheck('s-padstrafe', 'padAutoStrafe');
  bindCheck('s-padinvert', 'padInvert');
  bindCheck('s-autohop', 'autohop', () => { player.cfg.autohop = settings.autohop; });
  bindCheck('s-kick', 'fovKick');
  bindCheck('s-bob', 'bob');
  bindCheck('s-body', 'body');
  bindCheck('s-lines', 'speedLines');
  bindCheck('s-landkick', 'landKick');
  bindCheck('s-fps', 'fps');
  // accessibility
  const applyHud = () => document.documentElement.style.setProperty('--hudz', String(settings.hudSize / 100));
  applyHud();
  $('s-colors').value = settings.colors;
  $('s-colors').addEventListener('change', () => { settings.colors = $('s-colors').value; applyColors(); save(SETTINGS_KEY, settings); A.play('click'); });
  bindRange('s-roll', 'roll', v => v + '%');
  bindRange('s-hud', 'hudSize', v => v + '%', applyHud);
  bindCheck('s-flip', 'flip');
  bindCheck('s-flash', 'flash');
  // one press for the calmest camera; each switch can still be turned back on
  $('s-calm').addEventListener('click', () => {
    Object.assign(settings, { roll: 0, flip: false, flash: false, bob: false, fovKick: false, landKick: false, speedLines: false });
    save(SETTINGS_KEY, settings);
    $('s-roll').value = 0; $('s-roll-v').textContent = '0%';
    for (const [id, k] of [['s-flip', 'flip'], ['s-flash', 'flash'], ['s-bob', 'bob'], ['s-kick', 'fovKick'], ['s-landkick', 'landKick'], ['s-lines', 'speedLines']]) $(id).checked = settings[k];
    A.play('click');
    toast('Motion reduced', 1500);
  });
  bindRange('s-scale', 'scale', v => v + '%', () => { applyScale(); resize(); });
  bindCheck('s-ghost', 'ghost');
  bindCheck('s-keys', 'keys', () => hud.keys.hidden = !settings.keys);
  bindCheck('s-strafe', 'strafeMeter');
  bindCheck('s-shadows', 'shadows', () => {
    renderer.shadowMap.enabled = settings.shadows;
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  });
  if (TOUCH) {
    // touch rows go at the top of Mouse and view; the mouse rows stay for a paired mouse
    const g = $('s-sens').closest('.settings');
    g.insertAdjacentHTML('afterbegin', '<label for="s-look">Touch look speed</label><output id="s-look-v"></output>' +
      '<input type="range" id="s-look" min="0.3" max="3" step="0.05">');
    g.closest('.group').insertAdjacentHTML('beforeend', '<div class="checks" style="margin-top:10px"><label><input type="checkbox" id="s-autostrafe"> Auto strafe (presses A or D in the air as you swipe)</label></div>');
    bindRange('s-look', 'lookSens', v => v.toFixed(2));
    bindCheck('s-autostrafe', 'autoStrafe');
  }
  hud.keys.hidden = !settings.keys;
  applyAudio();

  $('play').addEventListener('click', () => playSelected());
  $('m-resume').addEventListener('click', () => { A.init(); A.play('click'); startPlay(); });
  $('m-restart').addEventListener('click', () => { A.init(); A.play('click'); restartCourse(); startPlay(); });
  $('m-play').addEventListener('click', () => { A.init(); A.play('click'); closeDrawer(); showScreen('levels'); });
  $('m-tutorial').addEventListener('click', () => { selected = 'tutorial'; playSelected(); });
  $('m-quit').addEventListener('click', () => {
    A.play('click'); ghost.stop(); goIdle(); game.started = false; game.mission = null;
    attract.course = null; showMenuState();
  });
  $('back').addEventListener('click', () => { A.play('click'); showScreen('title'); });
  for (const b of document.querySelectorAll('#mainnav .mbtn')) b.addEventListener('mouseenter', () => A.play('hover'));
  $('resume').addEventListener('click', () => { A.init(); A.play('click'); startPlay(); });
  $('restart').addEventListener('click', () => { A.init(); restartCourse(); startPlay(); });
  canvas.addEventListener('click', () => { if (!locked && game.started) startPlay(); });
  document.addEventListener('pointerlockchange', () => { if (!locked) menuOnUnlock(); });
  // the editor and its test runs pause into the editor's own panel
  function menuOnUnlock() {
    if (replay.on) return;
    if (ed.on || ed.testing) { if (completeEl.hidden) edShowPanel(); }
    else showMenuState();
  }
  // the first click anywhere wakes the audio so the menu has music
  window.addEventListener('pointerdown', () => A.init(), { once: true });
  // menu keys: arrows browse levels, Enter plays, Esc closes the drawer
  window.addEventListener('keydown', (e) => {
    if (locked || !completeEl.hidden || document.body.classList.contains('playing') || document.body.classList.contains('edmode') || replay.on) return;
    if (e.code === 'Escape') { if (!drawer.hidden) closeDrawer(); else if (screen === 'levels') { A.play('click'); showScreen('title'); } return; }
    if (!drawer.hidden) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT') return;
    if (screen === 'title') {
      const bs = titleButtons(), k = bs.indexOf(document.activeElement);
      const go = (d) => { e.preventDefault(); A.play('hover'); bs[k < 0 ? (d > 0 ? 0 : bs.length - 1) : (k + d + bs.length) % bs.length].focus(); };
      if (e.code === 'ArrowDown' || e.code === 'KeyS') go(1);
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') go(-1);
      else if (e.code === 'Enter' && k < 0) { e.preventDefault(); bs[0].click(); }
      else if (e.code === 'KeyT') { selected = 'tutorial'; showScreen('levels'); }
      else if (/^Digit[0-9]$/.test(e.code) && map.order[(+e.code.slice(5) + 9) % 10]) { selected = map.order[(+e.code.slice(5) + 9) % 10]; showScreen('levels'); }
      return;
    }
    const i = MENU_ROWS.findIndex(r => r.name === selected);
    if (e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'KeyD') { e.preventDefault(); A.play('hover'); select(MENU_ROWS[(i + 1) % MENU_ROWS.length].name, true); }
    else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp' || e.code === 'KeyA') { e.preventDefault(); A.play('hover'); select(MENU_ROWS[(i - 1 + MENU_ROWS.length) % MENU_ROWS.length].name, true); }
    else if (e.code === 'Enter' && (tag !== 'BUTTON' || document.activeElement.classList.contains('card'))) { e.preventDefault(); playSelected(); }
    else if (e.code === 'KeyT') select('tutorial', true);
    else if (/^Digit[0-9]$/.test(e.code) && map.order[(+e.code.slice(5) + 9) % 10]) select(map.order[(+e.code.slice(5) + 9) % 10], true);
  });

  // ------------------------------------------------------------ level editor
  // Build your own level out of blocks, floors, surf ramps, walls and
  // start, checkpoint and finish pads, fly around it, test it, save it and
  // share it as a code. Custom levels live far off the main map (EDO) and
  // never post to the online board. Keyboard and mouse only.
  const EDO = [600000, 0, 0];
  const ED_TYPES = ['block', 'floor', 'ramp', 'wall', 'start', 'checkpoint', 'finish'];
  const ED_NAMES = { block: 'Block', floor: 'Floor', ramp: 'Surf ramp', wall: 'Wall', start: 'Start', checkpoint: 'Checkpoint', finish: 'Finish' };
  const ED_DEF = {
    block: { w: 160, l: 160, h: 64 }, floor: { w: 512, l: 512, h: 64 }, ramp: { w: 448, l: 2400, a: 60, d: 400 },
    wall: { w: 32, l: 800, h: 384 }, start: { w: 384, l: 384, h: 48 }, checkpoint: { w: 384, l: 384, h: 48 }, finish: { w: 384, l: 384, h: 48 },
  };
  const ED_COLOR = { block: 0x4f74ee, floor: 0xb9c0c6, ramp: 0x2bd1a8, wall: 0xe4e2db, start: 0x43e07f, checkpoint: 0xffb340, finish: 0xe5533d };
  const ED_LEVEL_KEY = 'strafe.editor.v1', ED_SAVES_KEY = 'strafe.levels.v1';
  const edBlank = () => ({ name: 'My level', pieces: [
    { t: 'start', x: 0, y: 0, z: 0, r: 0, w: 384, l: 384, h: 48 },
    { t: 'floor', x: 0, y: 0, z: -640, r: 0, w: 384, l: 640, h: 64 },
    { t: 'finish', x: 0, y: 0, z: -1280, r: 0, w: 384, l: 384, h: 48 },
  ] });
  Object.assign(ed, { level: load(ED_LEVEL_KEY) || edBlank(), type: 'block', params: JSON.parse(JSON.stringify(ED_DEF)), rot: 0, plane: 0,
    cam: [0, 400, 900], undo: [], aim: null, preview: null, previewKey: '', meshes: [], grid: null, course: null });

  // piece -> faces (vertex loops) in world space
  function edFaces(pc) {
    const c = Math.cos(pc.r * DEG), s = Math.sin(pc.r * DEG);
    const P = (lx, y, lz) => [EDO[0] + pc.x + lx * c + lz * s, EDO[1] + y, EDO[2] + pc.z - lx * s + lz * c];
    if (pc.t === 'ramp') {
      const hw = pc.w / 2, H = hw * Math.tan(pc.a * DEG), hl = pc.l / 2, top = pc.y, d = pc.d || 0;
      const nL = P(-hw, top - H, hl), nR = P(hw, top - H, hl), nA = P(0, top, hl);
      const fL = P(-hw, top - H - d, -hl), fR = P(hw, top - H - d, -hl), fA = P(0, top - d, -hl);
      return [[nL, nR, nA], [fL, fA, fR], [nL, fL, fR, nR], [nL, nA, fA, fL], [nR, fR, fA, nA]];
    }
    const hw = pc.w / 2, hl = pc.l / 2;
    const y1 = pc.t === 'wall' ? pc.y + pc.h : pc.y, y0 = y1 - pc.h;
    const q = [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]];
    const lo = q.map(([x, z]) => P(x, y0, z)), hi = q.map(([x, z]) => P(x, y1, z));
    return [lo, hi.slice().reverse(), [lo[0], lo[1], hi[1], hi[0]], [lo[1], lo[2], hi[2], hi[1]], [lo[2], lo[3], hi[3], hi[2]], [lo[3], lo[0], hi[0], hi[3]]];
  }
  const edKind = (t) => t === 'ramp' ? 'ramp' : t === 'block' ? 'block' : t === 'wall' ? 'wall' : 'pad';
  function edClear() {
    for (let i = world.brushes.length - 1; i >= 0; i--) if (world.brushes[i].props.custom) world.brushes.splice(i, 1);
    for (let i = world.triggers.length - 1; i >= 0; i--) if (world.triggers[i].custom) world.triggers.splice(i, 1);
    for (const m of ed.meshes) { scene.remove(m); m.geometry.dispose(); }
    ed.meshes = [];
  }
  // put the level into the world: brushes, triggers, a course and its meshes
  function edBuild() {
    edClear();
    const L = ed.level, id = 'custom';
    let lowY = Infinity, box = [Infinity, Infinity, -Infinity, -Infinity], cps = 0, start = null;
    L.pieces.forEach((pc, i) => {
      const b = world.addHull(edFaces(pc), { custom: true, piece: i, kind: edKind(pc.t), color: ED_COLOR[pc.t] });
      lowY = Math.min(lowY, b.min[1]);
      box = [Math.min(box[0], b.min[0]), Math.min(box[1], b.min[2]), Math.max(box[2], b.max[0]), Math.max(box[3], b.max[2])];
      if (pc.t === 'start' || pc.t === 'checkpoint' || pc.t === 'finish') {
        const spawn = { pos: [EDO[0] + pc.x, EDO[1] + pc.y + 1, EDO[2] + pc.z], yaw: pc.r * DEG };
        const tmin = [b.min[0], b.max[1], b.min[2]], tmax = [b.max[0], b.max[1] + 160, b.max[2]];
        if (pc.t === 'start') { if (!start) { start = spawn; world.addTrigger(tmin, tmax, { type: 'start', course: id, custom: true }); } }
        else if (pc.t === 'checkpoint') world.addTrigger(tmin, tmax, { type: 'checkpoint', course: id, idx: ++cps, spawn, custom: true });
        else world.addTrigger(tmin, tmax, { type: 'end', course: id, custom: true });
      }
    });
    if (L.pieces.length) world.addTrigger([box[0] - 20000, lowY - 4000, box[1] - 20000], [box[2] + 20000, lowY - 1500, box[3] + 20000], { type: 'kill', custom: true });
    // a changed level is a new level: its best time and ghost no longer apply
    const sig = JSON.stringify(L.pieces);
    if (sig !== load('strafe.editor.sig')) { delete best[id]; save(BEST_KEY, best); delete bestSplits[id]; save(SPLITS_KEY, bestSplits); ghost.forget(id); save('strafe.editor.sig', sig); }
    map.courses[id] = { name: L.name || 'Custom level', spawn: start || { pos: [EDO[0], EDO[1] + 200, EDO[2]], yaw: 0 }, stages: cps + 1, color: 0xe5533d, custom: true, hasStart: !!start,
      hasEnd: L.pieces.some(p => p.t === 'finish') };
    const parts = buildGeometry(b => b.props.custom, bucketFor);
    for (const [name, part] of Object.entries(parts)) {
      const mesh = new THREE.Mesh(part.g, MATS[name]);
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh); ed.meshes.push(mesh);
      const lines = new THREE.LineSegments(part.lg, new THREE.LineBasicMaterial({ color: 0x1b2530, transparent: true, opacity: 0.18 }));
      scene.add(lines); ed.meshes.push(lines);
    }
    save(ED_LEVEL_KEY, L);
  }
  function edChange(fn) {
    ed.undo.push(JSON.stringify(ed.level));
    if (ed.undo.length > 100) ed.undo.shift();
    fn();
    edBuild();
  }

  // ---- the editor's own HUD, panel and preview
  const edCss = document.createElement('style');
  edCss.textContent = `
body.editing .hud, body.editing #touch { display: none !important; }
#edhud { position: fixed; left: 16px; top: 16px; z-index: 30; display: none; pointer-events: none; font-family: var(--display); color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.7); }
body.editing.playing #edhud { display: block; }
#edhud ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; }
#edhud li { font-weight: 700; font-size: 15px; letter-spacing: .08em; text-transform: uppercase; padding: 3px 10px; background: rgba(10,14,18,.45); }
#edhud li.on { background: #fff; color: #15191d; text-shadow: none; }
#edhud li b { display: inline-block; width: 1.4em; opacity: .7; }
#edinfo { margin-top: 10px; font-size: 14px; letter-spacing: .06em; background: rgba(10,14,18,.45); padding: 6px 10px; max-width: 280px; }
#edhelp { position: fixed; left: 0; right: 0; bottom: 14px; text-align: center; z-index: 30; display: none; pointer-events: none; font: 600 13px/1.5 var(--display); letter-spacing: .08em; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.8); }
body.editing.playing #edhelp { display: block; }
#edpanel { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 16px; background: rgba(21,25,29,.45); }
#edpanel[hidden] { display: none; }
#edpanel .csheet { width: min(640px, 100%); max-height: calc(100vh - 32px); overflow: auto; }
#edpanel h2 { margin: 4px 0 12px; font-family: var(--display); font-weight: 800; font-style: italic; font-size: 40px; line-height: 1; }
#edpanel input[type=text], #edpanel textarea { width: 100%; box-sizing: border-box; font: 500 15px/1.4 var(--body, sans-serif); padding: 8px 10px; border: 2px solid #15191d; background: #fff; color: #15191d; }
#edpanel textarea { height: 76px; font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all; }
#edpanel .row { margin-top: 14px; }
#edpanel .lbl { display: block; font-family: var(--display); font-weight: 600; font-size: 12px; letter-spacing: .2em; text-transform: uppercase; color: #5d666e; margin-bottom: 6px; }
#edpanel .ebtn { all: unset; cursor: pointer; font-family: var(--display); font-weight: 700; font-size: 15px; letter-spacing: .12em; text-transform: uppercase; padding: 8px 14px; border: 2px solid #15191d; color: #15191d; }
#edpanel .ebtn:hover, #edpanel .ebtn:focus-visible { background: #15191d; color: #fff; }
#edpanel .ebtn.red { border-color: #c22420; color: #c22420; }
#edpanel .saves { display: grid; gap: 6px; }
#edpanel .saves div { display: flex; gap: 8px; align-items: center; }
#edpanel .saves span { flex: 1; font-weight: 600; }
#edpanel .note { font-size: 14px; color: #5d666e; margin: 8px 0 0; }
`;
  document.head.appendChild(edCss);
  const edHud = document.createElement('div');
  edHud.id = 'edhud';
  edHud.innerHTML = '<ol>' + ED_TYPES.map((t, i) => '<li data-t="' + t + '"><b>' + (i + 1) + '</b>' + ED_NAMES[t] + '</li>').join('') + '</ol><div id="edinfo"></div>';
  document.body.appendChild(edHud);
  const edHelp = document.createElement('div');
  edHelp.id = 'edhelp';
  edHelp.innerHTML = 'WASD fly · Space up · C down · Shift fast · Click place · Right click delete · Middle click copy · Q/E rotate · Wheel length · Shift+wheel width<br>R/F height or angle · [ ] ramp drop · T/G build height · Z undo · Enter test · Esc menu';
  document.body.appendChild(edHelp);
  const edPanel = document.createElement('div');
  edPanel.id = 'edpanel'; edPanel.hidden = true;
  edPanel.innerHTML = `<div class="csheet" role="dialog" aria-labelledby="ed-title">
  <p class="clabel">Level editor</p><h2 id="ed-title">Editor</h2>
  <div class="cbtns" id="ed-main"></div>
  <div class="row"><label class="lbl" for="ed-name">Level name</label><input type="text" id="ed-name" maxlength="40"></div>
  <div class="row"><span class="lbl">Share</span><textarea id="ed-code" readonly aria-label="Share code"></textarea>
    <div class="cbtns" style="margin-top:8px"><button class="ebtn" id="ed-copy">Copy share code</button><button class="ebtn" id="ed-paste">Load a code</button></div>
    <p class="note" id="ed-msg">Anyone with the code can load and play your level.</p></div>
  <div class="row"><span class="lbl">My levels</span><div class="saves" id="ed-saves"></div></div>
</div>`;
  document.body.appendChild(edPanel);
  const gridHelper = new THREE.GridHelper(40000, 160, 0x6a7f90, 0x9fb3c2);
  gridHelper.material.transparent = true; gridHelper.material.opacity = 0.35; gridHelper.visible = false;
  scene.add(gridHelper);
  const previewMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
  const previewDel = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.35, depthWrite: false });
  function facesToGeo(faces) {
    const pos = [];
    for (const f of faces) for (let i = 1; i < f.length - 1; i++) for (const p of [f[0], f[i], f[i + 1]]) pos.push(p[0], p[1], p[2]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }

  // ---- entering, leaving, testing
  function enterEditor() {
    A.init(); A.play('click');
    closeDrawer(); closeComplete();
    ed.on = true; ed.testing = false;
    game.course = null; game.running = false; game.started = true;
    attract.active = false;
    document.body.classList.add('editing', 'edmode');
    edBuild();
    edPanel.hidden = true;
    gridHelper.visible = true;
    requestLock();
  }
  function exitEditor() {
    ed.on = false; ed.testing = false;
    edPanel.hidden = true;
    document.body.classList.remove('editing', 'edmode');
    gridHelper.visible = false;
    if (ed.preview) ed.preview.visible = false;
    edClear();
    delete map.courses.custom;
    goIdle(); game.started = false;
    showMenuState();
  }
  function edTest() {
    const c = map.courses.custom;
    if (!c || !c.hasStart) { edMsg('Place a Start pad first (key 5).'); toast('Place a Start pad first'); return false; }
    ed.on = false; ed.testing = true;
    edPanel.hidden = true;
    gridHelper.visible = false;
    if (ed.preview) ed.preview.visible = false;
    document.body.classList.remove('editing');
    goCourse('custom');
    if (!c.hasEnd) toast('No Finish pad yet: the clock never stops', 2600);
    startPlay();
    return true;
  }
  function edBack() {
    closeComplete();
    ed.on = true; ed.testing = false;
    game.course = null; game.running = false;
    document.body.classList.add('editing');
    gridHelper.visible = true;
    edPanel.hidden = true;
    requestLock();
  }
  const edMsg = (t) => { $('ed-msg').textContent = t; };
  function edShowPanel() {
    edPanel.hidden = false;
    $('ed-title').textContent = ed.testing ? 'Testing' : 'Editor';
    $('ed-name').value = ed.level.name || '';
    const main = $('ed-main');
    main.innerHTML = '';
    const btn = (label, fn, cls) => { const b = document.createElement('button'); b.className = cls || 'ebtn'; b.textContent = label; b.addEventListener('click', () => { A.play('click'); fn(); }); main.appendChild(b); return b; };
    if (ed.testing) {
      btn('Resume test', () => { edPanel.hidden = true; startPlay(); }, 'cprimary').focus();
      btn('Restart', () => { edPanel.hidden = true; restartCourse(); startPlay(); });
      btn('Back to editor', edBack);
    } else {
      btn('Keep building', () => { edPanel.hidden = true; requestLock(); }, 'cprimary').focus();
      btn('Test play', edTest);
      btn('Save', () => { const all = load(ED_SAVES_KEY) || {}; all[ed.level.name || 'My level'] = ed.level; save(ED_SAVES_KEY, all); edMsg('Saved as "' + (ed.level.name || 'My level') + '".'); edSaves(); });
      btn('New level', () => { if (confirm('Start a new level? Unsaved changes are lost.')) { edChange(() => { ed.level = edBlank(); }); edShowPanel(); } });
    }
    btn('Exit editor', exitEditor, 'ebtn red');
    edCode().then(c => { $('ed-code').value = c; });
    edSaves();
  }
  function edSaves() {
    const all = load(ED_SAVES_KEY) || {}, el = $('ed-saves');
    el.innerHTML = '';
    const names = Object.keys(all);
    if (!names.length) { el.innerHTML = '<p class="note">Nothing saved yet.</p>'; return; }
    for (const n of names) {
      const row = document.createElement('div');
      row.innerHTML = '<span></span><button class="ebtn">Load</button><button class="ebtn">Play</button><button class="ebtn red">Delete</button>';
      row.querySelector('span').textContent = n + ' (' + all[n].pieces.length + ' pieces)';
      const [lb2, pb, db] = row.querySelectorAll('button');
      lb2.addEventListener('click', () => { edChange(() => { ed.level = JSON.parse(JSON.stringify(all[n])); }); edShowPanel(); edMsg('Loaded "' + n + '".'); });
      pb.addEventListener('click', () => { edChange(() => { ed.level = JSON.parse(JSON.stringify(all[n])); }); edTest(); });
      db.addEventListener('click', () => { if (!confirm('Delete "' + n + '"?')) return; delete all[n]; save(ED_SAVES_KEY, all); edSaves(); });
      el.appendChild(row);
    }
  }
  $('ed-name').addEventListener('input', (e) => { ed.level.name = e.target.value.slice(0, 40); if (map.courses.custom) map.courses.custom.name = ed.level.name; save(ED_LEVEL_KEY, ed.level); edCode().then(c => { $('ed-code').value = c; }); });
  $('ed-copy').addEventListener('click', async () => {
    const c = await edCode();
    $('ed-code').value = c; $('ed-code').select();
    try { await navigator.clipboard.writeText(c); edMsg('Copied. Send it to a friend; they paste it with Load a code.'); }
    catch (e) { try { document.execCommand('copy'); edMsg('Copied.'); } catch (e2) { edMsg('Select the code above and copy it.'); } }
  });
  $('ed-paste').addEventListener('click', async () => {
    const txt = prompt('Paste a Strafe level code');
    if (!txt) return;
    try { const L = await edDecode(txt.trim()); edChange(() => { ed.level = L; }); edShowPanel(); edMsg('Loaded "' + L.name + '" with ' + L.pieces.length + ' pieces.'); }
    catch (e) { edMsg('That code did not load. Check it was copied whole.'); }
  });

  // ---- share codes: compact JSON, deflated where the browser can, base64url
  const ED_KEYS = ['t', 'x', 'y', 'z', 'r', 'w', 'l', 'h', 'a', 'd'];
  const b64 = (u8) => { let s = ''; for (const c of u8) s += String.fromCharCode(c); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64 = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
  async function pipe(u8, stream) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer()); }
  async function edCode() {
    const L = ed.level;
    const data = [1, L.name || '', L.pieces.map(p => ED_KEYS.map(k => k === 't' ? ED_TYPES.indexOf(p.t) : Math.round(p[k] || 0)))];
    const raw = new TextEncoder().encode(JSON.stringify(data));
    if (window.CompressionStream) { try { return 'S1' + b64(await pipe(raw, new CompressionStream('deflate-raw'))); } catch (e) { /* fall back */ } }
    return 'S0' + b64(raw);
  }
  async function edDecode(code) {
    let raw = unb64(code.slice(2));
    if (code.startsWith('S1')) raw = await pipe(raw, new DecompressionStream('deflate-raw'));
    else if (!code.startsWith('S0')) throw new Error('not a level code');
    const [v, name, rows] = JSON.parse(new TextDecoder().decode(raw));
    if (v !== 1 || !Array.isArray(rows) || rows.length > 2000) throw new Error('bad code');
    const num = (x, lo, hi) => Math.max(lo, Math.min(hi, +x || 0));
    const pieces = rows.map(r => {
      const t = ED_TYPES[r[0]];
      if (!t) throw new Error('bad piece');
      const p = { t };
      ED_KEYS.slice(1).forEach((k, i) => { p[k] = num(r[i + 1], -200000, 200000); });
      p.w = num(p.w, 16, 8000); p.l = num(p.l, 16, 20000); p.h = num(p.h, 0, 8000); p.a = num(p.a || 60, 30, 80); p.d = num(p.d, -6000, 6000);
      return p;
    });
    return { name: String(name || 'Shared level').slice(0, 40), pieces };
  }

  // ---- aiming, placing, flying
  const POINT = { min: [0, 0, 0], max: [0, 0, 0] };
  const snap = (v, g) => Math.round(v / g) * g;
  function edAim() {
    const f = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    const o = camera.position;
    const far = 30000, end = [o.x + f.x * far, o.y + f.y * far, o.z + f.z * far];
    const tr = world.trace([o.x, o.y, o.z], end, POINT);
    let hit = null;
    if (tr.fraction < 1 && tr.brush && tr.brush.props.custom) hit = { p: tr.endpos, n: tr.normal, piece: tr.brush.props.piece };
    // the build plane
    const py = EDO[1] + ed.plane;
    let plane = null;
    if (Math.abs(f.y) > 1e-4) { const t = (py - o.y) / f.y; if (t > 0 && t < far) plane = [o.x + f.x * t, py, o.z + f.z * t]; }
    if (hit && plane) { const dh = Math.hypot(hit.p[0] - o.x, hit.p[1] - o.y, hit.p[2] - o.z), dp = Math.hypot(plane[0] - o.x, plane[1] - o.y, plane[2] - o.z); if (dp < dh) hit = null; }
    let at = hit ? hit.p : plane;
    if (!at) return { hit: null, at: null };
    // stack on top of what you aim at
    let y = at[1];
    if (hit && hit.n && hit.n[1] < 0.7) y = at[1];
    return { hit, at: [snap(at[0] - EDO[0], 16), snap(y - EDO[1], 8), snap(at[2] - EDO[2], 16)] };
  }
  // at[1] is where the piece stands: its base. Pieces store their top (a ramp its ridge, a wall its foot).
  function edNewPiece(at) {
    const pr = ed.params[ed.type];
    if (pr.a) return { t: ed.type, x: at[0], y: Math.round(at[1] + pr.w / 2 * Math.tan(pr.a * DEG)), z: at[2], r: ed.rot, w: pr.w, l: pr.l, a: pr.a, d: pr.d, h: 0 };
    return { t: ed.type, x: at[0], y: ed.type === 'wall' ? at[1] : at[1] + pr.h, z: at[2], r: ed.rot, w: pr.w, l: pr.l, h: pr.h };
  }
  function edUpdate(dt) {
    // fly
    const sp = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4000 : 1300) * dt;
    const fw = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), sd = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const up = (keys.has('Space') ? 1 : 0) - (keys.has('KeyC') || keys.has('ControlLeft') ? 1 : 0);
    const fx = -Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = -Math.cos(yaw) * Math.cos(pitch);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    ed.cam[0] += (fx * fw + rx * sd) * sp; ed.cam[1] += (fy * fw + up) * sp; ed.cam[2] += (fz * fw + rz * sd) * sp;
    camera.position.set(EDO[0] + ed.cam[0], EDO[1] + ed.cam[1], EDO[2] + ed.cam[2]);
    camera.rotation.set(pitch, yaw, 0);
    gridHelper.position.set(EDO[0] + snap(ed.cam[0], 250), EDO[1] + ed.plane, EDO[2] + snap(ed.cam[2], 250));
    camera.updateMatrixWorld();
    ed.aim = edAim();
    // preview what a click would place
    const pc = ed.aim.at ? edNewPiece(ed.aim.at) : null;
    const key = pc ? JSON.stringify(pc) : '';
    if (key !== ed.previewKey) {
      ed.previewKey = key;
      if (ed.preview) { scene.remove(ed.preview); ed.preview.geometry.dispose(); ed.preview = null; }
      if (pc) { ed.preview = new THREE.Mesh(facesToGeo(edFaces(pc)), previewMat); scene.add(ed.preview); }
    }
    if (ed.preview) ed.preview.visible = locked;
    for (const li of edHud.querySelectorAll('li')) li.classList.toggle('on', li.dataset.t === ed.type);
    const pr = ed.params[ed.type];
    $('edinfo').textContent = ED_NAMES[ed.type] + ': ' + (pr.a ? pr.w + ' wide, ' + pr.l + ' long, ' + pr.a + '° faces, drops ' + pr.d : pr.w + ' × ' + pr.l + ', ' + pr.h + ' tall') +
      ' · turned ' + ed.rot + '° · build height ' + ed.plane + ' · ' + ed.level.pieces.length + ' pieces';
  }
  function edKey(e) {
    const pr = ed.params[ed.type];
    const i = /^Digit[1-7]$/.test(e.code) ? +e.code.slice(5) - 1 : -1;
    if (i >= 0) { ed.type = ED_TYPES[i]; return; }
    if (e.code === 'KeyQ') ed.rot = (ed.rot + 15) % 360;
    else if (e.code === 'KeyE') ed.rot = (ed.rot + 345) % 360;
    else if (e.code === 'KeyR') { if (pr.a) pr.a = Math.min(80, pr.a + 5); else pr.h = Math.min(4096, pr.h + 16); }
    else if (e.code === 'KeyF') { if (pr.a) pr.a = Math.max(35, pr.a - 5); else pr.h = Math.max(16, pr.h - 16); }
    else if (e.code === 'BracketRight' && pr.a) pr.d = Math.min(4000, pr.d + 100);
    else if (e.code === 'BracketLeft' && pr.a) pr.d = Math.max(-1000, pr.d - 100);
    else if (e.code === 'KeyT') ed.plane += 64;
    else if (e.code === 'KeyG') ed.plane -= 64;
    else if (e.code === 'KeyZ') { const u = ed.undo.pop(); if (u) { ed.level = JSON.parse(u); edBuild(); toast('Undone'); } }
    else if (e.code === 'KeyX') edDelete();
    else if (e.code === 'Enter') edTest();
  }
  function edDelete() {
    const h = ed.aim && ed.aim.hit;
    if (!h) return;
    edChange(() => { ed.level.pieces.splice(h.piece, 1); });
    A.play('click');
  }
  window.addEventListener('keydown', (e) => {
    if (!ed.on || !locked) return;
    if (e.code === 'Tab') { e.preventDefault(); if (document.pointerLockElement) document.exitPointerLock(); return; }
    if (!e.repeat || /^(KeyR|KeyF|BracketLeft|BracketRight|KeyT|KeyG)$/.test(e.code)) edKey(e);
  });
  window.addEventListener('mousedown', (e) => {
    if (!ed.on || !locked) return;
    e.preventDefault();
    const a = ed.aim;
    if (e.button === 0 && a && a.at) { const pc = edNewPiece(a.at); edChange(() => { ed.level.pieces.push(pc); }); A.play('land'); }
    else if (e.button === 2) edDelete();
    else if (e.button === 1 && a && a.hit) { const p = ed.level.pieces[a.hit.piece]; ed.type = p.t; ed.rot = p.r; Object.assign(ed.params[p.t], p.a ? { w: p.w, l: p.l, a: p.a, d: p.d } : { w: p.w, l: p.l, h: p.h }); toast('Copied ' + ED_NAMES[p.t]); }
  });
  window.addEventListener('contextmenu', (e) => { if (ed.on) e.preventDefault(); });
  // Esc on the panel goes straight back to building (or to the test run)
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || edPanel.hidden || document.activeElement === $('ed-name')) return;
    edPanel.hidden = true;
    if (ed.on) requestLock(); else if (ed.testing) startPlay();
  });
  window.addEventListener('wheel', (e) => {
    if (!ed.on || !locked) return;
    const pr = ed.params[ed.type], d = e.deltaY < 0 ? 1 : -1;
    if (e.shiftKey) pr.w = Math.max(16, Math.min(4096, pr.w + d * (pr.a ? 32 : 16)));
    else pr.l = Math.max(16, Math.min(12000, pr.l + d * (pr.a ? 200 : 32)));
  }, { passive: true });
  $('m-editor').addEventListener('click', enterEditor);

  // ------------------------------------------------------------ boot
  goIdle();
  previewCourse(map.order[0]);
  showMenuState();
  if (location.hash === '#demo') game.demo = true; // headless screenshot mode
  window.__strafe = { courses: map.courses, mats: MATS, lights: { hemi, sun }, setNight, player, game, keys, eff, faceInsets, practice: { set: setPractice, save: practiceSave, load: practiceLoad }, goCourse, place, attract, previewCourse, body, ghost, cosmetics, preview, step, modelChunks, renderer, setView: (y, p) => { yaw = y; pitch = p; }, editor: { ed, enter: enterEditor, test: edTest, back: edBack, code: edCode, decode: edDecode },
    online: { net, race, submit: netSubmit, raceFinish, showComplete, openDrawer },
    replay: { state: replay, open: replayOpen, close: replayClose, watchBest }, settings, applyColors, saved: { save: saveLastRun, render: replaysRender } };
  requestAnimationFrame((t) => { last = t; frame(t); });
})();
