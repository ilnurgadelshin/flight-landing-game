// Ground Proximity Warning System + altitude callouts + configuration warnings,
// modelled on the 737NG EGPWS modes (simplified envelopes).
import { FT, DEG, AIRCRAFT as AC } from './config.js';

const CALLOUT_ALTS = [2500, 1000, 500, 400, 300, 200, 100, 50, 40, 30, 20, 10];

export class GPWS {
  constructor(audio) {
    this.audio = audio;
    this.events = [];       // { t, type, text }
    this.reset();
  }

  reset() {
    this.calledOut = new Set();
    this.prevAgl = 0;
    this.caption = '';
    this.captionKind = '';
    this.captionTimer = 0;
    this.time = 0;
    this.minimumsCalled = false;
    this.approachingCalled = false;
    this.armed = false;         // callouts arm once the aircraft has been above 50 ft
    this.hornOn = false;
    this.overspeedT = -10;
    this.events.length = 0;
  }

  announce(text, kind, priority = 1, minGap = 2.5) {
    const said = this.audio.say(text, { priority, minGap, key: text });
    if (said) {
      this.events.push({ t: this.time, type: kind, text });
      this.caption = text.toUpperCase(); this.captionKind = kind; this.captionTimer = 2.2;
      if (kind === 'warning') this.audio.play('whoop');
    }
    return said;
  }

  /**
   * @param dt seconds
   * @param st aircraft state
   * @param ctx { gaMode, airborneEver, terrainAhead }
   */
  update(dt, st, ctx = {}) {
    this.time += dt;
    this.captionTimer -= dt;
    if (this.captionTimer <= 0) { this.caption = ''; this.captionKind = ''; }
    const aglFt = st.agl / FT;
    const vsFpm = st.vs / 0.00508;
    if (aglFt > 60) this.armed = true;
    if (!this.armed) { this.prevAgl = aglFt; return; }

    // ---- altitude callouts (descending through)
    if (!st.onGround) {
      for (const a of CALLOUT_ALTS) {
        if (this.prevAgl > a && aglFt <= a && !this.calledOut.has(a)) {
          this.calledOut.add(a);
          const text = a >= 1000 ? (a === 2500 ? 'Two thousand five hundred' : 'One thousand') : (a >= 100 ? `${a === 500 ? 'Five hundred' : a === 400 ? 'Four hundred' : a === 300 ? 'Three hundred' : a === 200 ? 'Two hundred' : 'One hundred'}` : `${a === 50 ? 'Fifty' : a === 40 ? 'Forty' : a === 30 ? 'Thirty' : a === 20 ? 'Twenty' : 'Ten'}`);
          this.audio.say(text, { priority: 1, minGap: 0.5 });
          this.events.push({ t: this.time, type: 'callout', text });
        }
      }
      // decision height callouts (CAT I: 200 ft)
      if (this.prevAgl > 280 && aglFt <= 280 && !this.approachingCalled) { this.approachingCalled = true; this.audio.say('Approaching minimums', { priority: 1 }); this.events.push({ t: this.time, type: 'callout', text: 'Approaching minimums' }); }
      if (this.prevAgl > 200 && aglFt <= 200 && !this.minimumsCalled) { this.minimumsCalled = true; this.audio.say('Minimums', { priority: 1 }); this.events.push({ t: this.time, type: 'callout', text: 'Minimums' }); }
    }
    // re-arm the callouts when climbing back above them (go-around)
    for (const a of CALLOUT_ALTS) if (aglFt > a + 150) this.calledOut.delete(a);
    if (aglFt > 500) { this.minimumsCalled = false; this.approachingCalled = false; }

    if (!st.onGround && !st.destroyed) {
      // ---- Mode 1: excessive descent rate
      if (aglFt < 2450 && aglFt > 10) {
        const pullUp = vsFpm < -(1500 + aglFt * 2.6);
        const sinkRate = vsFpm < -(950 + aglFt * 1.35);
        if (pullUp) this.announce('Pull up', 'warning', 3, 1.4);
        else if (sinkRate) this.announce('Sink rate', 'caution', 2, 2.2);
      }
      // ---- Mode 2: terrain closure (hills)
      if (ctx.terrainAhead) this.announce('Terrain, terrain, pull up', 'warning', 3, 2.5);
      // ---- Mode 3: altitude loss after go-around
      if (ctx.gaMode && aglFt < 700 && vsFpm < -300 && ctx.gaAltitudeLoss > 30) this.announce("Don't sink", 'caution', 2, 3);
      // ---- Mode 4: unsafe terrain clearance / configuration
      if (aglFt < 500 && !st.gearDown && st.ias < 190 && !ctx.gaMode) this.announce('Too low, gear', 'caution', 2, 3);
      else if (aglFt < 245 && st.gearDown && st.flapIndex < 4 && st.ias < 165 && !ctx.gaMode) this.announce('Too low, flaps', 'caution', 2, 3);
      else if (aglFt < 300 && st.ias > 200 && !ctx.gaMode) this.announce('Too low, terrain', 'caution', 2, 3);
      // ---- Mode 5: below glideslope
      if (st.gearDown && aglFt < 1000 && aglFt > 30 && st.distToThreshold > 0 && st.distToThreshold < 12 * 1852 && Math.abs(st.locDev) < 2.5) {
        const below = -st.gsDev;   // degrees below
        if (below > 0.9) this.announce('Glideslope', 'caution', 2, 1.6);
        else if (below > 0.45) this.announce('Glideslope', 'caution', 1, 3.5);
      }
      // ---- Mode 6: bank angle
      const bank = Math.abs(st.roll) / DEG;
      const bankLimit = aglFt < 150 ? Math.max(10, aglFt / 5) : 35;
      if (bank > bankLimit && aglFt > 5) this.announce('Bank angle, bank angle', 'caution', 2, 3);
      // ---- stall
      if (st.stalled) this.announce('Stall, stall', 'warning', 3, 2.5);
      // ---- overspeed (flap placard)
      const vfe = AC.flaps.vfe[st.flapIndex];
      if (st.ias > vfe + 3 && this.time - this.overspeedT > 4) { this.overspeedT = this.time; this.audio.play('overspeed'); this.caption = 'FLAP OVERSPEED'; this.captionKind = 'caution'; this.captionTimer = 2; this.events.push({ t: this.time, type: 'caution', text: 'Flap overspeed' }); }
    }
    // ---- landing configuration horn: flaps landing setting or low + gear not down
    const horn = !st.onGround && !st.gearDown && !st.gearInTransit && ((st.flapIndex >= 4) || (aglFt < 800 && st.throttle < 0.35)) && !ctx.gaMode;
    if (horn !== this.hornOn) { this.hornOn = horn; this.audio.setConfigHorn(horn); if (horn) this.events.push({ t: this.time, type: 'horn', text: 'Landing gear configuration warning' }); }
    this.prevAgl = aglFt;
  }
}
