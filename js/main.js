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

const params = new URLSearchParams(location.search);
// phones get the lighter scene; their resolution then adapts to the frame rate (see ResolutionScaler)
const lowDetail = params.has('lowdetail') || phone;

async function boot() {
  const ui = new UI();
  ui.hideLoading('Building the world…');
  await new Promise((r) => setTimeout(r, 30));
  const canvas = document.getElementById('gl');
  const world = new World(canvas, { lowDetail, pixelRatio: touchFirst ? Math.min(window.devicePixelRatio || 1, 1.5) : undefined });
  ui.hideLoading('Building the flight deck…');
  await new Promise((r) => setTimeout(r, 10));
  const cockpit = new Cockpit(world.camera);
  const input = new InputManager(canvas);
  const audio = new AudioSystem();
  const gpws = new GPWS(audio);
  const touch = new TouchControls(input, document.getElementById('hud'));
  const game = new Game({ world, cockpit, input, audio, gpws, ui, touch });
  const platform = new Platform({ game, input, world });
  game.onStateChange = (s) => platform.onGameState(s);
  const scaler = new ResolutionScaler(world, { enabled: params.has('drs') ? params.get('drs') !== '0' : touchFirst, start: world.pixelRatio });
  world.applyScenario(SCENARIOS.clear, false);
  ui.hideLoading();
  ui.showMenu();

  // audio can only start after a user gesture; iOS counts a tap only when it ends (not pointerdown)
  const armAudio = () => { audio.init(); audio.resume(); };
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, armAudio);

  // starting a flight is a tap: on Android that is the moment full screen and landscape can be requested
  ui.onStart = (opts) => { armAudio(); platform.enterFullscreen(); game.start(opts); };
  ui.onDemo = (opts) => { armAudio(); platform.enterFullscreen(); game.start(Object.assign({}, opts, { demo: true })); };
  ui.onResume = () => game.togglePause();
  ui.onQuit = () => game.quitToMenu();
  ui.onAgain = () => { platform.enterFullscreen(); game.start(Object.assign({}, game.opts, { skipSchool: true, demo: false })); };
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
    game, world, cockpit, inputManager: input, audio, gpws, ui, stats, touch, platform, scaler,
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
