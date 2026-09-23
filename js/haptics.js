// Vibration feedback where the browser has the Vibration API (Android Chrome; iPhone Safari has
// none, so there nothing happens): a tick when a touch control is pressed, a click through the
// reverse gate, a thump when the gear locks down, a jolt at touchdown that grows with the sink
// rate, a long shake for a crash, and the stick shaker as pulses while the stall warning is on.

export class Haptics {
  constructor() {
    this.supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    this.enabled = this.supported;
    this.shakerT = 0;          // s until the next stick-shaker burst
    this.shaking = false;
    this.gearWasDown = null;
  }

  buzz(pattern) {
    if (!this.enabled) return;
    try { navigator.vibrate(pattern); } catch (e) { /* not allowed before the first tap */ }
  }

  tick() { this.buzz(8); }
  gate() { this.buzz(20); }
  /** @param sink m/s at touchdown, @param hard over the hard-landing limit */
  touchdown(sink, hard) { this.buzz(hard ? [70, 40, 110] : Math.round(Math.min(60, 18 + sink * 18))); }
  crash() { this.buzz([220, 60, 320]); }

  /** Per simulated step while flying: gear lock and stick shaker. */
  update(dt, st) {
    if (this.gearWasDown === false && st.gearDown && !st.onGround) this.buzz(25);
    this.gearWasDown = st.gearDown;
    if (st.stallWarning) {
      this.shakerT -= dt;
      if (this.shakerT <= 0) { this.buzz([45, 35, 45, 35, 45, 35, 45]); this.shakerT = 0.5; }
      this.shaking = true;
    } else if (this.shaking) { this.stop(); }
  }

  /** Stop any vibration (pause, results, stall warning over). */
  stop() { this.shaking = false; this.shakerT = 0; if (this.supported) try { navigator.vibrate(0); } catch (e) { /* ignore */ } }

  /** A new flight: forget the previous gear state. */
  reset() { this.gearWasDown = null; this.stop(); }
}
