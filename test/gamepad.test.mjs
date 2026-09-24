// Game controller support in Node, no browser: the controller module (js/gamepad.js) against a
// fake navigator.getGamepads(), InputManager's controller thrust, reverse and hold-off, and
// controllers as Safari on iPhone reports them.
//   node test/gamepad.test.mjs
import { GamepadInput, labelsFor, radial, BUTTONS, PAD } from '../js/gamepad.js';

let passed = 0, failed = 0;
const check = (name, cond, detail = '') => { if (cond) { passed++; console.log(`  ✔ ${name}${detail ? '  (' + detail + ')' : ''}`); } else { failed++; console.log(`  ✘ ${name}${detail ? '  (' + detail + ')' : ''}`); } };

// ---- a fake controller and the parts of InputManager the module talks to
function rig({ mapping = 'standard', id = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', rumble = true } = {}) {
  const pad = { id, index: 0, connected: true, mapping, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), vibrationActuator: null };
  const effects = [];
  if (rumble) pad.vibrationActuator = { playEffect: (t, p) => { effects.push(p); return Promise.resolve('complete'); } };
  const nav = { list: [pad], getGamepads() { return this.list; } };
  const actions = [];
  const input = { pad: { active: false }, look: { down: false }, emit: (n, a) => actions.push(a !== undefined ? `${n}:${a}` : n) };
  const g = new GamepadInput(input, nav);
  const changes = [];
  g.onChange = (c) => changes.push(Object.assign({}, c));
  let t = 0;
  const poll = (dt = 0.016) => { t += dt; g.poll(t); };
  const set = (name, v) => { const b = pad.buttons[BUTTONS[name]]; b.value = v; b.pressed = v > 0.5; };
  return { pad, nav, input, g, actions, changes, effects, poll, set };
}

console.log('\n[G1] Controller families and dead zones');
check('Xbox, PlayStation and Switch controllers get their own button names', labelsFor('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)').A === 'A' && labelsFor('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)').A === '✕' && labelsFor('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)').A === 'B' && labelsFor('some pad').A === 'A');
{
  const [a, b] = radial(0.1, 0), [c, d] = radial(0, -1), [e, f] = radial(0.6, 0.6);
  check('stick dead zone: a worn stick\'s drift reads zero; full travel reads full', a === 0 && b === 0 && c === 0 && Math.abs(d + 1) < 1e-9, `drift 0.1 → ${a}, full → ${d}`);
  check('the dead zone keeps the stick\'s direction', Math.abs(e - f) < 1e-12 && e > 0.5, `${e.toFixed(3)}, ${f.toFixed(3)}`);
}

console.log('\n[G2] Standard controller: sticks, triggers, buttons');
{
  const R = rig();
  R.poll();
  check('a connected controller is announced, but not in use until it is used', R.g.connected && !R.g.active && R.changes.length === 1 && R.changes[0].connected && R.changes[0].labels.name === 'Xbox');
  R.pad.axes[1] = -0.2; R.poll();
  check('a small stick movement does not take over from the keyboard or mouse', !R.g.active);
  R.pad.axes[1] = -0.9; R.pad.axes[0] = 0.5; R.poll();
  check('a real stick movement makes the controller the device in use', R.g.active && R.input.pad.active);
  check('stick up = +pitch, right = +roll (before the pitch-style option)', R.input.pad.pitch > 0.8 && R.input.pad.roll > 0.3, `pitch ${R.input.pad.pitch.toFixed(2)}, roll ${R.input.pad.roll.toFixed(2)}`);
  R.pad.axes[0] = 0; R.pad.axes[1] = 0;
  R.set('RT', 0.8); R.set('LT', 0.2); R.poll();
  check('rudder = right trigger − left trigger, analog', Math.abs(R.input.pad.yaw - ((0.8 - 0.05) / 0.95 - (0.2 - 0.05) / 0.95)) < 1e-9, R.input.pad.yaw.toFixed(3));
  R.set('RT', 0); R.set('LT', 0);
  R.set('A', 1); R.poll();
  check('A held = thrust up', R.input.pad.thrust === 1);
  R.set('A', 0); R.set('B', 1); R.set('X', 1); R.set('Down', 1); R.poll();
  check('B = thrust down, X = brakes, D-pad ↓ = trim nose up', R.input.pad.thrust === -1 && R.input.pad.brake && R.input.pad.trim === 1);
  for (const n of ['B', 'X', 'Down']) R.set(n, 0);
  R.poll(); R.actions.length = 0;
  R.set('Y', 1); R.poll(); R.poll(); R.poll(); R.set('Y', 0); R.poll();
  check('Y = gear, once per press', R.actions.filter((a) => a === 'gear').length === 1, R.actions.join(', '));
  R.actions.length = 0;
  for (const n of ['LB', 'RB', 'Left', 'View', 'Menu']) { R.set(n, 1); R.poll(); R.set(n, 0); R.poll(); }
  check('LB / RB = flaps up / down, D-pad ← = autobrake, View = TO/GA or back on final, Menu = pause / start', ['flapsUp', 'flapsDown', 'autobrake', 'togaOrReposition', 'padButton:Menu'].every((a) => R.actions.includes(a)), R.actions.join(', '));
  R.actions.length = 0;
  R.set('Right', 1); R.poll(0.016); R.poll(0.2); R.set('Right', 0); R.poll();
  check('D-pad → tapped = speedbrakes armed', R.actions.includes('armSpeedbrake') && !R.actions.includes('speedbrake'), R.actions.join(', '));
  R.actions.length = 0;
  R.set('Right', 1); for (let i = 0; i < 50; i++) R.poll(0.016); R.set('Right', 0); R.poll();
  check(`D-pad → held ${PAD.speedbrakeHold} s = speedbrakes extended, and no arm on release`, R.actions.filter((a) => a === 'speedbrake').length === 1 && !R.actions.includes('armSpeedbrake'), R.actions.join(', '));
  R.actions.length = 0;
  R.set('Right', 1); R.poll(0.016); R.poll(0.9); R.set('Right', 0); R.poll();
  check('a quick tap that spans a slow frame still arms (fewer than 3 reads)', R.actions.includes('armSpeedbrake') && !R.actions.includes('speedbrake'), R.actions.join(', '));
  R.set('R3', 1); R.poll(); R.set('R3', 0); R.poll();
  check('pressing the right stick toggles the panel view', R.input.look.down === true);
  R.pad.axes[2] = -0.8; R.poll();
  check('right stick = look around', R.input.pad.lookX < -0.6);
  R.pad.axes[2] = 0;
  R.g.otherDeviceUsed();
  check('a key, the mouse or a touch hands control back', !R.g.active && !R.input.pad.active && R.changes[R.changes.length - 1].active === false);
  R.g.rumble(100, 1, 1);
  check('no rumble while the controller is not in use', R.effects.length === 0);
  R.set('A', 1); R.poll(); R.set('A', 0); R.poll();
  R.g.rumble(120, 0.5, 0.2);
  check('rumble while in use (dual-rumble with duration and magnitudes)', R.effects.length === 1 && R.effects[0].duration === 120 && R.effects[0].strongMagnitude === 0.5, JSON.stringify(R.effects[0]));
  R.nav.list = [null]; R.poll();
  check('unplugged: announced, and the controls it held are let go', !R.g.connected && !R.input.pad.active && R.input.pad.thrust === 0 && R.changes[R.changes.length - 1].connected === false);
}

console.log('\n[G3] Other controllers (joysticks with their own layout)');
{
  const R = rig({ mapping: '', id: 'Logitech Extreme 3D pro (Vendor: 046d Product: c215)', rumble: false });
  R.pad.axes[0] = -0.7; R.pad.axes[1] = 0.6; R.pad.axes[2] = 0.9; R.poll();
  check('the first two axes fly roll and pitch', R.g.active && R.input.pad.roll < -0.5 && R.input.pad.pitch < -0.4, `roll ${R.input.pad.roll.toFixed(2)}, pitch ${R.input.pad.pitch.toFixed(2)}`);
  R.actions.length = 0;
  R.set('Y', 1); R.poll();
  check('its buttons are not given flight actions', !R.actions.includes('gear') && R.actions.includes('padButton:Y') && R.input.pad.yaw === undefined, R.actions.join(', '));
}

console.log('\n[G4] InputManager: controller thrust, reverse and hold-off');
{
  // just enough of a browser for InputManager's constructor
  globalThis.window = { addEventListener() {} };
  const { InputManager } = await import('../js/input.js');
  const canvas = { addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }) };
  const im = new InputManager(canvas);
  const events = [];
  im.onAction((n, a) => events.push(`${n}:${a}`));
  im.enabled = true;
  const inp = { pitch: 0, roll: 0, yaw: 0, throttle: 0.5, brake: 0, reverse: false, trim: 0 };
  const air = { onGround: false }, ground = { onGround: true };
  const P = im.pad;
  im.resetTouch();
  P.active = true; P.thrust = 1;
  for (let i = 0; i < 10; i++) im.update(0.1, inp, air);
  check('a button still held when the flight starts is ignored until released', Math.abs(inp.throttle - 0.5) < 1e-9, inp.throttle.toFixed(3));
  P.thrust = 0; im.update(0.1, inp, air);
  P.thrust = 1; for (let i = 0; i < 10; i++) im.update(0.1, inp, air);
  check('then A held raises thrust at the keyboard\'s rate (0.35 per second)', Math.abs(inp.throttle - 0.85) < 1e-6, inp.throttle.toFixed(3));
  P.thrust = -1; for (let i = 0; i < 40; i++) im.update(0.1, inp, air);
  check('B held brings it to idle; in the air, holding B at idle never selects reverse', inp.throttle === 0 && !inp.reverse);
  for (let i = 0; i < 3; i++) im.update(0.1, inp, ground);
  check('on the ground, B kept held at idle for less than 0.4 s: no reverse yet', !inp.reverse);
  for (let i = 0; i < 3; i++) im.update(0.1, inp, ground);
  check('kept held 0.4 s: reverse selected, and it stays when B is let go', inp.reverse && events.includes('reverse:true'));
  P.thrust = 0; im.update(0.1, inp, ground);
  check('(still in reverse)', inp.reverse);
  P.thrust = 1; for (let i = 0; i < 5; i++) im.update(0.1, inp, ground);
  check('A stows the reversers, and that press adds no thrust', !inp.reverse && inp.throttle === 0 && events.includes('reverse:false'), `throttle ${inp.throttle}`);
  P.thrust = 0; im.update(0.1, inp, ground);
  P.thrust = 1; for (let i = 0; i < 2; i++) im.update(0.1, inp, ground);
  check('a new press of A adds thrust again', inp.throttle > 0.05, inp.throttle.toFixed(3));
  P.thrust = 0;
  P.pitch = 1; P.roll = -1; P.yaw = 0.5; im.update(0.1, inp, air);
  check('stick and triggers drive pitch, roll and rudder', inp.pitch === 1 && inp.roll === -1 && inp.yaw === 0.5);
  im.opts.invertPitch = true; im.update(0.1, inp, air);
  check('the pilot-style option reverses the controller\'s pitch (push forward = nose down)', inp.pitch === -1);
  im.opts.invertPitch = false;
  P.active = false; P.pitch = 0.8; im.update(0.1, inp, air); im.update(0.5, inp, air);
  check('a controller not in use drives nothing', inp.pitch === 0 && inp.roll === 0, `pitch ${inp.pitch}`);
}

console.log('\n[G5] Safari on iPhone and iPad (controllers as WebKit reports them)');
{
  // WebKit names a controller "<its name> Extended Gamepad" (no vendor number), maps it to the
  // standard layout with the PS / Home button as button 16, and has no rumble on iOS
  const ids = { 'DualSense Wireless Controller Extended Gamepad': '✕', 'DUALSHOCK 4 Wireless Controller Extended Gamepad': '✕', 'Xbox Wireless Controller Extended Gamepad': 'A', 'Pro Controller Extended Gamepad': 'B', 'Joy-Con (L/R) Extended Gamepad': 'B', 'Backbone One - PlayStation Edition Extended Gamepad': '✕' };
  const wrong = Object.entries(ids).filter(([id, a]) => labelsFor(id).A !== a);
  check('each family is recognised by the name Safari gives it (PS5, PS4, Xbox, Switch Pro, Joy-Con, Backbone)', !wrong.length, wrong.map(([id]) => id).join(', '));
  const R = rig({ id: 'DualSense Wireless Controller Extended Gamepad', rumble: false });
  R.poll();
  check('a PS5 controller in Safari: standard layout, PlayStation button names, no rumble', R.g.standard && R.g.labels.name === 'PlayStation' && R.g.labels.Menu === 'Options' && R.g.labels.View === 'Create' && !R.g.canRumble);
  R.set('Menu', 1); R.poll(); R.set('Menu', 0); R.poll();
  R.set('View', 1); R.poll(); R.set('View', 0); R.poll();
  check('Options (button 9) is Menu, Create (button 8) is TO/GA', R.actions.includes('padButton:Menu') && R.actions.includes('togaOrReposition'), R.actions.join(', '));
  R.actions.length = 0;
  R.pad.buttons[16].pressed = true; R.pad.buttons[16].value = 1; R.poll(); R.pad.buttons[16].pressed = false; R.pad.buttons[16].value = 0; R.poll();
  check('the PS button (button 16) does nothing in the game', R.actions.every((a) => a === 'padButton:button16'), R.actions.join(', '));
  let threw = false;
  try { R.g.rumble(100, 1, 1); } catch (e) { threw = true; }
  check('rumble without a vibration actuator is skipped quietly', !threw && !R.effects.length);
}

console.log('\n[G6] Tilt steering and a controller together');
{
  const { InputManager } = await import('../js/input.js');
  const im = new InputManager({ addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }) });
  im.touchMode = true;
  Object.assign(im.tilt, { active: true, pitch: 0.6, roll: 0 });
  const tiltAlone = im.grabbing();
  im.pad.active = true;
  check('with a controller in use, the phone tilted in its clip does not take over from the autoland demo', tiltAlone && !im.grabbing());
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
