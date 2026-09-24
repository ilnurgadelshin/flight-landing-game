// Phone and tablet support around the game: which control scheme to show, landscape
// handling, full screen, pausing when the player leaves, keeping the screen awake and
// adapting the rendering resolution to the device.
//
// Browser limits this works within (MDN compatibility data, 2026):
//  - iPhone Safari has no element full screen and no orientation lock, so portrait gets a
//    "rotate your phone" screen and players are told Add to Home Screen gives full screen.
//  - Android Chrome can go full screen and lock landscape from a tap.
//  - Screen Wake Lock works on Android and iOS 18.4+; elsewhere the request just fails. Safari
//    grants it only to a request made during a user gesture, and from then on to any request
//    from the page: its first request must come from a tap, or a game controller's first press
//    (Safari's gamepadconnected event counts as a gesture).
import { setScheme, getScheme } from './controls.js';

const params = new URLSearchParams(location.search);
const mm = (q) => (window.matchMedia ? window.matchMedia(q).matches : false);

export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const coarse = mm('(pointer: coarse)') && (navigator.maxTouchPoints || 0) > 0;
/** A touch-first device (phone or tablet). */
export const touchFirst = params.has('touch') ? params.get('touch') !== '0' : coarse;
/** A phone-sized touch device: lighter scene detail. */
export const phone = touchFirst && Math.min(screen.width, screen.height) <= 600;

export function isStandalone() {
  return navigator.standalone === true || mm('(display-mode: standalone)') || mm('(display-mode: fullscreen)');
}

export class Platform {
  constructor({ game, input, world }) {
    this.game = game; this.input = input; this.world = world;
    this.forced = params.has('touch');
    this.wakeLock = null;
    this.wantLock = false;
    this.padConnected = false;
    this.rotateEl = document.getElementById('rotate');
    // the scheme follows the pointer the player actually uses (hybrid laptops, iPads with a mouse)
    this.applyScheme(touchFirst ? 'touch' : 'desktop');
    window.addEventListener('pointerdown', (e) => {
      if (this.forced) return;
      if (e.pointerType === 'touch' || e.pointerType === 'pen') this.applyScheme('touch');
      else if (e.pointerType === 'mouse') this.applyScheme('desktop');
    }, true);
    document.body.classList.toggle('ios', isIOS);
    document.body.classList.toggle('standalone', isStandalone());
    // controls scale with the screen (phones are ~390 px tall in landscape); the floor keeps the
    // buttons at least ~40 px tall on the smallest phones, where the layout still fits (640×360)
    const fit = () => {
      const k = Math.max(0.9, Math.min(1.2, Math.min(window.innerHeight / 390, window.innerWidth / 720)));
      document.documentElement.style.setProperty('--k', k.toFixed(3));
      this.checkOrientation();
    };
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', () => setTimeout(fit, 50));
    fit();
    // leaving the game (app switch, call, lock screen) pauses the flight
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { if (this.game.state === 'flying') this.game.togglePause(); }
      else this.keepAwake();                                             // the lock is dropped while hidden
    });
  }

  applyScheme(s) {
    if (s === getScheme() && document.body.classList.contains(s)) return;
    setScheme(s);
    document.body.classList.toggle('touch', s === 'touch');
    document.body.classList.toggle('desktop', s !== 'touch');
    this.input.setTouchMode(s === 'touch');
    this.checkOrientation();
  }

  /** Portrait on a touch device: ask for landscape and pause the flight. */
  checkOrientation() {
    const portrait = getScheme() === 'touch' && window.innerHeight > window.innerWidth;
    if (this.rotateEl) this.rotateEl.classList.toggle('hidden', !portrait);
    if (portrait && this.game && this.game.state === 'flying') this.game.togglePause();
  }

  /** Called from the tap that starts a flight: full screen and landscape where the browser allows it. */
  enterFullscreen() {
    if (getScheme() !== 'touch' || isIOS || navigator.webdriver || isStandalone()) return;
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen({ navigationUI: 'hide' })
      .then(() => (screen.orientation && screen.orientation.lock ? screen.orientation.lock('landscape') : null))
      .catch(() => {});
  }

  /**
   * Keep the screen on while flying (a tilt, controller or hands-off approach has no touches to
   * keep it awake), and while a game controller is connected: its player may never touch the screen.
   */
  keepAwake() { this.setWakeLock(document.visibilityState === 'visible' && (this.game.state === 'flying' || this.padConnected)); }

  async setWakeLock(on) {
    this.wantLock = on;
    try {
      if (on && !this.wakeLock && navigator.wakeLock) {
        // requested at once (not after a pending one): the request made inside a gesture is the one Safari grants
        const lock = await navigator.wakeLock.request('screen');
        if (this.wakeLock || !this.wantLock) { lock.release(); return; }   // another request won, or no longer wanted
        this.wakeLock = lock;
        lock.addEventListener('release', () => { if (this.wakeLock === lock) this.wakeLock = null; });
      } else if (!on && this.wakeLock) {
        const lock = this.wakeLock; this.wakeLock = null; await lock.release();
      }
    } catch (e) { /* not supported or not allowed: the screen may dim, nothing else changes */ }
  }

  /** A game controller connected or disconnected. Called from Safari's gamepadconnected gesture too. */
  setController(connected) { this.padConnected = connected; this.keepAwake(); }

  onGameState() { this.keepAwake(); }
}

/**
 * Dynamic resolution for phones and tablets: lowers the render resolution when frames get
 * slow (GPUs throttle after a few minutes of sustained load) and slowly recovers, never
 * returning to a level that was too slow.
 */
export class ResolutionScaler {
  constructor(world, { enabled, start }) {
    this.world = world; this.enabled = enabled;
    this.ratio = start; this.ceiling = start; this.min = Math.min(start, 0.7);
    this.acc = 0; this.n = 0; this.good = 0; this.windows = 0;
  }
  frame(dtMs, active) {
    if (!this.enabled || !active || dtMs > 250) return;   // ignore menus, pauses and hitches
    this.acc += dtMs; this.n++;
    if (this.acc < 2000) return;
    const avg = this.acc / this.n; this.acc = 0; this.n = 0;
    if (++this.windows < 2) return;                         // the first seconds compile shaders
    if (avg > 25 && this.ratio > this.min) {                // below ~40 fps: step down
      this.ceiling = Math.min(this.ceiling, this.ratio * 0.95);
      this.set(Math.max(this.min, this.ratio * 0.85)); this.good = 0;
    } else if (avg < 18 && this.ratio < this.ceiling) {     // a solid 55+ fps for 10 s: step back up
      if (++this.good >= 5) { this.set(Math.min(this.ceiling, this.ratio * 1.1)); this.good = 0; }
    } else this.good = 0;
  }
  set(r) { this.ratio = r; this.world.setPixelRatio(r); }
}
