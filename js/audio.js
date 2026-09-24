// Web Audio: synthesised engines, wind, rain, rolling and one-shot effects, and the cockpit voice
// (altitude callouts, GPWS warnings, crew lines) from recorded clips in audio/voice/ (made by
// tools/make-voice.py), played through the same Web Audio graph. A phrase without a clip falls
// back to the browser's speech (speechSynthesis), then to an attention tone.
//
// The one-shot effects are made to be heard on a phone speaker too, which plays little below
// ~400 Hz: every impact has a thump for headphones and a chirp, crunch or clank above it.
//
// Browsers only let a page start sound from a user gesture, so main.js calls unlock() on every
// tap, click and key press. iPhones and iPads need more (see unlock() and setSession()): the
// sound has to be started inside the gesture, iOS pauses it after a call or the app switcher, it
// follows the ring/silent switch unless the page asks otherwise, and speech stays silent until a
// first utterance is spoken from a gesture.

/** Half a second of silence as a WAV file (8 kHz, 8-bit mono). */
export function silentWav() {
  const n = 4000, v = new DataView(new ArrayBuffer(44 + n));
  const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);   // 8-bit audio is silent at its mid value
  return v.buffer;
}
const silentWavUrl = () => URL.createObjectURL(new Blob([silentWav()], { type: 'audio/wav' }));

export class AudioSystem {
  /** @param opts { ios } an iPhone or iPad (js/platform.js isIOS) */
  constructor(opts = {}) {
    this.ios = !!opts.ios;
    this.keepAlive = null;         // older iOS: a silent looping media element (see setSession)
    this.primed = false;           // a sound has been started inside a gesture
    this.speechPrimed = false;     // an utterance has been spoken from a gesture
    this.clips = new Map();        // phrase -> AudioBuffer (audio/voice/)
    this.clipBase = opts.clipBase || 'audio/voice/';
    this.fallbacks = [];           // phrases that had to use the browser's speech (no clip loaded)
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.log = [];                 // { t, kind, text } — inspected by the tests
    this.time = 0;
    this.speechQueue = [];
    this.speaking = false;
    this.lastSaid = new Map();
    this.voice = null;
    this.stickShaker = null;
    this.hornOsc = null;
    this.config = { engine: true };
  }

  /** Must be called from a user gesture. `context`: render somewhere else (tests: an OfflineAudioContext). */
  init(context) {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC && !context) return;
    const ctx = context || new AC();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.enabled ? 0.8 : 0;
    // a soft clipper at the end: linear up to 0.7, then rounding off peaks (up to 3× full scale)
    // instead of hard clipping; unlike a compressor it adds no make-up gain, so impacts keep their
    // contrast with the engines
    const pre = ctx.createGain(); pre.gain.value = 1 / 3;
    const clip = ctx.createWaveShaper(); const n = 2048, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1) * 2 - 1) * 3, a = Math.abs(x); curve[i] = Math.sign(x) * (a < 0.7 ? a : 0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3)); }
    clip.curve = curve;
    this.master.connect(pre); pre.connect(clip); clip.connect(ctx.destination);
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = noiseBuf;
    const noise = (filterType, freq, q, gain) => {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      return { src, f, g };
    };
    // engines: two units, each rumble + whine + core noise
    this.engines = [0, 1].map((i) => {
      const rumble = ctx.createOscillator(); rumble.type = 'sawtooth'; rumble.frequency.value = 45 + i * 2;
      const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 160;
      const rg = ctx.createGain(); rg.gain.value = 0;
      rumble.connect(rf); rf.connect(rg); rg.connect(this.master); rumble.start();
      const whine = ctx.createOscillator(); whine.type = 'sine'; whine.frequency.value = 900;
      const wg = ctx.createGain(); wg.gain.value = 0; whine.connect(wg); wg.connect(this.master); whine.start();
      const core = noise('bandpass', 1200, 0.8, 0);
      return { rumble, rf, rg, whine, wg, core };
    });
    this.wind = noise('bandpass', 500, 0.5, 0);
    this.rain = noise('highpass', 3000, 0.4, 0);
    this.roll = noise('lowpass', 70, 0.7, 0);
    this.skid = noise('bandpass', 2200, 6, 0);
    if (!context && window.speechSynthesis) {
      const pick = () => {
        const vs = window.speechSynthesis.getVoices();
        this.voice = vs.find((v) => /en[-_]US/i.test(v.lang) && /male|david|mark|daniel/i.test(v.name)) || vs.find((v) => /^en/i.test(v.lang)) || vs[0] || null;
      };
      pick(); window.speechSynthesis.onvoiceschanged = pick;
    }
    if (!context) this.loadClips();
  }

  /** Fetch and decode the voice clips (in the background; until one is ready its phrase is spoken by the browser). */
  loadClips() {
    const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const decode = (data) => new Promise((res, rej) => { const p = this.ctx.decodeAudioData(data, res, rej); if (p && p.then) p.then(res, rej); });
    this.clipsReady = fetch(this.clipBase + 'phrases.json').then((r) => r.json()).then((spec) => Promise.all(spec.phrases.map((text) =>
      fetch(this.clipBase + slug(text) + '.mp3').then((r) => r.arrayBuffer()).then(decode).then((buf) => { this.clips.set(text, buf); }).catch(() => { /* this phrase is spoken by the browser */ }))))
      .then(() => this.clips.size, () => 0);
    return this.clipsReady;
  }

  /** The sound is playing (not waiting for a gesture, or interrupted by a call on iOS). */
  get running() { return !!this.ctx && this.ctx.state === 'running'; }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05);
    this.setSession();
  }

  /**
   * Start (or restart) the sound. Call from a user gesture: a tap ending, a click or a key press.
   * iOS only unlocks sound that is started inside one, and after a phone call, Siri or the app
   * switcher leaves it 'interrupted' until the next gesture, so this runs on every gesture.
   */
  unlock() {
    this.init();
    const ctx = this.ctx;
    if (!ctx) return;
    this.setSession();
    const running = ctx.state === 'running';
    if (!running) {
      const p = ctx.resume();
      if (p && p.catch) p.catch(() => { /* not a gesture that counts: the next one will do */ });
    }
    if (!this.primed || !running) {
      // older iOS unlocks only on sound actually started in the gesture: one silent sample
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination); src.start(0);
      this.primed = true;
    }
    // iOS speaks only once a first utterance has come from a gesture: an empty, silent one
    if (!this.speechPrimed && typeof window !== 'undefined' && window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined') {
      this.speechPrimed = true;
      try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis.speak(u); } catch (e) { /* no speech */ }
    }
    if (this.keepAlive && this.keepAlive.paused && this.enabled) { const p = this.keepAlive.play(); if (p && p.catch) p.catch(() => {}); }
  }
  /**
   * On iPhone and iPad, web audio follows the ring/silent switch: in silent mode a page's sound
   * is muted (videos still play). A game's sound should play like a video's. Where Safari has the
   * Audio Session API that is one setting; older versions switch when a media element is playing,
   * so a silent looping one is started. With the sound option off, other apps' audio (music)
   * is left alone.
   */
  setSession() {
    const s = typeof navigator !== 'undefined' ? navigator.audioSession : null;
    const type = this.enabled ? 'playback' : 'ambient';
    if (s && 'type' in s) { if (s.type !== type) { try { s.type = type; } catch (e) { /* not allowed */ } } return; }
    if (!this.ios) return;
    if (!this.enabled) { if (this.keepAlive) this.keepAlive.pause(); return; }
    if (!this.keepAlive && typeof document !== 'undefined') {
      const a = document.createElement('audio');
      a.src = silentWavUrl(); a.loop = true; a.preload = 'auto';
      a.setAttribute('playsinline', ''); a.setAttribute('x-webkit-airplay', 'deny');
      this.keepAlive = a;
      // the page in the background: stop it (the next gesture starts it again)
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') a.pause(); });
    }
  }

  /** Continuous sounds from the aircraft state. */
  update(dt, st, env = {}) {
    this.time += dt;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    st.n1.forEach((n1, i) => {
      const e = this.engines[i];
      const x = Math.max(0, (n1 - 0.2) / 0.8);
      e.rumble.frequency.setTargetAtTime(38 + x * 50 + i * 1.5, t, 0.1);
      e.rf.frequency.setTargetAtTime(120 + x * 260, t, 0.1);
      e.rg.gain.setTargetAtTime(0.04 + x * 0.18 + st.reverser * 0.12, t, 0.1);
      e.whine.frequency.setTargetAtTime(500 + x * 2600, t, 0.15);
      e.wg.gain.setTargetAtTime(0.004 + x * 0.03, t, 0.15);
      e.core.g.gain.setTargetAtTime(0.02 + x * x * 0.22 + st.reverser * 0.15, t, 0.1);
      e.core.f.frequency.setTargetAtTime(700 + x * 1800, t, 0.1);
    });
    const spd = Math.min(1, st.tasKts / 250);
    this.wind.g.gain.setTargetAtTime(0.02 + spd * spd * 0.35 + st.speedbrake * 0.08 + (st.gearDown ? 0.03 : 0) * spd, t, 0.2);
    this.wind.f.frequency.setTargetAtTime(300 + spd * 900, t, 0.2);
    this.rain.g.gain.setTargetAtTime((env.rain || 0) * 0.12, t, 0.5);
    const gs = Math.min(1, st.groundSpeed / 70);
    this.roll.g.gain.setTargetAtTime(st.onGround ? 0.05 + gs * (st.surface === 'grass' ? 0.9 : 0.35) : 0, t, 0.1);
    this.roll.f.frequency.setTargetAtTime(st.surface === 'grass' ? 120 : 60 + gs * 40, t, 0.1);
    this.skid.g.gain.setTargetAtTime(st.skidding && st.groundSpeed > 5 ? 0.25 : 0, t, 0.05);
    // stick shaker
    if (st.stallWarning && !this.stickShaker) this.startStickShaker();
    if (!st.stallWarning && this.stickShaker) this.stopStickShaker();
    // speech queue
    this.pumpSpeech();
  }

  /** The stall warning: the shaker motor's 22 Hz buzz (headphones) and the column's rattle, noise gated by the motor (phone speakers). */
  startStickShaker() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = 22;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 11;
    const lg = ctx.createGain(); lg.gain.value = 0.25; lfo.connect(lg);
    const g = ctx.createGain(); g.gain.value = 0.25; lg.connect(g.gain);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
    osc.connect(f); f.connect(g); g.connect(this.master);
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 1500; bf.Q.value = 0.8;
    const rg = ctx.createGain(); rg.gain.value = 1.2;                 // 0 or 2.4 as the motor turns
    const mg = ctx.createGain(); mg.gain.value = 1.2; osc.connect(mg); mg.connect(rg.gain);
    src.connect(bf); bf.connect(rg); rg.connect(g);
    osc.start(); lfo.start(); src.start();
    this.stickShaker = { osc, lfo, src };
    this.log.push({ t: this.time, kind: 'sound', text: 'stick shaker' });
  }
  stopStickShaker() { if (this.stickShaker) { for (const n of ['osc', 'lfo', 'src']) this.stickShaker[n].stop(); this.stickShaker = null; } }

  setConfigHorn(on) {
    if (!this.ctx) return;
    if (on && !this.hornOsc) {
      const ctx = this.ctx; const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = 480;
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 3; const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg);
      const g = ctx.createGain(); g.gain.value = 0.12; lg.connect(g.gain); osc.connect(g); g.connect(this.master); osc.start(); lfo.start();
      this.hornOsc = { osc, lfo };
      this.log.push({ t: this.time, kind: 'sound', text: 'config horn' });
    } else if (!on && this.hornOsc) { this.hornOsc.osc.stop(); this.hornOsc.lfo.stop(); this.hornOsc = null; }
  }

  // ---- one-shots -----------------------------------------------------------
  tone(freq, dur, type = 'sine', gain = 0.2, when = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  burst(dur, gain, freq = 200, type = 'lowpass') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + dur + 0.05);
  }
  /** A band of noise from `t0` (s from now): instant attack, exponential decay; the band can sweep to `to` Hz. */
  noise(t0, dur, freq, gain, { type = 'bandpass', q = 1, to = null } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + t0;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }
  /** A struck metal part: inharmonic partials ringing down. */
  clank(t0, gain, base = 480) {
    for (const [ratio, g, d] of [[1, 1, 0.5], [2.41, 0.6, 0.35], [3.93, 0.45, 0.25], [5.4, 0.3, 0.18]]) this.tone(base * ratio, d, 'sine', gain * g, t0);
  }
  /**
   * A thump: a falling low sine through soft clipping. Headphones get the low end; the clipping's
   * harmonics carry it on a phone speaker, which plays almost nothing below ~400 Hz.
   */
  thump(t0, gain, freq = 60, dur = 0.4) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + t0;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.6, t); o.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
    if (!this.driveCurve) { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * 4) / Math.tanh(4); } this.driveCurve = c; }
    const sh = ctx.createWaveShaper(); sh.curve = this.driveCurve;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(sh); sh.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  play(name) {
    this.log.push({ t: this.time, kind: 'sound', text: name });
    const r = Math.random;
    switch (name) {
      case 'touchdown':      // tyre chirps (left and right mains), the thump, a rumble
        this.noise(0, 0.16, 2600, 1.3, { q: 2, to: 1500 }); this.noise(0.035, 0.13, 2300, 0.95, { q: 2, to: 1300 });
        this.thump(0, 0.7, 60, 0.35); this.noise(0, 0.5, 350, 0.6, { type: 'lowpass' });
        break;
      case 'hardlanding':    // louder, longer chirps, a heavy thump, the gear's crunch and a clank
        this.noise(0, 0.25, 2600, 1.6, { q: 1.6, to: 1200 }); this.noise(0.03, 0.2, 2200, 1.1, { q: 1.6, to: 1100 });
        this.thump(0, 1.0, 48, 0.6); this.noise(0.01, 0.35, 1200, 1.1, { q: 0.7 }); this.clank(0.02, 0.22, 430);
        this.noise(0, 0.9, 300, 0.9, { type: 'lowpass' });
        break;
      case 'crash':          // impact, crunching, clanks, a long metal scrape and the rumble
        this.noise(0, 0.9, 1400, 3.0, { q: 0.6 }); this.thump(0, 1.5, 42, 1.2);
        for (let i = 0; i < 9; i++) this.noise(0.05 + i * 0.12 + r() * 0.05, 0.12, 700 + r() * 1800, 1.2, { q: 1.5 });
        this.clank(0.1, 0.3, 380); this.clank(0.45, 0.22, 610); this.clank(0.95, 0.16, 520);
        this.noise(0.3, 2.0, 2400, 0.9, { q: 4, to: 700 });
        this.noise(0, 2.5, 300, 1.2, { type: 'lowpass' });
        break;
      case 'gear': this.burst(1.6, 0.3, 900, 'bandpass'); this.tone(90, 1.4, 'triangle', 0.05); this.tone(460, 1.2, 'triangle', 0.03); break;
      case 'flaps': this.tone(140, 1.0, 'triangle', 0.05); this.tone(420, 1.0, 'triangle', 0.05); break;
      case 'click': this.tone(1800, 0.04, 'square', 0.05); break;
      case 'caution': this.tone(660, 0.18, 'square', 0.6); this.tone(660, 0.18, 'square', 0.6, 0.25); break;
      case 'chime': this.tone(880, 0.3, 'sine', 0.15); this.tone(1320, 0.4, 'sine', 0.12, 0.15); break;
      case 'apdisc': for (let i = 0; i < 4; i++) this.tone(520, 0.15, 'square', 0.5, i * 0.22); break;
      case 'whoop': this.whoop(); break;
      case 'thunder': this.noise(0, 0.25, 1800, 0.6, { q: 0.5 }); this.noise(0.05, 3.0, 250, 0.9, { type: 'lowpass' }); this.noise(0.1, 2.5, 600, 0.5, { q: 0.6 }); break;
      case 'overspeed': for (let i = 0; i < 8; i++) this.tone(1200, 0.05, 'square', 0.6, i * 0.1); break;
      case 'altalert': this.tone(1000, 0.5, 'sine', 0.12); break;
      default: break;
    }
  }
  whoop() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (let k = 0; k < 2; k++) {
      const t = ctx.currentTime + k * 0.45;
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(400, t); o.frequency.exponentialRampToValueAtTime(1000, t + 0.35);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.setValueAtTime(0.18, t + 0.32); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.45);
    }
  }

  // ---- voice ---------------------------------------------------------------
  /**
   * @param text callout
   * @param opts { priority: 0..3, minGap: seconds before the same text may repeat, key }
   */
  say(text, opts = {}) {
    const key = opts.key || text;
    const gap = opts.minGap === undefined ? 1.5 : opts.minGap;
    const last = this.lastSaid.get(key);
    if (last !== undefined && this.time - last < gap) return false;
    this.lastSaid.set(key, this.time);
    const entry = { t: this.time, kind: 'voice', text };
    this.log.push(entry);
    const pr = opts.priority || 0;
    // higher priority flushes lower priority queue entries
    this.speechQueue = this.speechQueue.filter((q) => q.priority >= pr);
    this.speechQueue.push({ text, priority: pr, t: this.time, entry });
    if (pr >= 2 && this.speaking && this.speakingPriority < pr) this.stopSpeaking();
    this.pumpSpeech();
    return true;
  }

  /** Cut off the phrase being spoken (a more urgent one is waiting). */
  stopSpeaking() {
    if (this.clipSource) { try { this.clipSource.onended = null; this.clipSource.stop(); } catch (e) { /* ended */ } this.clipSource = null; }
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    this.speaking = false;
  }

  pumpSpeech() {
    if (this.speaking || !this.speechQueue.length) return;
    const item = this.speechQueue.shift();
    if (this.time - item.t > 4) return this.pumpSpeech();   // stale
    if (!this.enabled) return;
    const done = () => { this.speaking = false; this.clipSource = null; this.pumpSpeech(); };
    const clip = this.ctx && this.clips.get(item.text);
    if (clip) {
      // the recorded voice, through Web Audio like every other sound
      const src = this.ctx.createBufferSource(); src.buffer = clip;
      src.connect(this.master); src.onended = done; src.start();
      this.speaking = true; this.speakingPriority = item.priority; this.clipSource = src;
      item.entry.via = 'clip';
      return;
    }
    this.fallbacks.push(item.text);
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (synth && typeof SpeechSynthesisUtterance !== 'undefined') {
      const u = new SpeechSynthesisUtterance(item.text);
      if (this.voice) u.voice = this.voice;
      u.rate = 1.15; u.pitch = 0.85; u.volume = 1;
      this.speaking = true; this.speakingPriority = item.priority;
      u.onend = done; u.onerror = done;
      // safety: if the engine never fires onend (headless browsers), release after a timeout
      setTimeout(() => { if (this.speaking && this.speakingUtter === u) done(); }, 1200 + item.text.length * 70);
      this.speakingUtter = u;
      item.entry.via = 'speech';
      try { synth.speak(u); } catch (e) { done(); }
    } else {
      // fallback: attention tone
      item.entry.via = 'tone';
      this.tone(item.priority >= 2 ? 900 : 700, 0.12, 'square', 0.1);
    }
  }
}
