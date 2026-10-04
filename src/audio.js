// Strafe audio: everything is synthesized with Web Audio, no sample files.
// Movement one-shots, speed-driven surf / slide loops, UI blips, and a
// generative ambient-electronic score whose filter opens up as you go faster.
(function (root) {
  'use strict';

  let ctx = null;
  let master, sfxBus, musicBus, musicFilter, reverb, reverbSend, noise;
  const loops = {};
  const vol = { master: 0.8, music: 0.5, sfx: 0.8, muted: false };
  const state = { speed: 0, playing: false, intensity: 0 };

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 3.5;
    comp.attack.value = 0.004; comp.release.value = 0.2;
    comp.connect(ctx.destination);
    master = ctx.createGain(); master.connect(comp);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    musicFilter = ctx.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 1400; musicFilter.Q.value = 0.7;
    musicBus = ctx.createGain(); musicFilter.connect(musicBus); musicBus.connect(master);

    // generated hall impulse
    const len = Math.floor(ctx.sampleRate * 2.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    reverb = ctx.createConvolver(); reverb.buffer = ir;
    reverbSend = ctx.createGain(); reverbSend.gain.value = 0.9;
    reverbSend.connect(reverb); reverb.connect(master);

    const nlen = ctx.sampleRate * 2;
    noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;

    loops.surf = makeLoop('bandpass', 2200, 0.9, 'highpass', 900);
    loops.slide = makeLoop('bandpass', 650, 1.4);

    applyVolumes();
    startMusic();
  }

  function makeLoop(type, freq, q, type2, freq2) {
    const src = ctx.createBufferSource();
    src.buffer = noise; src.loop = true;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    let tail = f;
    src.connect(f);
    if (type2) {
      const f2 = ctx.createBiquadFilter(); f2.type = type2; f2.frequency.value = freq2;
      f.connect(f2); tail = f2;
    }
    const g = ctx.createGain(); g.gain.value = 0;
    tail.connect(g); g.connect(sfxBus);
    src.start();
    return { f, g };
  }

  function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(vol.muted ? 0 : vol.master, t, 0.03);
    sfxBus.gain.setTargetAtTime(vol.sfx, t, 0.03);
    musicBus.gain.setTargetAtTime(vol.music * 0.55, t, 0.03);
  }

  function setVolumes(v) { Object.assign(vol, v); applyVolumes(); }

  // ---------------------------------------------------------------- per-frame
  // s: { speed, airborne, surfing, sliding, wallrun, playing }
  function update(s) {
    if (!ctx) return;
    const t = ctx.currentTime, k = 0.06;
    state.speed = s.speed; state.playing = s.playing;
    const sp = s.playing ? s.speed : 0;
    loops.surf.g.gain.setTargetAtTime(s.playing && s.surfing ? 0.03 + Math.min(1, sp / 1600) * 0.08 : 0, t, 0.04);
    loops.surf.f.frequency.setTargetAtTime(1600 + sp * 0.7, t, k);
    // slide hiss: a short swell that fades as the slide goes on, not a constant drone
    const slideAmt = s.playing && s.sliding ? Math.min(1, sp / 900) * Math.max(0, 1 - (s.slideTime || 0) / 0.9) : 0;
    loops.slide.g.gain.setTargetAtTime(slideAmt * 0.06, t, slideAmt > 0 ? 0.05 : 0.02);
    loops.slide.f.frequency.setTargetAtTime(450 + sp * 0.5, t, k);
    const target = s.playing ? 0.35 + Math.min(1, sp / 1400) * 0.65 : 0;
    state.intensity += (target - state.intensity) * 0.05;
    const cutoff = s.playing ? 900 + Math.min(sp, 2000) * 3.2 : 1300;
    musicFilter.frequency.setTargetAtTime(cutoff, t, 0.25);
  }

  // ---------------------------------------------------------------- one-shots
  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function noiseHit(t, type, freq, q, peak, dec, dest, sweepTo) {
    const s = ctx.createBufferSource(); s.buffer = noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dec);
    const g = ctx.createGain(); env(g, t, 0.004, peak, dec);
    s.connect(f); f.connect(g); g.connect(dest || sfxBus);
    s.start(t, Math.random() * 1.5); s.stop(t + dec + 0.05);
  }
  function tone(t, type, f0, f1, peak, a, dec, dest) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + a + dec);
    const g = ctx.createGain(); env(g, t, a, peak, dec);
    o.connect(g); g.connect(dest || sfxBus);
    o.start(t); o.stop(t + a + dec + 0.05);
    return g;
  }

  const SFX = {
    step(t, o) {
      const k = o.soft ? 0.6 : 1;
      noiseHit(t, 'bandpass', (o.pitch || 1) * (380 + Math.random() * 260), 1.6, 0.1 * k, 0.04);
      tone(t, 'sine', 95 * (o.pitch || 1), 55, 0.07 * k, 0.003, 0.05);
    },
    jump(t) {
      noiseHit(t, 'bandpass', 500, 1.1, 0.07, 0.16, null, 1700);
      tone(t, 'sine', 140, 90, 0.06, 0.004, 0.07);
    },
    land(t, o) {
      const p = Math.min(1, Math.max(0.15, (o.speed || 300) / 900));
      tone(t, 'sine', 110, 42, 0.24 * p, 0.003, 0.14);
      noiseHit(t, 'lowpass', 700, 0.7, 0.12 * p, 0.07);
    },
    slide(t) { noiseHit(t, 'bandpass', 900, 1.2, 0.035, 0.12, null, 500); },
    whoosh(t) { noiseHit(t, 'bandpass', 400, 0.9, 0.06, 0.2, null, 1800); },
    walljump(t) {
      tone(t, 'sine', 130, 60, 0.16, 0.003, 0.1);
      noiseHit(t, 'bandpass', 600, 1, 0.06, 0.18, null, 2200);
    },
    vault(t) {
      noiseHit(t, 'highpass', 1800, 0.8, 0.14, 0.04);
      noiseHit(t + 0.06, 'bandpass', 500, 1, 0.07, 0.2, null, 1400);
    },
    climb(t) {
      for (let i = 0; i < 3; i++) noiseHit(t + i * 0.11, 'bandpass', 700 + i * 120, 2, 0.1, 0.04);
    },
    checkpoint(t) {
      tone(t, 'triangle', 880, 880, 0.12, 0.005, 0.7, reverbSend);
      tone(t, 'triangle', 880, 880, 0.08, 0.005, 0.5);
      tone(t + 0.09, 'triangle', 1318.5, 1318.5, 0.1, 0.005, 0.8, reverbSend);
      tone(t + 0.09, 'triangle', 1318.5, 1318.5, 0.07, 0.005, 0.6);
    },
    finish(t) {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
        tone(t + i * 0.07, 'triangle', f, f, 0.1, 0.005, 1.2, reverbSend);
        tone(t + i * 0.07, 'sine', f, f, 0.08, 0.005, 0.9);
      });
    },
    respawn(t) {
      tone(t, 'sine', 520, 140, 0.12, 0.004, 0.25);
      noiseHit(t, 'bandpass', 2000, 1, 0.05, 0.2, null, 400);
    },
    teleport(t) {
      tone(t, 'sine', 300, 1200, 0.1, 0.01, 0.3, reverbSend);
      noiseHit(t, 'bandpass', 600, 2, 0.06, 0.3, null, 3000);
    },
    start(t) { tone(t, 'square', 1760, 1760, 0.03, 0.002, 0.05); },
    hover() { if (!ctx) return; tone(ctx.currentTime, 'sine', 1500, 1500, 0.025, 0.002, 0.03); },
    click() { if (!ctx) return; tone(ctx.currentTime, 'triangle', 700, 1400, 0.06, 0.002, 0.07); },
  };

  function play(name, o) {
    if (!ctx || !SFX[name]) return;
    SFX[name](ctx.currentTime + 0.005, o || {});
  }

  // ---------------------------------------------------------------- music
  // 96 BPM, four bars per loop: Am9 - Fmaj9 - Cmaj7 - Em7(add11)
  const BPM = 96, STEP = 60 / BPM / 4;
  const CHORDS = [
    { root: 45, pad: [57, 60, 64, 67, 71], arp: [69, 72, 76, 79, 83, 79, 76, 72] },
    { root: 41, pad: [53, 57, 60, 64, 67], arp: [65, 69, 72, 76, 79, 76, 72, 69] },
    { root: 48, pad: [55, 59, 60, 64, 67], arp: [67, 71, 72, 76, 79, 76, 72, 71] },
    { root: 40, pad: [55, 59, 62, 64, 69], arp: [64, 67, 71, 74, 76, 74, 71, 67] },
  ];
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  let delay, step = 0, nextTime = 0, timer = null;

  function startMusic() {
    delay = ctx.createDelay(1.5);
    delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.36;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2600;
    delay.connect(dl); dl.connect(fb); fb.connect(delay);
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    dl.connect(wet); wet.connect(musicFilter);
    nextTime = ctx.currentTime + 0.1;
    timer = setInterval(schedule, 25);
  }

  function schedule() {
    if (!ctx || ctx.state !== 'running') return;
    while (nextTime < ctx.currentTime + 0.15) {
      playStep(step, nextTime);
      step = (step + 1) % 64;
      nextTime += STEP;
    }
  }

  function voice(t, type, f, peak, a, dur, rel, dest, detune) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    if (detune) o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a, dur) + rel);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + Math.max(a, dur) + rel + 0.05);
  }

  function playStep(s, t) {
    const bar = Math.floor(s / 16), i = s % 16, ch = CHORDS[bar];
    const I = state.intensity;
    if (i === 0) {
      for (const n of ch.pad) {
        voice(t, 'sawtooth', midi(n), 0.018, 0.9, STEP * 15, 1.6, musicFilter, -7);
        voice(t, 'sawtooth', midi(n), 0.018, 0.9, STEP * 15, 1.6, musicFilter, 7);
      }
      voice(t, 'sine', midi(ch.pad[0] + 12), 0.02, 1.2, STEP * 14, 1.8, reverbSend);
    }
    // arpeggio, sparse in the menu, every 16th at speed
    const arpOn = I > 0.55 || i % 2 === 0;
    if (arpOn) {
      const n = ch.arp[(s + (i > 7 ? 2 : 0)) % ch.arp.length];
      const g = 0.035 + I * 0.02;
      voice(t, 'triangle', midi(n), g, 0.004, STEP * 0.5, 0.22, musicFilter);
      voice(t, 'triangle', midi(n), g * 0.8, 0.004, STEP * 0.5, 0.22, delay);
    }
    // bass
    if (i === 0 || i === 6 || i === 10 || (I > 0.7 && i === 14)) {
      voice(t, 'triangle', midi(ch.root), 0.13, 0.01, STEP * 2.5, 0.25, musicFilter);
      voice(t, 'sine', midi(ch.root - 12), 0.1, 0.01, STEP * 2.5, 0.3, musicBus);
    }
    // drums fade in with intensity
    if (I > 0.2) {
      const d = Math.min(1, (I - 0.2) / 0.5);
      if (i === 0 || i === 8 || (I > 0.75 && (i === 4 || i === 12))) {
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
        const g = ctx.createGain(); env(g, t, 0.002, 0.32 * d, 0.22);
        o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.3);
      }
      if (i % 4 === 2) noiseHit(t, 'highpass', 7500, 0.7, 0.05 * d, 0.05, musicBus);
      if (I > 0.6 && i % 2 === 1) noiseHit(t, 'highpass', 9000, 0.7, 0.018 * d, 0.03, musicBus);
      if (i === 4 || i === 12) noiseHit(t, 'bandpass', 1800, 0.8, 0.07 * d, 0.12, reverbSend);
    }
  }

  root.StrafeAudio = { init, update, play, setVolumes, get ready() { return !!ctx; } };
})(window);
