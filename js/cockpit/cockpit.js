// 3D flight deck built from primitives: window frames, glareshield with MCP,
// main panel with six display units, pedestal with animated thrust /
// speedbrake / flap levers and trim wheels, gear lever, yokes, seats, wipers.
// Everything lives in a group attached to the aircraft body; the camera sits
// at the captain's design eye point.
import * as THREE from 'three';
import { AIRCRAFT as AC, DEG } from '../config.js';
import { PFD, ND, UpperDU, LowerDU, makeMCPTexture, makePanelTexture, makeOverheadTexture } from './instruments.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Cockpit {
  constructor(camera) {
    this.camera = camera;
    this.group = new THREE.Group();       // attached to the aircraft group
    const eye = AC.pilotEye;
    // cockpit frame centred on the aircraft centreline at eye height
    // the structure sits 0.17 m below the design eye point so the pilot looks
    // over the glareshield at ~17° down (the 737's over-the-nose cut-off angle)
    this.root = new THREE.Group();
    this.root.position.set(0, eye[1] - 0.14, eye[2]);
    this.group.add(this.root);
    this.eyeLocal = new THREE.Vector3(eye[0], 0.14, 0);
    // camera rig: base position + look offsets
    this.camRig = new THREE.Group();
    this.camRig.position.copy(this.eyeLocal);
    this.root.add(this.camRig);
    this.camRig.add(camera);
    camera.position.set(0, 0, 0);
    camera.fov = 70; camera.updateProjectionMatrix();
    this.basePitch = -15 * DEG;
    camera.rotation.set(this.basePitch, 0, 0);
    this.lookDown = 0; this.lookYaw = 0; this.lookPitch = 0;
    this.shake = new THREE.Vector3();
    this.shakeAmt = 0;

    // "Boeing grey" plastics; lit by the hemisphere/sun plus the interior lights below
    this.mat = {
      dark: new THREE.MeshStandardMaterial({ color: 0x5d6168, roughness: 0.9, metalness: 0.0 }),
      frame: new THREE.MeshStandardMaterial({ color: 0x33363b, roughness: 0.8, metalness: 0.1 }),
      panel: new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.9 }),
      grey: new THREE.MeshStandardMaterial({ color: 0x8a8d94, roughness: 0.7 }),
      white: new THREE.MeshStandardMaterial({ color: 0xe0e0d8, roughness: 0.6 }),
      black: new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.6 }),
      red: new THREE.MeshStandardMaterial({ color: 0xaa1010, roughness: 0.5 }),
      seat: new THREE.MeshStandardMaterial({ color: 0x2f3450, roughness: 1 }),
      // the windows: a faint tint and a hint of reflection (a sharp glint of the sun off the inside would read as a smudge)
      glass: new THREE.MeshPhysicalMaterial({ color: 0x8fb3d9, transparent: true, opacity: 0.08, roughness: 0.18, specularIntensity: 0.2, metalness: 0, side: THREE.DoubleSide, depthWrite: false }),
    };
    this.anchors = {};   // named 3D anchor points (local to root) for the Flight School highlights
    this.buildShell();
    this.buildPanel();
    this.buildPedestal();
    this.buildYokes();
    this.buildLights();
  }

  box(w, h, d, x, y, z, mat, parent = this.root) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); parent.add(m); return m;
  }

  // ------------------------------------------------------------------ structure
  buildShell() {
    const M = this.mat;
    // floor, side walls, ceiling
    this.box(3.0, 0.05, 3.0, 0, -1.35, 0.3, M.dark);
    for (const s of [-1, 1]) {
      // side wall with the #3 window cut out (z -0.25 .. 0.35, y -0.08 .. 0.58)
      this.box(0.06, 1.32, 3.0, s * 1.42, -0.74, 0.4, M.dark);      // below the windows
      this.box(0.06, 0.42, 3.0, s * 1.42, 0.79, 0.4, M.dark);       // above
      this.box(0.06, 0.66, 1.55, s * 1.42, 0.25, 1.125, M.dark);    // aft of the #3 window
      this.box(0.06, 0.66, 0.13, s * 1.42, 0.25, -0.315, M.dark);   // post between #2 and #3
      const g3 = this.box(0.004, 0.66, 0.6, s * 1.41, 0.25, 0.05, M.glass); void g3;
    }
    // aft bulkhead / door
    this.box(3.0, 2.4, 0.06, 0, -0.2, 1.9, M.dark);
    // overhead panel (sloping) + ceiling
    const oh = this.box(2.2, 0.06, 0.9, 0, 0.72, -0.35, new THREE.MeshStandardMaterial({ map: makeOverheadTexture(), roughness: 0.9 }));
    oh.rotation.x = 0.35;
    this.box(3.0, 0.06, 2.0, 0, 0.98, 0.9, M.dark);
    // windshield frames: the 737 has two raked front panes and angled side panes.
    // Front panes: bottom edge at y=-0.06,z=-1.08; top at y=0.55,z=-0.78
    const rake = Math.atan2(0.30, 0.61);  // tilt of the front panes
    const frame = (w, h, d, x, y, z, rx = 0, ry = 0) => { const f = this.box(w, h, d, x, y, z, M.frame); f.rotation.set(rx, ry, 0); return f; };
    // centre post & outer posts (front)
    frame(0.10, 0.72, 0.06, 0, 0.25, -0.93, -rake);
    frame(0.07, 0.72, 0.06, -0.98, 0.25, -0.93, -rake);
    frame(0.07, 0.72, 0.06, 0.98, 0.25, -0.93, -rake);
    // top and bottom rails
    frame(2.05, 0.08, 0.06, 0, 0.58, -0.78, -rake);
    frame(2.05, 0.06, 0.10, 0, -0.08, -1.09, 0);
    // side panes: from (x=±0.98, z=-1.08) back to (x=±1.42, z=-0.35) — angled ~60°
    for (const s of [-1, 1]) {
      const ang = Math.atan2(0.73, 0.44) * s;
      const g = new THREE.Group(); g.position.set(s * 1.20, 0.25, -0.71); g.rotation.y = -ang + (s > 0 ? Math.PI : 0); this.root.add(g);
      this.box(0.85, 0.08, 0.06, 0, 0.33, 0, M.frame, g);    // top rail
      this.box(0.85, 0.08, 0.06, 0, -0.33, 0, M.frame, g);   // bottom rail
      this.box(0.06, 0.72, 0.06, 0.42, 0, 0, M.frame, g);    // aft post
      // aft side pane (#3) — smaller, flat along the wall
      this.box(0.06, 0.08, 0.6, s * 1.40, 0.58, 0.05, M.frame);
      this.box(0.06, 0.08, 0.6, s * 1.40, -0.08, 0.05, M.frame);
      this.box(0.06, 0.72, 0.06, s * 1.40, 0.25, 0.35, M.frame);
      // glass (very faint)
      const gl = this.box(0.8, 0.66, 0.005, 0, 0, 0, M.glass, g); gl.position.set(0, 0, 0);
      // side console / armrest
      this.box(0.25, 0.08, 1.0, s * 1.22, -0.55, 0.2, M.dark);
    }
    // front glass panes
    for (const s of [-1, 1]) { const gl = this.box(0.9, 0.82, 0.005, s * 0.5, 0.19, -0.93, M.glass); gl.rotation.x = -rake; }
    // nose structure below the windshield (what you see over the glareshield edge): none — the view is outside
    // wipers: pivot at the bottom rail
    this.wipers = [];
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(s * 0.55, -0.12, -1.09); piv.rotation.x = -rake; this.root.add(piv);
      const arm = this.box(0.014, 0.55, 0.012, 0, 0.27, 0, M.black, piv);
      void arm;
      this.wipers.push(piv);
    }
    // seats (only the top of the seat back is in view)
    for (const s of [-1, 1]) {
      this.box(0.55, 0.9, 0.6, s * 0.52, -0.95, 0.65, M.seat);
      this.box(0.55, 0.85, 0.16, s * 0.52, -0.25, 0.98, M.seat);
    }
    // glareshield: shelf + lip + MCP face
    // The shelf sits ~0.29 m below the eye with its far edge ~1 m ahead: a ~15° cut-off angle over
    // the nose, so the runway stays in view through the flare (the real 737 is about 17°).
    this.box(2.3, 0.05, 0.30, 0, -0.15, -0.84, M.dark);           // shelf
    this.box(2.3, 0.05, 0.05, 0, -0.175, -0.70, M.dark);          // lip (MCP housing)
    this.box(2.3, 0.16, 0.30, 0, -0.25, -0.83, M.dark);           // underside filler down to the panel
    const mcpTex = makeMCPTexture(); this.mcpTex = mcpTex;
    const mcp = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.05), new THREE.MeshStandardMaterial({ map: mcpTex, roughness: 0.8, emissive: 0xffffff, emissiveMap: mcpTex, emissiveIntensity: 0.25 }));
    mcp.position.set(0, -0.175, -0.674); this.root.add(mcp);
    this.anchors.mcp = new THREE.Vector3(0, -0.175, -0.68);
    this.anchors.windshield = new THREE.Vector3(-0.45, 0.02, -0.95);
  }

  // ------------------------------------------------------------------ main panel
  buildPanel() {
    // the panel plane: top edge y=-0.19 z=-0.72, bottom y=-0.70 z=-0.58 (tilted back ~15°)
    const tilt = Math.atan2(0.14, 0.51);
    this.panelGroup = new THREE.Group();
    this.panelGroup.position.set(0, -0.46, -0.62);
    this.panelGroup.rotation.x = -tilt;   // top edge away from the pilot so the face looks up at the eye
    this.root.add(this.panelGroup);
    const panelTex = makePanelTexture();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.53, 0.04), new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.9, emissive: 0xffffff, emissiveMap: panelTex, emissiveIntensity: 0.12 }));
    this.panelGroup.add(panel);
    // kick panel below the main panel down to the floor (closes the view to the outside)
    this.box(2.3, 0.80, 0.06, 0, -1.03, -0.52, this.mat.dark);
    this.box(2.3, 0.10, 0.08, 0, -0.72, -0.56, this.mat.dark);     // panel bottom ledge
    // display units
    this.pfd = new PFD(); this.nd = new ND(); this.upper = new UpperDU(); this.lower = new LowerDU();
    const du = (tex, x, y, size = 0.20) => {
      const bezel = new THREE.Mesh(new THREE.BoxGeometry(size + 0.03, size + 0.03, 0.02), this.mat.black);
      bezel.position.set(x, y, 0.025); this.panelGroup.add(bezel);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      screen.position.set(x, y, 0.036); this.panelGroup.add(screen);
      return screen;
    };
    // Captain side: PFD outboard, ND inboard; centre: upper/lower DU; F/O side mirrored (same textures)
    du(this.pfd.tex, -0.70, 0.14); du(this.nd.tex, -0.46, 0.14);
    du(this.upper.tex, 0.0, 0.14); du(this.lower.tex, 0.0, -0.10);
    du(this.nd.tex, 0.46, 0.14); du(this.pfd.tex, 0.70, 0.14);
    // standby instruments between ND and centre: attitude (ISFD-style), altimeter, clock
    this.standby = new StandbyInstruments();
    [[-0.30, 0.18], [-0.30, 0.06], [-0.30, -0.06]].forEach(([x, y], i) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 20), this.mat.black); b.rotation.x = Math.PI / 2; b.position.set(x, y, 0.03); this.panelGroup.add(b);
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.038, 24), new THREE.MeshBasicMaterial({ map: this.standby.tex[i], toneMapped: false })); face.position.set(x, y, 0.041); this.panelGroup.add(face);
    });
    // gear lever (right of the lower DU): a vertical slot with a wheel-shaped handle
    this.gearLever = new THREE.Group(); this.gearLever.position.set(0.30, -0.08, 0.03); this.panelGroup.add(this.gearLever);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.01), this.mat.black); this.gearLever.add(slot);
    this.gearHandle = new THREE.Group(); this.gearLever.add(this.gearHandle);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09), this.mat.grey); stem.position.set(0, 0, 0.045); stem.rotation.x = Math.PI / 2; this.gearHandle.add(stem);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.016, 16), this.mat.white); knob.rotation.z = Math.PI / 2; knob.position.set(0, 0, 0.09); this.gearHandle.add(knob);
    // gear lights next to the lever
    this.gearLights = [];
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.008, 12), new THREE.MeshBasicMaterial({ color: 0x113311 })); l.position.set(0.36 + (i === 0 ? 0 : (i === 1 ? -0.02 : 0.02)), 0.02 - (i === 0 ? 0 : 0.03), 0.03); this.panelGroup.add(l); this.gearLights.push(l); }
    const lbl = (x, y, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0xcccccc })); m.position.set(x, y, 0.021); this.panelGroup.add(m); };
    lbl(0.30, -0.18, 0.04, 0.006);
    // flap position gauge next to the gear lever (analog, needle)
    this.flapGauge = new THREE.Group(); this.flapGauge.position.set(0.42, -0.12, 0.03); this.panelGroup.add(this.flapGauge);
    const fb = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 20), this.mat.black); fb.rotation.x = Math.PI / 2; this.flapGauge.add(fb);
    const ff = new THREE.Mesh(new THREE.CircleGeometry(0.034, 20), new THREE.MeshStandardMaterial({ color: 0x222a33 })); ff.position.z = 0.011; this.flapGauge.add(ff);
    this.flapNeedle = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.03, 0.003), this.mat.white); this.flapNeedle.position.set(0, 0.012, 0.014); this.flapGauge.add(this.flapNeedle);
    this.flapNeedlePivot = new THREE.Group(); this.flapNeedlePivot.position.set(0, 0, 0.013); this.flapGauge.add(this.flapNeedlePivot); this.flapNeedlePivot.add(this.flapNeedle); this.flapNeedle.position.set(0, 0.014, 0);
    // anchors (local to root) for onboarding highlights: transform panelGroup-local points
    const toRoot = (x, y) => new THREE.Vector3(x, y, 0.04).applyEuler(this.panelGroup.rotation).add(this.panelGroup.position);
    this.anchors.pfd = toRoot(-0.70, 0.14);
    this.anchors.nd = toRoot(-0.46, 0.14);
    this.anchors.upper = toRoot(0.0, 0.14);
    this.anchors.lower = toRoot(0.0, -0.10);
    this.anchors.gear = toRoot(0.30, -0.08);
    this.anchors.flapGauge = toRoot(0.42, -0.12);
    this.anchors.airspeed = toRoot(-0.79, 0.14);
    this.anchors.altimeter = toRoot(-0.61, 0.14);
    this.anchors.attitude = toRoot(-0.70, 0.16);
  }

  // ------------------------------------------------------------------ pedestal
  buildPedestal() {
    const M = this.mat;
    const ped = new THREE.Group(); ped.position.set(0, -0.62, -0.25); this.root.add(ped);
    this.box(0.46, 0.55, 1.05, 0, -0.30, 0.25, M.dark, ped);         // pedestal body
    this.box(0.46, 0.03, 0.42, 0, -0.02, -0.05, M.grey, ped);        // throttle quadrant top
    // thrust levers: pivot at the quadrant base
    this.throttles = [];
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(s * 0.05, -0.02, -0.05); ped.add(piv);
      const lever = this.box(0.03, 0.22, 0.03, 0, 0.11, 0, M.black, piv);
      void lever;
      const knob = this.box(0.05, 0.05, 0.05, 0, 0.23, 0, M.white, piv);
      void knob;
      // reverse lever: small piggy-back lever on top, rotates up when reverse is selected
      const rev = new THREE.Group(); rev.position.set(0, 0.16, -0.02); piv.add(rev);
      this.box(0.02, 0.10, 0.02, 0, 0.05, 0, M.grey, rev);
      this.throttles.push({ piv, rev });
    }
    // speedbrake lever (left of the throttles)
    this.sbLever = new THREE.Group(); this.sbLever.position.set(-0.17, -0.02, -0.02); ped.add(this.sbLever);
    this.box(0.025, 0.16, 0.025, 0, 0.08, 0, M.black, this.sbLever);
    this.box(0.045, 0.03, 0.045, 0, 0.17, 0, M.grey, this.sbLever);
    // flap lever (right): slides along a gated slot
    this.box(0.04, 0.005, 0.30, 0.17, -0.005, 0.05, M.black, ped);
    this.flapLever = new THREE.Group(); this.flapLever.position.set(0.17, -0.02, -0.08); ped.add(this.flapLever);
    this.box(0.02, 0.12, 0.02, 0, 0.06, 0, M.black, this.flapLever);
    this.box(0.035, 0.03, 0.05, 0, 0.13, 0, M.white, this.flapLever);
    // trim wheels either side of the pedestal
    this.trimWheels = [];
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 24), M.frame);
      w.rotation.z = Math.PI / 2; w.position.set(s * 0.245, -0.10, 0.10); ped.add(w);
      // a white stripe so the rotation is visible
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.02, 0.05), M.white); stripe.position.set(0, 0.10, 0); w.add(stripe);
      this.trimWheels.push(w);
    }
    // parking brake, radios (decor)
    this.box(0.02, 0.06, 0.02, -0.12, 0.02, 0.35, M.red, ped);
    this.box(0.36, 0.04, 0.16, 0, 0.0, 0.35, new THREE.MeshStandardMaterial({ color: 0x1a1c22, emissive: 0x223322, emissiveIntensity: 0.4 }), ped);
    this.pedestal = ped;
    this.anchors.throttle = new THREE.Vector3(0, -0.45, -0.30);
    this.anchors.speedbrake = new THREE.Vector3(-0.17, -0.48, -0.27);
    this.anchors.flapLever = new THREE.Vector3(0.17, -0.48, -0.25);
    this.anchors.trim = new THREE.Vector3(-0.245, -0.72, -0.15);
  }

  buildYokes() {
    const M = this.mat;
    this.yokes = [];
    for (const s of [-1, 1]) {
      const col = new THREE.Group(); col.position.set(s * 0.52, -1.3, -0.15); this.root.add(col);
      this.box(0.05, 0.75, 0.05, 0, 0.375, 0, M.black, col);       // column
      const hub = new THREE.Group(); hub.position.set(0, 0.78, 0); col.add(hub);
      this.box(0.10, 0.10, 0.08, 0, 0, 0, M.black, hub);
      // W-shaped wheel: two horns + crossbar
      this.box(0.36, 0.035, 0.035, 0, 0.0, 0, M.black, hub);
      for (const h of [-1, 1]) { const horn = this.box(0.035, 0.16, 0.035, h * 0.19, 0.07, 0, M.black, hub); horn.rotation.z = -h * 0.35; this.box(0.03, 0.06, 0.05, h * 0.23, 0.15, 0.0, M.grey, hub); }
      this.yokes.push({ col, hub });
    }
    this.anchors.yoke = new THREE.Vector3(-0.52, -0.52, -0.15);
    this.anchors.rudder = new THREE.Vector3(-0.52, -1.2, -0.9);
  }

  buildLights() {
    // dome light so the flight deck is readable at night; the DUs are emissive anyway
    this.dome = new THREE.PointLight(0xfff0dd, 1.2, 5, 2);
    this.dome.position.set(0, 0.8, 0.3);
    this.root.add(this.dome);
    // panel flood
    this.flood = new THREE.PointLight(0xffe7c0, 0.5, 1.8, 2);
    this.flood.position.set(0, -0.22, -0.42);     // under the glareshield lip, lights the panel and pedestal
    this.root.add(this.flood);
  }

  setNight(night) {
    this.dome.intensity = night ? 1.6 : 1.2;
    this.flood.intensity = night ? 0.9 : 0.5;
  }

  // ------------------------------------------------------------------ per frame
  /** The eye: look offsets, shake, and the head sinking under g. */
  updateCamera(st, dt, extra) {
    const look = extra.look || {};
    const targetDown = typeof look.down === 'number' ? look.down : (look.down ? 1 : 0);
    this.lookDown += (targetDown - this.lookDown) * Math.min(1, dt * 6);
    this.lookYaw += ((look.yaw || 0) - this.lookYaw) * Math.min(1, dt * 8);
    this.lookPitch += ((look.pitch || 0) - this.lookPitch) * Math.min(1, dt * 8);
    // shake: g-load deviation, rough ground, touchdown
    const rough = st.onGround ? (st.surface === 'grass' ? 0.02 : 0.004) * Math.min(1, st.groundSpeed / 30) : 0;
    const gdev = Math.abs(st.gLoad - 1) * 0.008;
    this.shakeAmt = Math.max(this.shakeAmt * (1 - dt * 3), rough + gdev + (extra.shake || 0));
    const sh = this.shakeAmt;
    this.shake.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, 0);
    this.camera.position.copy(this.shake);
    // head moves slightly under lateral/vertical acceleration (feels heavy)
    this.camera.position.y -= clamp((st.gLoad - 1) * 0.02, -0.04, 0.04);
    const base = extra.viewPitch === undefined ? this.basePitch : extra.viewPitch;
    this.camera.rotation.set(base - this.lookDown * 40 * DEG + this.lookPitch, this.lookYaw, 0, 'YXZ');
  }

  /**
   * Per frame: the camera, then the levers, yokes and displays.
   * @param st aircraft state
   * @param input aircraft input
   * @param dt seconds
   * @param extra { look: {yaw,pitch,down}, fd, targetSpeed, papi, checklist, gaMode, rain,
   *   hidden: the head-up view, where none of the flight deck is drawn (only the camera moves),
   *   viewPitch: how far below the nose the eye looks (rad; default the cockpit's −15°, which shows the panel) }
   */
  update(st, input, dt, extra = {}) {
    this.updateCamera(st, dt, extra);
    if (extra.hidden) return;
    // levers
    this.throttles.forEach((t) => {
      t.piv.rotation.x = 0.55 - input.throttle * 1.1;
      t.rev.rotation.x = -st.reverser * 1.2;
    });
    this.sbLever.rotation.x = 0.5 - st.speedbrake * 0.9 - (input.speedbrakeArmed ? 0.12 : 0);
    this.flapLever.position.z = -0.08 + (input.flapIndex / 5) * 0.26;
    this.flapLever.rotation.x = -0.2;
    this.gearHandle.position.y = input.gearDown ? -0.05 : 0.05;
    this.gearLights.forEach((l) => l.material.color.set(st.gearDown ? 0x33ff55 : (st.gearInTransit ? 0xff3030 : 0x113311)));
    this.flapNeedlePivot.rotation.z = -(st.flapDeg / 40) * 2.4;
    // trim wheels spin when the trim moves
    const dTrim = st.trim - (this._lastTrim === undefined ? st.trim : this._lastTrim); this._lastTrim = st.trim;
    this.trimWheels.forEach((w) => { w.rotation.x += dTrim * 4; });
    // yokes
    this.yokes.forEach((y) => { y.col.rotation.x = -input.pitch * 0.14; y.hub.rotation.z = -input.roll * 1.1; });
    // wipers
    if (extra.rain) { this.wiperT = (this.wiperT || 0) + dt * 2.2; const a = (Math.sin(this.wiperT) * 0.5 + 0.5) * 1.1; this.wipers[0].rotation.z = 1.25 - a; this.wipers[1].rotation.z = -1.25 + a; }
    else { this.wipers[0].rotation.z = 1.25; this.wipers[1].rotation.z = -1.25; }
    // displays
    this.pfd.fdEnabled = !!extra.fd;
    if (extra.fd) this.pfd.fd = extra.fd;
    this.pfd.draw(st, extra);
    this.frame = (this.frame || 0) + 1;
    if (this.frame % 3 === 0) this.standby.draw(st);
    // MCP windows follow the approach: selected speed for the flap setting, runway heading, missed-approach altitude
    const selIas = Math.round(input.flapIndex >= 4 ? st.vref + 5 : (input.flapIndex >= 3 ? 165 : (input.flapIndex >= 2 ? 175 : 210)));
    if (selIas !== this._mcpIas) { this._mcpIas = selIas; this.mcpTex.userData.draw({ ias: String(selIas), hdg: '270', alt: '3000', vs: '' }); }
    if (this.frame % 2 === 0) this.nd.draw(st);
    if (this.frame % 2 === 1) this.upper.draw(st, extra);
    if (this.frame % 4 === 2) this.lower.draw(st, extra);
  }

  /** World-space position of the pilot's eye. */
  eyeWorld(target) {
    return this.camera.getWorldPosition(target);
  }

  /** Project a named anchor to screen coordinates (px). */
  anchorScreen(name, renderer) {
    const a = this.anchors[name]; if (!a) return null;
    const v = a.clone(); this.root.localToWorld(v); v.project(this.camera);
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, visible: v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2 };
  }
}

/** Three small round standby instruments drawn on canvases: attitude with speed/altitude, altimeter, clock. */
class StandbyInstruments {
  constructor() {
    this.canvas = []; this.ctx = []; this.tex = [];
    for (let i = 0; i < 3; i++) {
      const c = document.createElement('canvas'); c.width = c.height = 96;
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      this.canvas.push(c); this.ctx.push(c.getContext('2d')); this.tex.push(t);
    }
    this.draw({ pitch: 0, roll: 0, ias: 0, alt: 0, time: 0 });
  }
  draw(st) {
    const DEG = Math.PI / 180;
    // attitude
    let g = this.ctx[0]; g.save(); g.clearRect(0, 0, 96, 96);
    g.translate(48, 48); g.rotate(-st.roll); const py = clamp(st.pitch / DEG, -30, 30) * 1.6;
    g.fillStyle = '#2f7fe0'; g.fillRect(-70, -70 + py, 140, 70); g.fillStyle = '#8a5a2a'; g.fillRect(-70, py, 140, 70);
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-40, py); g.lineTo(40, py); g.stroke();
    for (const d of [-10, 10, -20, 20]) { const yy = py - d * 1.6; g.beginPath(); g.moveTo(-12, yy); g.lineTo(12, yy); g.stroke(); }
    g.restore();
    g.strokeStyle = '#ffd23a'; g.lineWidth = 3; g.beginPath(); g.moveTo(22, 48); g.lineTo(38, 48); g.lineTo(44, 54); g.lineTo(48, 48); g.lineTo(52, 54); g.lineTo(58, 48); g.lineTo(74, 48); g.stroke();
    g.fillStyle = '#000'; g.fillRect(2, 38, 24, 14); g.fillRect(70, 38, 24, 14);
    g.fillStyle = '#fff'; g.font = 'bold 11px monospace'; g.textAlign = 'center'; g.fillText(Math.round(st.ias), 14, 49); g.fillText(Math.round(st.alt / 0.3048 / 10) * 10, 82, 49);
    // altimeter (one turn per 1000 ft)
    g = this.ctx[1]; g.clearRect(0, 0, 96, 96); g.fillStyle = '#10141c'; g.fillRect(0, 0, 96, 96);
    g.strokeStyle = '#ddd'; g.lineWidth = 1.5; g.fillStyle = '#ddd'; g.font = '9px monospace'; g.textAlign = 'center';
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2; g.beginPath(); g.moveTo(48 + Math.cos(a) * 40, 48 + Math.sin(a) * 40); g.lineTo(48 + Math.cos(a) * 34, 48 + Math.sin(a) * 34); g.stroke(); g.fillText(i, 48 + Math.cos(a) * 27, 48 + Math.sin(a) * 27 + 3); }
    const altFt = st.alt / 0.3048; const a1 = (altFt % 1000) / 1000 * Math.PI * 2 - Math.PI / 2; const a2 = (altFt % 10000) / 10000 * Math.PI * 2 - Math.PI / 2;
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(48, 48); g.lineTo(48 + Math.cos(a1) * 36, 48 + Math.sin(a1) * 36); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.moveTo(48, 48); g.lineTo(48 + Math.cos(a2) * 22, 48 + Math.sin(a2) * 22); g.stroke();
    g.fillStyle = '#000'; g.fillRect(30, 58, 36, 13); g.fillStyle = '#fff'; g.font = 'bold 10px monospace'; g.fillText(Math.round(altFt / 20) * 20, 48, 68);
    // clock (elapsed flight time)
    g = this.ctx[2]; g.clearRect(0, 0, 96, 96); g.fillStyle = '#10141c'; g.fillRect(0, 0, 96, 96);
    g.strokeStyle = '#ccc'; g.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.beginPath(); g.moveTo(48 + Math.cos(a) * 40, 48 + Math.sin(a) * 40); g.lineTo(48 + Math.cos(a) * 35, 48 + Math.sin(a) * 35); g.stroke(); }
    const t = st.time || 0; const am = (t / 60 / 60) * Math.PI * 2 - Math.PI / 2, as = (t % 60) / 60 * Math.PI * 2 - Math.PI / 2;
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(48, 48); g.lineTo(48 + Math.cos(am) * 28, 48 + Math.sin(am) * 28); g.stroke();
    g.strokeStyle = '#ff5533'; g.lineWidth = 1; g.beginPath(); g.moveTo(48, 48); g.lineTo(48 + Math.cos(as) * 36, 48 + Math.sin(as) * 36); g.stroke();
    g.fillStyle = '#fff'; g.font = '9px monospace'; g.textAlign = 'center'; g.fillText(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`, 48, 80);
    for (const tx of this.tex) tx.needsUpdate = true;
  }
}
