// Web Audio: synthesised engines, wind, rain, rolling, one-shot effects and
// voice callouts (speechSynthesis with a tone fallback). Everything is
// generated procedurally — no audio files needed.
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

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.enabled ? 0.8 : 0; this.master.connect(ctx.destination);
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
    if (window.speechSynthesis) {
      const pick = () => {
        const vs = window.speechSynthesis.getVoices();
        this.voice = vs.find((v) => /en[-_]US/i.test(v.lang) && /male|david|mark|daniel/i.test(v.name)) || vs.find((v) => /^en/i.test(v.lang)) || vs[0] || null;
      };
      pick(); window.speechSynthesis.onvoiceschanged = pick;
    }
  }

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

  startStickShaker() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = 22;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 11;
    const lg = ctx.createGain(); lg.gain.value = 0.25; lfo.connect(lg);
    const g = ctx.createGain(); g.gain.value = 0.25; lg.connect(g.gain);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
    osc.connect(f); f.connect(g); g.connect(this.master); osc.start(); lfo.start();
    this.stickShaker = { osc, lfo };
    this.log.push({ t: this.time, kind: 'sound', text: 'stick shaker' });
  }
  stopStickShaker() { if (this.stickShaker) { this.stickShaker.osc.stop(); this.stickShaker.lfo.stop(); this.stickShaker = null; } }

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
  play(name) {
    this.log.push({ t: this.time, kind: 'sound', text: name });
    switch (name) {
      case 'touchdown': this.burst(0.5, 0.9, 180); this.tone(60, 0.4, 'sine', 0.5); break;
      case 'hardlanding': this.burst(0.9, 1.4, 250); this.tone(45, 0.7, 'sine', 0.8); break;
      case 'crash': this.burst(2.5, 2.0, 400); this.tone(35, 1.5, 'sawtooth', 0.6); this.burst(1.5, 1.2, 1200, 'bandpass'); break;
      case 'gear': this.burst(1.6, 0.12, 900, 'bandpass'); this.tone(90, 1.4, 'triangle', 0.05); break;
      case 'flaps': this.tone(140, 1.0, 'triangle', 0.05); break;
      case 'click': this.tone(1800, 0.04, 'square', 0.05); break;
      case 'caution': this.tone(660, 0.18, 'square', 0.15); this.tone(660, 0.18, 'square', 0.15, 0.25); break;
      case 'chime': this.tone(880, 0.3, 'sine', 0.15); this.tone(1320, 0.4, 'sine', 0.12, 0.15); break;
      case 'apdisc': for (let i = 0; i < 4; i++) this.tone(520, 0.15, 'square', 0.12, i * 0.22); break;
      case 'whoop': this.whoop(); break;
      case 'thunder': this.burst(3.0, 0.8, 120); break;
      case 'overspeed': for (let i = 0; i < 8; i++) this.tone(1200, 0.05, 'square', 0.1, i * 0.1); break;
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
    this.log.push({ t: this.time, kind: 'voice', text });
    const pr = opts.priority || 0;
    // higher priority flushes lower priority queue entries
    this.speechQueue = this.speechQueue.filter((q) => q.priority >= pr);
    this.speechQueue.push({ text, priority: pr, t: this.time });
    if (pr >= 2 && this.speaking && window.speechSynthesis && this.speakingPriority < pr) { window.speechSynthesis.cancel(); this.speaking = false; }
    this.pumpSpeech();
    return true;
  }

  pumpSpeech() {
    if (this.speaking || !this.speechQueue.length) return;
    const item = this.speechQueue.shift();
    if (this.time - item.t > 4) return this.pumpSpeech();   // stale
    if (!this.enabled) return;
    const synth = window.speechSynthesis;
    if (synth && typeof SpeechSynthesisUtterance !== 'undefined') {
      const u = new SpeechSynthesisUtterance(item.text);
      if (this.voice) u.voice = this.voice;
      u.rate = 1.15; u.pitch = 0.85; u.volume = 1;
      this.speaking = true; this.speakingPriority = item.priority;
      const done = () => { this.speaking = false; this.pumpSpeech(); };
      u.onend = done; u.onerror = done;
      // safety: if the engine never fires onend (headless browsers), release after a timeout
      setTimeout(() => { if (this.speaking && this.speakingUtter === u) done(); }, 1200 + item.text.length * 70);
      this.speakingUtter = u;
      try { synth.speak(u); } catch (e) { done(); }
    } else {
      // fallback: attention tone
      this.tone(item.priority >= 2 ? 900 : 700, 0.12, 'square', 0.1);
    }
  }
}
