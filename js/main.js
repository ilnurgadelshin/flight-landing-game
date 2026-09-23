// Bootstrap: build the world, cockpit, input, audio, UI and the game loop.
// Physics runs at a fixed 120 Hz inside Simulation.update(); rendering is
// whatever requestAnimationFrame gives us.
import { World } from './world/scene.js';
import { Cockpit } from './cockpit/cockpit.js';
import { InputManager } from './input.js';
import { AudioSystem } from './audio.js';
import { GPWS } from './gpws.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { Autopilot } from './autopilot.js';
import { SCENARIOS, APPROACH_STARTS } from './config.js';
import { TouchControls } from './touch.js';
import { Platform, ResolutionScaler, touchFirst, phone } from './platform.js';
import { TiltControl, TILT } from './tilt.js';
import { Haptics } from './haptics.js';
import { GamepadInput, PAD } from './gamepad.js';
import { setTilt, getScheme, setPad, controlsHtml } from './controls.js';

const params = new URLSearchParams(location.search);
// phones get the lighter scene; their resolution then adapts to the frame rate (see ResolutionScaler)
const lowDetail = params.has('lowdetail') || phone;
// graphics tier: 'high' (shadows, bloom, MSAA) on computers, 'low' on phones; ?quality= overrides
const quality = ['high', 'low'].includes(params.get('quality')) ? params.get('quality') : undefined;

async function boot() {
  const ui = new UI();
  ui.hideLoading('Building the world…');
  await new Promise((r) => setTimeout(r, 30));
  const canvas = document.getElementById('gl');
  const world = new World(canvas, { lowDetail, quality, pixelRatio: touchFirst ? Math.min(window.devicePixelRatio || 1, 1.5) : undefined });
  ui.hideLoading('Building the flight deck…');
  await new Promise((r) => setTimeout(r, 10));
  const cockpit = new Cockpit(world.camera);
  world.setupCockpit(cockpit.root);
  const input = new InputManager(canvas);
  const audio = new AudioSystem();
  const gpws = new GPWS(audio);
  const haptics = new Haptics();
  const touch = new TouchControls(input, document.getElementById('hud'), haptics);
  const game = new Game({ world, cockpit, input, audio, gpws, ui, touch });
  game.haptics = haptics;
  const platform = new Platform({ game, input, world });
  const tilt = new TiltControl(input);
  touch.onCenter = () => tilt.center();
  const pad = new GamepadInput(input);
  haptics.pad = pad;
  // a flight that starts or resumes takes the way the phone is held as level; anything else stops vibrating
  game.onStateChange = (s) => { platform.onGameState(s); if (s === 'flying') tilt.requestCenter(); else haptics.stop(); };

  // ---- tilt steering and vibration options (remembered on this device)
  const pref = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private browsing: not remembered */ } },
  };
  const optTilt = document.getElementById('opt-tilt'), optVib = document.getElementById('opt-vib'), tiltMsg = document.getElementById('tilt-msg');
  document.body.classList.toggle('can-vibrate', haptics.supported);
  optVib.checked = pref.get('vibration') !== '0';
  haptics.enabled = optVib.checked;
  optVib.addEventListener('change', () => { haptics.enabled = optVib.checked; pref.set('vibration', optVib.checked ? '1' : '0'); haptics.tick(); });
  optTilt.checked = pref.get('tilt') === '1';
  const TILT_MSG = {
    denied: 'Motion access was declined, so the stick stays on. On iPhone, close and reopen the tab to be asked again.',
    nosensor: 'No motion sensor found, so the stick stays on.',
  };
  tilt.onStatus = (st) => {
    const on = st === 'on' || st === 'waiting';
    document.body.classList.toggle('tilt', on);
    setTilt(on);
    if (on) { tiltMsg.textContent = ''; return; }
    if (st === 'denied' || st === 'nosensor') {
      optTilt.checked = false; pref.set('tilt', '0'); tiltMsg.textContent = TILT_MSG[st];
      if (game.state === 'flying') { ui.setModeMessage('TILT UNAVAILABLE — fly with the stick', 'ga'); setTimeout(() => ui.setModeMessage(''), 3000); }
    }
  };
  // tilt is switched on from a tap (the option, or Start): iOS only asks for motion access then
  optTilt.addEventListener('click', () => {
    pref.set('tilt', optTilt.checked ? '1' : '0');
    if (optTilt.checked) tilt.enable(); else tilt.disable();
  });
  const tiltFromTap = () => { if (optTilt.checked && !tilt.enabled && getScheme() === 'touch') tilt.enable(); };

  // ---- game controller: in use from its first press until a key, the mouse or a touch is used
  const padMsg = document.getElementById('pad-msg'), padHint = document.getElementById('pad-hint');
  const PAD_HINT = 'Controller: [[pitch]] to fly · thrust [[thrust]] · rudder [[rudder]] · flaps [[flapsUp]] / [[flapsDown]] · gear [[gear]] · '
    + 'speedbrakes [[armSpeedbrake]] (arm), [[speedbrake]] (extend) · brakes [[brakes]] · autobrake [[autobrake]] · trim D-pad ↑/↓ · TO/GA [[toga]] · look [[look]] · pause [[pause]]';
  let padWas = false;
  pad.onChange = ({ connected, active, labels }) => {
    document.body.classList.toggle('pad', active);
    document.body.classList.toggle('pad-rumble', connected && pad.canRumble);
    setPad(active ? labels : null);
    if (active) padHint.innerHTML = controlsHtml(PAD_HINT);
    if (connected && !padWas) {
      padMsg.innerHTML = `🎮 ${labels.name} controller connected: <span class="gp">${labels.Menu}</span> or <span class="gp">${labels.A}</span> starts, the left stick flies.`;
      if (game.state === 'flying') { ui.setModeMessage('CONTROLLER CONNECTED', ''); setTimeout(() => { if (game.state === 'flying') ui.setModeMessage(''); }, 2500); }
    } else if (!connected && padWas) {
      padMsg.textContent = '';
      if (game.state === 'flying') game.togglePause();          // the controller in hand is gone: stop the flight
      ui.setModeMessage(game.state === 'paused' ? 'CONTROLLER DISCONNECTED — paused' : '', 'ga');
    }
    padWas = connected;
  };
  for (const ev of ['keydown', 'pointerdown']) window.addEventListener(ev, () => pad.otherDeviceUsed(), true);
  const scaler = new ResolutionScaler(world, { enabled: params.has('drs') ? params.get('drs') !== '0' : touchFirst, start: world.pixelRatio });
  world.applyScenario(SCENARIOS.clear, false);
  ui.hideLoading();
  ui.showMenu();

  // audio can only start after a user gesture; iOS counts a tap only when it ends (not pointerdown)
  const armAudio = () => { audio.init(); audio.resume(); };
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, armAudio);

  // starting a flight is a tap: on Android that is the moment full screen and landscape can be requested
  ui.onStart = (opts) => { armAudio(); platform.enterFullscreen(); tiltFromTap(); game.start(opts); };
  ui.onDemo = (opts) => { armAudio(); platform.enterFullscreen(); tiltFromTap(); game.start(Object.assign({}, opts, { demo: true })); };
  ui.onResume = () => game.togglePause();
  ui.onQuit = () => game.quitToMenu();
  ui.onAgain = () => { platform.enterFullscreen(); tiltFromTap(); game.start(Object.assign({}, game.opts, { skipSchool: true, demo: false })); };
  ui.onHelp = () => game.onAction('help');

  // ---- main loop
  let last = performance.now();
  let frames = 0, fpsT = 0, lastDraw = 0;
  // wallTime: frame time seen by the loop; frameTime: the part handed to the game (after the 1 s cap)
  const stats = { fps: 0, frameMs: 0, frames: 0, wallTime: 0, frameTime: 0 };
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    stats.wallTime += dt;
    if (dt > 1.0) dt = 1.0;                 // tab was hidden etc. — never integrate a huge step
    if (game.state === 'flying') stats.frameTime += dt;
    scaler.frame(dt * 1000, game.state === 'flying');
    // touch devices draw a still screen (menu, pause, results) at ~15 fps to spare the battery
    const still = touchFirst && (game.state === 'menu' || game.state === 'paused' || game.state === 'finished');
    const draw = !still || now - lastDraw > 66;
    if (draw) lastDraw = now;
    if (tilt.enabled) tilt.update();       // a sensor that stops reporting lets go of the controls
    pad.poll(now / 1000);
    const t0 = performance.now();
    if (game.state !== 'menu') {
      game.update(dt);
      game.render(dt, draw);
      if (game.state === 'school') ui.updateSchoolHighlight();
    } else if (draw) {
      world.render();
    }
    stats.frameMs = performance.now() - t0;
    stats.frames++;
    frames++; fpsT += dt; if (fpsT >= 1) { stats.fps = frames / fpsT; frames = 0; fpsT = 0; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---- test / automation hooks
  window.__sim = {
    game, world, cockpit, inputManager: input, audio, gpws, ui, stats, touch, platform, scaler, tilt, haptics, pad,
    tiltRange: { pitch: TILT.pitchRange * 180 / Math.PI, roll: TILT.rollRange * 180 / Math.PI },   // degrees for full deflection
    padDeadZone: PAD.stickDeadZone,
    scenarios: Object.keys(SCENARIOS), starts: Object.keys(APPROACH_STARTS),
    start: (opts) => game.start(Object.assign({ mode: 'game', scenarioId: 'clear', startId: 'standard', sound: false }, opts)),
    state: () => game.sim.state,
    input: () => game.sim.aircraft.input,
    setTimeScale: (s) => { game.sim.timeScale = s; },
    autopilot: (opts) => { game.demoAp = new Autopilot(game.sim.aircraft, opts || {}); return game.demoAp; },
    disengage: () => game.disengageDemo(),
    events: () => game.events,
    gpwsEvents: () => gpws.events,
    audioLog: () => audio.log,
    result: () => game.result,
    press: (code) => input.press(code), release: (code) => input.release(code),
    errors: [],
  };
  window.addEventListener('error', (e) => window.__sim.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => window.__sim.errors.push(String(e.reason)));
  window.dispatchEvent(new Event('sim-ready'));
}

boot().catch((err) => { console.error(err); document.getElementById('loading-msg').textContent = 'Failed to start: ' + err.message; });
