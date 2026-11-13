// The landing again, from beside the runway: the last minute of the flight (js/game.js records the
// aircraft's position and attitude ten times a second) flown by an airliner model from the apron,
// followed by a camera on the grass near the touchdown point. Offered on the results screen.
import * as THREE from 'three';
import { sceneryGroundHeight } from './world/scenery-ground.js';

const LEAD = 20;          // s shown before the touchdown
const TAIL = 1.5;         // s held on the last sample
const PUFFS = 28, PUFF_LIFE = 2.6;   // tyre smoke: sprites spawned at the main wheels as they spin up
const GEAR = 2.86;        // m, a main gear leg from the centreline

function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(.5, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Replay {
  constructor({ game, world, view, audio }) {
    this.game = game; this.world = world; this.view = view; this.audio = audio;
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
    if (!this.puffs) {
      const map = puffTexture();
      this.puffs = Array.from({ length: PUFFS }, () => {
        const p = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
        p.center.set(.5, .22);              // most of a puff above the runway it lies on
        p.visible = false; p.userData = { age: PUFF_LIFE, v: new THREE.Vector3() }; w.scene.add(p); return p;
      });
    }
    this.smoke = 0; this.side = 0; this.wasGround = true; this.last = new THREE.Vector3(NaN);
    this.model.visible = true; this.active = true;
    return true;
  }

  stop() {
    if (!this.active) return;
    const w = this.world;
    w.camera = this.saved.camera; if (w.composer) w.composer.passes[0].camera = this.saved.camera;
    w.drawCockpit = this.saved.draw;
    this.model.visible = false; this.active = false;
    this.audio?.setListener(1);
    for (const p of this.puffs) { p.visible = false; p.userData.age = PUFF_LIFE; }
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
    const ground = a.ground || (b.ground && k > .5), landed = ground && !this.wasGround;
    this.updateSmoke(Math.min(dt, 0.1), ground);
    // follow the aircraft with a long lens that widens as it comes past
    const c = this.camera;
    this.target.copy(m.position); this.target.y += 4;
    const dist = c.position.distanceTo(this.target);
    c.fov = Math.min(38, Math.max(3.5, 2 * Math.atan(27 / dist) * 180 / Math.PI));
    c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix();
    c.lookAt(this.target); c.updateMatrixWorld();
    this.updateSound(dt, a, ground, landed, dist);
    w.drawCockpit = false;
    w.update(dt, this.game.sim.state, c.position);
    w.render();
  }

  /** The aircraft heard from the camera: the recorded engines and roll, fading with distance, and the touchdown. */
  updateSound(dt, sample, ground, landed, dist) {
    const audio = this.audio; if (!audio || sample.n1 === undefined) return;
    audio.setListener(Math.min(1, Math.max(0.06, 150 / dist)));
    if (landed) audio.play('touchdown');
    const n1 = sample.n1, speed = sample.speed || 0;
    // outside there is no slipstream on a windscreen: a little of the airframe's rush only
    audio.update(dt, { n1: [n1, n1], reverser: sample.reverser || 0, tasKts: speed * 1.944 * 0.35, speedbrake: 0, gearDown: false,
      groundSpeed: speed, onGround: ground, surface: 'runway', skidding: false, stallWarning: false });
  }

  /** A burst of tyre smoke from each main gear when the wheels meet the runway, left behind the aircraft. */
  updateSmoke(dt, ground) {
    const m = this.model, d = this.target;
    if (ground && !this.wasGround) this.smoke = 0.5;       // s of smoke from this touchdown (and from each bounce)
    this.wasGround = ground;
    const speed = Number.isNaN(this.last.x) || dt <= 0 ? 0 : m.position.distanceTo(this.last) / dt;
    if (this.smoke > 0 && ground) {
      this.smoke -= dt;
      for (let n = 0; n < 2; n++) {
        const p = this.puffs.reduce((o, q) => (q.userData.age > o.userData.age ? q : o));
        this.side = -this.side || 1;
        d.set(this.side * GEAR, 0.6, 1.5).applyQuaternion(m.quaternion).add(m.position);
        p.position.copy(d); p.userData.age = 0; p.userData.size = 2.5 + Math.random() * 1.5;
        p.userData.v.set(0, 0, -1).applyQuaternion(m.quaternion).multiplyScalar(speed * .08).setY(.8 + Math.random() * .8);
        p.material.rotation = Math.random() * 6.28; p.visible = true;
      }
    }
    this.last.copy(m.position);
    const light = Math.min(1, Math.max(.1, (this.world.sun?.intensity ?? 3) / 3));
    for (const p of this.puffs) {
      const u = p.userData; if (u.age >= PUFF_LIFE) { p.visible = false; continue; }
      u.age += dt; const f = u.age / PUFF_LIFE;
      p.position.addScaledVector(u.v, dt); u.v.multiplyScalar(Math.exp(-1.6 * dt));
      p.scale.setScalar(u.size * (1 + 4 * Math.sqrt(f)));
      p.material.opacity = .5 * (1 - f) * (1 - f); p.material.color.setRGB(.86 * light, .86 * light, .88 * light);
    }
  }
}
