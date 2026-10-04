// Strafe: rendering, input, HUD and the fixed-timestep loop.
(function () {
  'use strict';
  const P = window.StrafePhysics;
  const A = window.StrafeAudio;
  const DEG = Math.PI / 180;

  // ------------------------------------------------------------ settings
  const SETTINGS_KEY = 'strafe.settings.v1';
  const BEST_KEY = 'strafe.best.v1';
  const settings = Object.assign({
    sens: 2.0, fov: 90, airaccelerate: 150, autohop: true,
    fovKick: true, shadows: true, bob: true, keys: true, body: true, ghost: true,
    master: 80, music: 50, sfx: 80,
  }, load(SETTINGS_KEY) || {});
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
    { course: 'stairway', title: 'Stairwell', stars: [54, 78],
      brief: 'Mercer: "Juno\'s safe house is compromised. Her backup copy is at the top of the old stair blocks. Climb, turn, and don\'t miss a step."',
      debrief: 'The backup is still there. So is a note, in neat handwriting: "We know who you are, runner." Mercer: "Then we finish this fast."' },
    { course: 'freerun', title: 'Heat', stars: [56, 80],
      brief: 'Mercer: "They are on you, Kite. Blues on the roofs behind you. Lose them across the old district. Every wall, every gap. Don\'t look back."',
      debrief: 'You lose the last of them in the ventilation stacks. Juno on comms: "The newsroom will run the story if we get the originals to the Spire by morning."' },
    { course: 'cascade', title: 'Floodgates', stars: [26, 38],
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
  // These five were rebuilt as long routes, so times from the old short
  // versions no longer compare. Drop them once; stars already earned stay.
  const REBUILT = ['surf', 'bhop', 'canyon', 'stairway', 'crossover'];
  if (!load('strafe.rebuild.v2')) {
    for (const c of REBUILT) {
      delete best[c]; delete bestSplits[c];
      try { localStorage.removeItem('strafe.ghost.v1.' + c); } catch (e) { /* storage blocked */ }
    }
    save(BEST_KEY, best); save(SPLITS_KEY, bestSplits); save('strafe.rebuild.v2', 1);
  }

  // ------------------------------------------------------------ world
  const map = window.StrafeMap.buildMap(P);
  const world = map.world;
  const player = new P.Player(world, { airaccelerate: settings.airaccelerate, autohop: settings.autohop });
  const TICK = 1 / player.cfg.tickrate;

  // ------------------------------------------------------------ three
  const canvas = document.getElementById('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = settings.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const HORIZON = new THREE.Color(0xcfe3ef);
  scene.fog = new THREE.Fog(HORIZON, 4000, 26000);

  const camera = new THREE.PerspectiveCamera(74, 1, 2, 80000);
  camera.rotation.order = 'YXZ';

  // sky dome
  const sunDir = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(60000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sun: { value: sunDir }, zenith: { value: new THREE.Color(0x3d8fd6) }, horizon: { value: HORIZON }, ground: { value: new THREE.Color(0xb9c9d3) } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform vec3 sun; uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground; varying vec3 vDir;',
        'void main(){ float h = vDir.y;',
        ' vec3 c = h > 0.0 ? mix(horizon, zenith, pow(h, 0.55)) : mix(horizon, ground, pow(-h, 0.4));',
        ' float s = max(dot(vDir, sun), 0.0);',
        // soft fair-weather clouds, flattened toward the horizon
        ' if (h > 0.0) { vec2 q = vDir.xz / (h + 0.12) * 1.6; float n = 0.0, a = 0.5;',
        '   for (int i = 0; i < 5; i++) { n += a * (sin(q.x * 1.7 + sin(q.y * 1.3)) * cos(q.y * 1.9 + sin(q.x * 0.7)) * 0.5 + 0.5); q = mat2(1.6, 1.2, -1.2, 1.6) * q; a *= 0.5; }',
        '   float cl = smoothstep(0.55, 0.78, n) * smoothstep(0.0, 0.18, h);',
        '   c = mix(c, vec3(1.0, 0.99, 0.97), cl * 0.85); }',
        ' c += vec3(1.0,0.95,0.85) * (pow(s, 900.0) * 1.4 + pow(s, 12.0) * 0.18);',
        ' gl_FragColor = vec4(c, 1.0); }',
      ].join('\n'),
    }));
  sky.renderOrder = -1;
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xe6f2ff, 0x8a8f99, 0.72));
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
  const GLASS_COLOR = map.COLORS.glass;
  // which material a face gets
  function bucketFor(b, n) {
    const k = b.props.kind, up = Math.abs(n[1]) > 0.5;
    if (k === 'ramp') return 'ramp';
    if (k === 'cliff') return 'rock';
    if (k === 'route' || k === 'door') return 'paint';
    if (k === 'block' || k === 'lane') return 'panel';
    if (k === 'street') return 'asphalt';
    if (k === 'building' && !up) return b.props.color === GLASS_COLOR ? 'glass' : 'facade';
    return 'concrete';
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
    deco.addBox([-160000, GROUND - 40, -160000], [230000, GROUND, 160000], { color: 0x5d646b, kind: 'street' });
    let seed = 99;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const clear = (a) => !footprints.some(q => a[0] < q[2] + 500 && a[2] > q[0] - 500 && a[1] < q[3] + 500 && a[3] > q[1] - 500);
    for (let x = -137200; x < 168000; x += 2200) {
      for (let z = -70000; z < 101000; z += 2200) {
        const w = 700 + rnd() * 1100, d = 700 + rnd() * 1100, h = 250 + rnd() * rnd() * 2600;
        const ax = x + rnd() * (2000 - w), az = z + rnd() * (2000 - d), glass = rnd() < 0.25;
        const a = [ax, az, ax + w, az + d];
        if (clear(a)) deco.addBox([a[0], GROUND, a[1]], [a[2], GROUND + h, a[3]], { color: glass ? 0x8fc4dd : 0xe4e2db, kind: 'building' });
      }
    }
  }

  function buildGeometry(filter, bucketOf) {
    const out = {};
    const color = new THREE.Color();
    const get = (name) => out[name] || (out[name] = { pos: [], nor: [], uv: [], col: [], lines: [] });
    for (const b of world.brushes.concat(deco.brushes)) {
      if (!filter(b)) continue;
      color.setHex(b.props.color || 0xffffff).convertSRGBToLinear();
      const y0 = b.min[1], hgt = Math.max(1, b.max[1] - b.min[1]);
      for (const f of b.faces) {
        const n = f.n, v = f.verts;
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
    const solid = buildGeometry(b => !b.props.nonsolid && !b.props.door, bucketFor);
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

  // ------------------------------------------------------------ visual-only props
  // Cornices on buildings, and rooftop clutter on the skyline buildings you
  // can't reach on the route. None of this collides.
  {
    const corniceMat = std({ map: TEX.concrete, color: 0xbfc3c6, vertexColors: false });
    const propMat = std({ map: TEX.paint, color: 0xd6d8d6, vertexColors: false, roughness: 0.6 });
    const darkMat = std({ color: 0x59616a, vertexColors: false, roughness: 0.7 });
    const tankMat = std({ map: TEX.rock, color: 0xb38d6a, vertexColors: false });
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const tankGeo = new THREE.CylinderGeometry(1, 1, 1, 18);
    const coneGeo = new THREE.ConeGeometry(1, 1, 18);
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
      // a cornice band just under the roof line, proud of the wall
      add(unitBox, corniceMat, cx, y1 - 10, cz, w + 8, 20, d + 8, false);
      if (!b.props.far) continue;
      // rooftop clutter on skyline buildings only
      const n = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const px = x0 + 80 + rand() * Math.max(1, w - 160), pz = z0 + 80 + rand() * Math.max(1, d - 160);
        const r = rand();
        if (r < 0.35) {
          // water tank on legs
          const rad = 34 + rand() * 18, h = 70 + rand() * 30;
          for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(legGeo, darkMat, px + lx * rad * 0.7, y1 + 25, pz + lz * rad * 0.7, 3, 50, 3);
          add(tankGeo, tankMat, px, y1 + 50 + h / 2, pz, rad, h, rad);
          add(coneGeo, darkMat, px, y1 + 50 + h + 12, pz, rad * 1.05, 24, rad * 1.05);
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
    if (e.code === 'KeyR') restartCourse();
    else if (e.code === 'KeyF') respawn();
    else if (e.code === 'KeyQ') { if (turnLeft <= 0) turnLeft = Math.PI; } // Mirror's Edge 180° quick turn
    else if (/^Digit[0-9]$/.test(e.code) && map.order[(+e.code.slice(5) + 9) % 10]) goCourse(map.order[(+e.code.slice(5) + 9) % 10]);
    else if (e.code === 'KeyT') goCourse('tutorial');
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
    return {
      forward: (down('forward') ? 1 : 0) - (down('back') ? 1 : 0),
      side: (down('right') ? 1 : 0) - (down('left') ? 1 : 0),
      jump, duck: down('duck'), yaw, pitch,
    };
  }

  // ------------------------------------------------------------ game state
  const game = {
    course: null, cp: 0, cpSpawn: null, running: false, inStart: false,
    startTick: 0, tick: 0, finished: null, mission: null,
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
    place(game.cpSpawn);
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
        if (isBest || !ghost.has(game.course)) ghost.keep(game.course);
        lbSubmit(game.course, ticks);
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
    const runs = {};
    let rec = null, phase = 0, match = 0;
    const gapEl = document.getElementById('ghostgap');
    const get = (course) => course in runs ? runs[course] : (runs[course] = load(GHOST_KEY + course));
    const sample = () => rec.push(Math.round(player.pos[0]), Math.round(player.pos[1]), Math.round(player.pos[2]), Math.round(yaw * 100), player.ducked ? 1 : 0);
    return {
      start() { rec = []; sample(); },
      stop() { rec = null; },
      tick(offset) { if (rec && offset % GHOST_EVERY === 0) sample(); },
      keep(course) {
        if (!rec) return;
        runs[course] = { e: GHOST_EVERY, s: rec };
        save(GHOST_KEY + course, runs[course]);
        rec = null;
      },
      has: (course) => !!get(course),
      root,
      tint(c) {
        const col = new THREE.Color(c).convertSRGBToLinear();
        mat.color.copy(col); mat.emissive.copy(col).multiplyScalar(0.55);
      },
      // t: ticks since the run started, or null to hide
      update(dt, t) {
        const g = game.course && t !== null && settings.ghost ? get(game.course) : null;
        if (!g) { root.visible = false; gapEl.className = ''; return; }
        const s = g.s, n = s.length / 5, f = Math.min(t / g.e, n - 1), i = Math.floor(f), j = Math.min(i + 1, n - 1), k = f - i;
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
        // stay visible beside you; only thin out when it is inside your view
        const d = Math.hypot(x - player.pos[0], y - player.pos[1], z - player.pos[2]);
        mat.opacity = d < 22 ? 0 : 0.25 + 0.4 * Math.min(1, (d - 22) / 60);
        root.visible = true;
        marker.visible = d > 120;
        // time gap: when did the ghost pass the point nearest to you?
        if (!moving) { match = 0; gapEl.className = ''; return; }
        const P = player.pos;
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
    };
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
  function makeTrail(height, life) {
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
    scene.add(mesh);
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
        const cp = camera.position, at = (i) => pts[Math.max(0, Math.min(n - 1, n - 1 - i))];
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

  // ------------------------------------------------------------ stats
  const stats = { jumps: 0, jumpSpeed: 0, syncGood: 0, syncAll: 0, lastSync: null, lastYaw: 0, gain: 0 };
  const speedHist = new Float32Array(360);
  let histIdx = 0;

  function trackSync(cmd) {
    const dy = cmd.yaw - stats.lastYaw;
    stats.lastYaw = cmd.yaw;
    if (player.onGround || Math.abs(dy) < 1e-6) return;
    stats.syncAll++;
    // turning left (yaw increasing) should be paired with A, right with D
    if ((dy > 0 && cmd.side < 0) || (dy < 0 && cmd.side > 0)) stats.syncGood++;
  }

  // ------------------------------------------------------------ camera feel
  const cam = { dip: 0, dipVel: 0, roll: 0, fovKick: 0, bobPhase: 0, bob: 0, flip: 0 };

  const EVENT_SFX = { jump: 'jump', slide: 'slide', wallrun: 'whoosh', walljump: 'walljump', climbjump: 'walljump', climb: 'climb', vault: 'vault', mantle: 'vault' };
  function handleEvents() {
    for (const e of player.events) {
      if (EVENT_SFX[e.type]) A.play(EVENT_SFX[e.type]);
      tutorialEvent(e.type);
      if (e.type === 'land' && e.speed > 120) A.play('land', { speed: e.speed });
      if (e.type === 'jump') {
        if (stats.syncAll > 10) stats.lastSync = stats.syncGood / stats.syncAll;
        stats.syncGood = stats.syncAll = 0;
        stats.jumps++;
        stats.gain = e.speed - stats.jumpSpeed;
        stats.jumpSpeed = e.speed;
      } else if (e.type === 'land') {
        // big drop with crouch held: tuck and roll (camera only, speed is untouched)
        if (e.speed > 620 && down('duck')) { cam.flip = 0.0001; body.act('roll', 0.55); A.play('slide'); }
        else if (e.speed > 200) cam.dipVel -= Math.min(260, (e.speed - 150) * 0.5);
        if (player.hspeed() < 20) stats.jumps = 0;
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
    vScene.add(new THREE.HemisphereLight(0xeef6ff, 0x6f747d, 0.85));
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
      return { shoulder, elbow, wrist, knuckles, side, cur: { x: 0.6, z: 0, y: 0, e: 1.4, w: 0, k: 0.4 } };
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

    const st = { phase: 0, act: null, actT: 0, actDur: 0, roll: 0 };
    const lerp = (a, b, k) => a + (b - a) * k;
    function act(name, dur) { st.act = name; st.actT = 0; st.actDur = dur; }

    // targets in radians: x swings the arm forward, z lifts it out sideways,
    // e bends the elbow, w tips the wrist, k curls the fingers
    function armTarget(a, mode, t, hs) {
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
        default: return { x: 0.95 + swing * 0.45 * run, z: s * 0.1, y: 0, e: 1.05 - swing * 0.3 * run, w: -0.2, k: 0.9 };
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
      setAccent(k.accent);
    }
    function setAccent(c) { red.color.copy(lin(c)); shoe.color.copy(lin(c)); }
    return { update, render, resize, act, st, armsRoot, hips, setSkin, setAccent };
  })();
  cosmetics.apply();
  onResize = body.resize;
  body.resize(window.innerWidth / window.innerHeight);

  // ------------------------------------------------------------ HUD
  const $ = (id) => document.getElementById(id);
  const hud = {
    speed: $('speed'), speedWrap: $('speedwrap'), jump: $('jumpstat'), timer: $('timer'), course: $('course'),
    bestEl: $('best'), stage: $('stage'), toast: $('toast'), graph: $('graph'), keys: $('keys'),
    k: { w: $('k-w'), a: $('k-a'), s: $('k-s'), d: $('k-d'), j: $('k-j'), c: $('k-c') },
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

  let smoothSpeed = 0, lastShown = -1, trend = 0;
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
  const LEVEL_ORDER = ['tutorial'].concat(map.order, map.gauntlet);
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
    const nx = nextLevel(game.course);
    $('c-next').textContent = nx ? 'Next: ' + map.courses[nx].name : 'Back to levels';
    $('c-next').dataset.target = nx || 'levels';
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
    closeComplete();
    if (what === 'next') {
      const t = $('c-next').dataset.target;
      if (t === 'story') { goIdle(); showMenuState(); openDrawer('story'); return; }
      if (t === 'levels') { goIdle(); game.started = false; showMenuState(); showScreen('levels'); return; }
      if (t.startsWith('job:')) { startJob(+t.slice(4)); return; }
      goCourse(t);
      startPlay();
    }
    else if (what === 'retry') { restartCourse(); startPlay(); }
    else { showMenuState(); showScreen('levels'); } // levels: back to level select
  }
  for (const b of completeEl.querySelectorAll('[data-act]')) b.addEventListener('click', () => completeAction(b.dataset.act));
  window.addEventListener('keydown', (e) => {
    if (completeEl.hidden) return;
    if (e.code === 'Enter') { e.preventDefault(); completeAction('next'); }
    else if (e.code === 'KeyR') completeAction('retry');
    else if (e.code === 'Escape') completeAction('levels');
  });

  // ------------------------------------------------------------ tutorial
  const tut = { step: -1, done: false, hops: 0, surfTicks: 0 };
  const tutEl = $('tut');
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
      $('tut-body').textContent = 'Press Esc and pick a level. Surf and Bhop are the gentlest starts; Crossover uses everything you just did.';
      $('tut-keys').textContent = '';
      tutEl.classList.add('done');
      return;
    }
    const s = stepInfo();
    const n = map.courses.tutorial.steps.length;
    $('tut-step').textContent = 'Step ' + (tut.step + 1) + ' of ' + n;
    $('tut-title').textContent = s.title;
    $('tut-body').textContent = s.body;
    const keysEl = $('tut-keys');
    keysEl.textContent = '';
    for (const k of s.keys) { const kc = document.createElement('span'); kc.className = 'kc'; kc.textContent = k; keysEl.appendChild(kc); }
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
  function footsteps() {
    const hs = player.hspeed();
    const walking = player.onGround && !player.slide && hs > 60;
    if (!walking && !player.wallrun && !player.climb) { stride = Math.min(stride, 40); return; }
    stride += (player.climb ? 300 : hs) * TICK;
    const len = player.wallrun ? 70 : player.climb ? 45 : 64 + hs * 0.06;
    if (stride > len) {
      stride = 0;
      A.play('step', { pitch: player.wallrun ? 1.35 : player.ducked ? 0.8 : 1, soft: player.ducked });
    }
  }

  // ------------------------------------------------------------ loop
  let acc = 0, last = performance.now(), histTimer = 0;

  function step() {
    const cmd = buildCmd();
    prev.pos = player.pos.slice();
    prev.eye = player.viewOffset;
    trackSync(cmd);
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

    if (turnLeft > 0) {
      const s = Math.min(turnLeft, dt * Math.PI / 0.24);
      yaw += s; turnLeft -= s;
    }

    if ((locked || game.demo) && !game.freeze) {
      acc += dt;
      let n = 0;
      while (acc >= TICK && n < 12) { step(); acc -= TICK; n++; }
      if (n === 12) acc = 0;
    }
    const alpha = acc / TICK;
    ghost.update(dt, game.running ? game.tick - game.startTick + alpha : game.inStart && game.course ? 0 : null);

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

    if (!locked && !game.demo && attract.active) {
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
      camera.rotation.set(pitch + flipPitch, yaw, cam.roll);
      if (settings.body) body.update(dt, hs, pitch + flipPitch, cam.roll, cam.bob, cam.dip);
    }
    cosmetics.update(now, ix, iy, iz, hs, (locked || !!game.demo) && !attract.active);
    A.update({
      speed: hs, playing: locked || !!game.demo, airborne: !player.onGround,
      surfing: !player.onGround && surfing(), sliding: !!player.slide && player.onGround, slideTime: player.slide ? player.slide.t : 0,
    });
    sky.position.copy(camera.position);

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
    renderer.render(scene, camera);
    if (settings.body && (locked || game.demo) && !attract.active) body.render();
  }

  // ------------------------------------------------------------ online leaderboard
  // Each player's best per level lives in one shared doc, times/<their id>,
  // which only they can write and everyone can read. Names come from the
  // viewer's own claude.ai directory and are never stored. The board only
  // lights up inside claude.ai; anywhere else the game runs without it.
  const LB_AA = 150; // only runs at the standard air acceleration count
  const lb = { db: null, user: null, me: null, docs: null, readOnly: false, writing: Promise.resolve(), backfilled: false };
  // the rebuilt levels post under a new field, so old short times drop off the board
  const lbKey = (c) => REBUILT.includes(c) ? c + '_v2' : c;
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
  function lbSubmit(course, ticks) {
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
    const el = $('c-online');
    const all = game.course ? lbStandings(game.course) : [];
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
    db.collection('times').limit(1000).onSnapshot((snap) => {
      lb.docs = snap.docs.map(d => ({ id: d.id, t: d.data() || {} }));
      if (!snap.metadata.fromCache) lbBackfill();
      lbRender();
    }, () => { lb.db = null; lbRender(); });
    lbRender();
  })();

  // ------------------------------------------------------------ menu
  const menu = $('menu');
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');

  // live preview camera behind the menu
  const attract = { active: true, course: map.order[0], hover: null, t0: 0, cycle: 0 };
  const flashEl = $('flash');
  const MENU_ROWS = [{ name: 'tutorial', key: 'T' }].concat(map.order.map((name, i) => ({ name, key: String((i + 1) % 10) })),
    map.gauntlet.map((name, i) => ({ name, key: 'G' + (i + 1) })));
  const ALL_LEVELS = map.order.concat(map.gauntlet);
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
      (tutorial ? 'Start here' : c.set === 'gauntlet' ? 'Gauntlet ' + (map.gauntlet.indexOf(name) + 1) + ' of 6' : map.order.indexOf(name) >= 6 ? 'Advanced' : 'Level ' + (map.order.indexOf(name) + 1));
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
    flashEl.classList.remove('go'); void flashEl.offsetWidth; flashEl.classList.add('go');
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
      if (i === 7 || i === 11) { const sep = document.createElement('li'); sep.className = 'sep'; sep.setAttribute('aria-hidden', 'true'); ol.appendChild(sep); }
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.className = 'card'; b.dataset.course = r.name;
      b.style.setProperty('--c', hex(c.color));
      const pips = c.difficulty ? pipHtml(c.difficulty, 'Difficulty ') : '<span>' + c.type + '</span>';
      const bt = best[r.name] ? fmt(best[r.name]) : '';
      const adv = c.set === 'gauntlet' ? '<span class="adv">GAUNTLET</span>' : map.order.indexOf(r.name) >= 6 ? '<span class="adv">ADV</span>' : '';
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
    $('d-title').textContent = { settings: 'Settings', story: 'Story', cosmetics: 'Cosmetics', controls: 'Controls' }[which];
    drawer.classList.toggle('wide', which === 'story' || which === 'cosmetics');
    if (which === 'cosmetics') buildCosmetics();
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
        b.disabled = !unlocked(it);
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
        cn.innerHTML = it.name + '<small>' + (b.disabled ? '★ ' + it.need : cosmetics[key] === it ? 'Equipped' : it.need ? '★ ' + it.need : 'Default') + '</small>';
        b.append(sw, cn);
        b.addEventListener('click', () => {
          A.play('click');
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
  }
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
  bindCheck('s-autohop', 'autohop', () => { player.cfg.autohop = settings.autohop; });
  bindCheck('s-kick', 'fovKick');
  bindCheck('s-bob', 'bob');
  bindCheck('s-body', 'body');
  bindCheck('s-ghost', 'ghost');
  bindCheck('s-keys', 'keys', () => hud.keys.hidden = !settings.keys);
  bindCheck('s-shadows', 'shadows', () => {
    renderer.shadowMap.enabled = settings.shadows;
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  });
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
  document.addEventListener('pointerlockchange', () => { if (!locked) showMenuState(); });
  // the first click anywhere wakes the audio so the menu has music
  window.addEventListener('pointerdown', () => A.init(), { once: true });
  // menu keys: arrows browse levels, Enter plays, Esc closes the drawer
  window.addEventListener('keydown', (e) => {
    if (locked || !completeEl.hidden || document.body.classList.contains('playing')) return;
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

  // ------------------------------------------------------------ boot
  goIdle();
  previewCourse(map.order[0]);
  showMenuState();
  if (location.hash === '#demo') game.demo = true; // headless screenshot mode
  window.__strafe = { player, game, goCourse, place, attract, previewCourse, body, ghost, cosmetics, step, setView: (y, p) => { yaw = y; pitch = p; } };
  requestAnimationFrame((t) => { last = t; frame(t); });
})();
