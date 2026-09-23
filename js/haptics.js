// Vibration feedback where the browser has the Vibration API (Android Chrome; iPhone Safari has
// none, so there nothing happens): a tick when a touch control is pressed, a click through the
// reverse gate, a thump when the gear locks down, a jolt at touchdown that grows with the sink
// rate, a long shake for a crash, and the stick shaker as pulses while the stall warning is on.
// A game controller in use (js/gamepad.js) rumbles for the same events, sized for its motors.

export class Haptics {
  constructor() {
    this.supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';   // phone vibration
    this.enabled = true;       // the player's Vibration option (phone vibration and controller rumble)
    this.shakerT = 0;          // s until the next stick-shaker burst
    this.shaking = false;
    this.gearWasDown = null;
    this.pad = null;           // GamepadInput: rumble(ms, strong, weak) while the controller is in use
  }

  /** Controller rumble for an event (motor magnitudes 0..1). */
  rumble(ms, strong, weak) { if (this.enabled && this.pad) this.pad.rumble(ms, strong, weak); }

  buzz(pattern) {
    if (!this.enabled || !this.supported) return;
    try { navigator.vibrate(pattern); } catch (e) { /* not allowed before the first tap */ }
  }

  tick() { this.buzz(8); }
  gate() { this.buzz(20); this.rumble(80, 0, 0.5); }
  /** @param sink m/s at touchdown, @param hard over the hard-landing limit */
  touchdown(sink, hard) {
    this.buzz(hard ? [70, 40, 110] : Math.round(Math.min(60, 18 + sink * 18)));
    this.rumble(hard ? 450 : 200, hard ? 1 : Math.min(1, 0.25 + sink * 0.25), hard ? 1 : 0.3);
  }
  crash() { this.buzz([220, 60, 320]); this.rumble(900, 1, 1); }

  /** Per simulated step while flying: gear lock and stick shaker. */
  update(dt, st) {
    if (this.gearWasDown === false && st.gearDown && !st.onGround) { this.buzz(25); this.rumble(120, 0.5, 0.2); }
    this.gearWasDown = st.gearDown;
    if (st.stallWarning) {
      this.shakerT -= dt;
      if (this.shakerT <= 0) { this.buzz([45, 35, 45, 35, 45, 35, 45]); this.rumble(400, 0.15, 0.9); this.shakerT = 0.5; }
      this.shaking = true;
    } else if (this.shaking) { this.stop(); }
  }

  /** Stop any vibration (pause, results, stall warning over). */
  stop() { this.shaking = false; this.shakerT = 0; if (this.supported) try { navigator.vibrate(0); } catch (e) { /* ignore */ } }

  /** A new flight: forget the previous gear state. */
  reset() { this.gearWasDown = null; this.stop(); }
}
