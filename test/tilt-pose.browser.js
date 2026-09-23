// A simulated motion sensor for the browser tests: turns a physical way of holding the phone into
// the deviceorientation readings a real phone sends (the maths is checked against a rotation-matrix
// model of a phone in test/phone.test.mjs).
//   window.tiltReading({ back, pull, bank, angle })  -> { beta, gamma }
//   window.tiltFeed.start(pose) / .set(pose) / .stop()   sends readings every 16 ms, like a sensor
// back: screen tilted back from vertical (°), pull: top edge towards the player (°), bank: left side
// lowered (°), angle: the true screen angle (90 = the phone's top edge to the left).
(function () {
  const DEG = Math.PI / 180;
  window.tiltReading = function ({ back = 35, pull = 0, bank = 0, angle = 90 } = {}) {
    const phi = -(back - pull) * DEG, r = -bank * DEG;
    const gs = [Math.sin(r), -Math.cos(r) * Math.cos(phi), Math.cos(r) * Math.sin(phi)];   // gravity, screen frame
    const a = angle * DEG, c = Math.cos(a), s = Math.sin(a);
    const gd = [gs[0] * c + gs[1] * s, -gs[0] * s + gs[1] * c, gs[2]];                      // device frame
    const sg = gd[2] <= 0 ? 1 : -1;                                                           // gamma in [-90, 90)
    const beta = Math.atan2(-gd[1], sg * Math.hypot(gd[0], gd[2]));
    const cb = Math.sign(Math.cos(beta)) || 1;
    const gamma = Math.atan2(gd[0] * cb, -gd[2] * cb);
    return { beta: beta / DEG, gamma: gamma / DEG };
  };
  let timer = null, pose = {};
  const send = () => { const r = window.tiltReading(pose); window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: r.beta, gamma: r.gamma, absolute: false })); };
  window.tiltFeed = {
    start(p) { pose = Object.assign({}, p); if (!timer) timer = setInterval(send, 16); send(); },
    set(p) { pose = Object.assign({}, pose, p); },
    stop() { clearInterval(timer); timer = null; },
    get pose() { return pose; },
  };
})();
