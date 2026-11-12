// The landing again, from beside the runway: the last minute of the flight (js/game.js records the
// aircraft's position and attitude ten times a second) flown by an airliner model from the apron,
// followed by a camera on the grass near the touchdown point. Offered on the results screen.
import * as THREE from 'three';
import { sceneryGroundHeight } from './world/scenery-ground.js';

const LEAD = 20;          // s shown before the touchdown
const TAIL = 1.5;         // s held on the last sample

export class Replay {
  constructor({ game, world, view }) {
    this.game = game; this.world = world; this.view = view;
    this.active = false; this.onEnd = null;
    this.camera = new THREE.PerspectiveCamera(20, 1, 1, 60000);
    this.q0 = new THREE.Quaternion(); this.q1 = new THREE.Quaternion(); this.target = new THREE.Vector3();
  }

  /** There is something to show: a recorded flight and the airliner model (loaded with the scenery). */
  get available() { return this.game.replay.length > 20 && !!this.world.parkedAircraft?.children.length; }

  start() {
    if (this.active || !this.available) return false;
    const w = this.world, s = this.samples = this.game.replay.slice();
    if (!this.model) {
      // a parked 737 with its undercarriage: nose along -z like the flight deck, wheels at y = 0
      this.model = w.parkedAircraft.children[0].clone(true);
      this.model.name = 'Replay aircraft'; this.model.rotation.set(0, 0, 0);
      w.scene.add(this.model);
    }
    const touch = s.find((p) => p.ground) || s[s.length - 1];
    // the centre of gravity's height above the wheels: its height over the runway once rolling
    this.cg = touch.ground ? touch.y - sceneryGroundHeight(touch.x, touch.z, w.groundLowDetail) : 3;
    this.t = Math.max(s[0].t, touch.t - LEAD); this.end = s[s.length - 1].t;
    // on the grass ahead of the touchdown, on the sunlit north side of the runway
    const cx = touch.x - 260, cz = touch.z - 95;
    this.camera.position.set(cx, sceneryGroundHeight(cx, cz, w.groundLowDetail) + 3, cz);
    this.saved = { camera: w.camera, draw: w.drawCockpit };
    w.camera = this.camera; if (w.composer) w.composer.passes[0].camera = this.camera;
    this.view.hud?.render(this.saved.camera, this.game.sim.state, { visible: false });
    this.model.visible = true; this.active = true;
    return true;
  }

  stop() {
    if (!this.active) return;
    const w = this.world;
    w.camera = this.saved.camera; if (w.composer) w.composer.passes[0].camera = this.saved.camera;
    w.drawCockpit = this.saved.draw;
    this.model.visible = false; this.active = false;
    if (this.onEnd) this.onEnd();
  }

  /** Per frame while active, in place of the flight deck's view. */
  frame(dt) {
    const s = this.samples, w = this.world;
    this.t += Math.min(dt, 0.1);
    if (this.t > this.end + TAIL) { this.stop(); return; }
    const t = Math.min(this.t, this.end);
    let i = this.i || 0; if (i >= s.length - 1 || s[i].t > t) i = 0;
    while (i < s.length - 2 && s[i + 1].t <= t) i++;
    this.i = i;
    const a = s[i], b = s[i + 1], k = Math.min(1, Math.max(0, (t - a.t) / Math.max(b.t - a.t, 1e-3)));
    const m = this.model;
    m.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k - this.cg, a.z + (b.z - a.z) * k);
    m.quaternion.copy(this.q0.fromArray(a.q)).slerp(this.q1.fromArray(b.q), k);
    // follow the aircraft with a long lens that widens as it comes past
    const c = this.camera;
    this.target.copy(m.position); this.target.y += 4;
    const dist = c.position.distanceTo(this.target);
    c.fov = Math.min(38, Math.max(3.5, 2 * Math.atan(27 / dist) * 180 / Math.PI));
    c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix();
    c.lookAt(this.target); c.updateMatrixWorld();
    w.drawCockpit = false;
    w.update(dt, this.game.sim.state, c.position);
    w.render();
  }
}
