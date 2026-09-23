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

const params = new URLSearchParams(location.search);
const lowDetail = params.has('lowdetail');

async function boot() {
  const ui = new UI();
  ui.hideLoading('Building the world…');
  await new Promise((r) => setTimeout(r, 30));
  const canvas = document.getElementById('gl');
  const world = new World(canvas, { lowDetail });
  ui.hideLoading('Building the flight deck…');
  await new Promise((r) => setTimeout(r, 10));
  const cockpit = new Cockpit(world.camera);
  const input = new InputManager(canvas);
  const audio = new AudioSystem();
  const gpws = new GPWS(audio);
  const game = new Game({ world, cockpit, input, audio, gpws, ui });
  world.applyScenario(SCENARIOS.clear, false);
  ui.hideLoading();
  ui.showMenu();

  // audio can only start after a user gesture
  const armAudio = () => { audio.init(); audio.resume(); };
  window.addEventListener('pointerdown', armAudio, { once: false });
  window.addEventListener('keydown', armAudio, { once: false });

  ui.onStart = (opts) => { armAudio(); game.start(opts); };
  ui.onDemo = (opts) => { armAudio(); game.start(Object.assign({}, opts, { demo: true })); };
  ui.onResume = () => game.togglePause();
  ui.onQuit = () => game.quitToMenu();
  ui.onAgain = () => game.start(Object.assign({}, game.opts, { skipSchool: true, demo: false }));
  ui.onHelp = () => game.onAction('help');

  // ---- main loop
  let last = performance.now();
  let frames = 0, fpsT = 0;
  // wallTime: frame time seen by the loop; frameTime: the part handed to the game (after the 1 s cap)
  const stats = { fps: 0, frameMs: 0, frames: 0, wallTime: 0, frameTime: 0 };
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    stats.wallTime += dt;
    if (dt > 1.0) dt = 1.0;                 // tab was hidden etc. — never integrate a huge step
    if (game.state === 'flying') stats.frameTime += dt;
    dt *= game.sim.timeScale === 1 ? 1 : 1; // (time scale is applied inside the simulation)
    const t0 = performance.now();
    if (game.state !== 'menu') {
      game.update(dt);
      game.render(dt);
      if (game.state === 'school') ui.updateSchoolHighlight();
    } else {
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
    game, world, cockpit, inputManager: input, audio, gpws, ui, stats,
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
