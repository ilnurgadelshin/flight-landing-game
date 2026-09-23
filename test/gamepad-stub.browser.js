// A simulated game controller for the browser tests. Browsers cannot emulate one, so
// navigator.getGamepads() is replaced to return this standard-layout controller; the tests (or the
// human-like pilot) press its buttons and move its sticks. Rumble effects are recorded in __rumble.
//   fakePad.connect({ id, mapping, rumble }) / .disconnect()
//   fakePad.press(name) / .release(name) / .set(name, value 0..1) / .stick('left' | 'right', x, y)
//   fakePad.tap(name, holdMs)  -> Promise: pressed until the game has read it (2 frames; a hold, 4 frames and holdMs)
(function () {
  const NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', 'Up', 'Down', 'Left', 'Right', 'Home'];
  const pad = { id: '', index: 0, connected: false, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: NAMES.map(() => ({ pressed: false, touched: false, value: 0 })), vibrationActuator: null };
  window.__rumble = [];
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => (pad.connected ? [pad, null, null, null] : [null, null, null, null]) });
  const frames = () => (window.__sim ? window.__sim.stats.frames : 0);
  window.fakePad = {
    connect({ id = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', mapping = 'standard', rumble = true } = {}) {
      pad.id = id; pad.mapping = mapping; pad.connected = true;
      pad.vibrationActuator = rumble ? { type: 'dual-rumble', playEffect: (type, p) => { window.__rumble.push(Object.assign({ type }, p)); return Promise.resolve('complete'); } } : null;
      window.dispatchEvent(new Event('gamepadconnected'));
    },
    disconnect() { pad.connected = false; window.dispatchEvent(new Event('gamepaddisconnected')); },
    set(name, value) { const b = pad.buttons[NAMES.indexOf(name)]; b.value = value; b.pressed = value > 0.5; b.touched = value > 0; pad.timestamp = performance.now(); },
    press(name) { this.set(name, 1); },
    release(name) { this.set(name, 0); },
    stick(which, x, y) { const i = which === 'right' ? 2 : 0; pad.axes[i] = x; pad.axes[i + 1] = y; pad.timestamp = performance.now(); },
    releaseAll() { for (const n of NAMES) this.set(n, 0); pad.axes = [0, 0, 0, 0]; },
    tap(name, holdMs = 0) {
      this.press(name);
      // a hold also spans at least 4 frames: at software-rendering frame rates two frames can outlast
      // the hold time, and the game only treats a press as held after several reads
      const f0 = frames(), t0 = performance.now(), minFrames = holdMs > 0 ? 4 : 2;
      return new Promise((res) => { const chk = () => { if (frames() - f0 >= minFrames && performance.now() - t0 >= holdMs) { this.release(name); const f1 = frames(); const after = () => (frames() - f1 >= 2 ? res() : requestAnimationFrame(after)); after(); } else requestAnimationFrame(chk); }; chk(); });
    },
    get pad() { return pad; },
  };
})();
