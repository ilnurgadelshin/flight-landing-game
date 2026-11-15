// Radar vectors round the left-hand circuit back to the ILS, for a pilot flying it by hand after
// a take-off: the same legs the autoland flies after a go-around and the chart draws (js/nav.js
// MISSED). Each leg is a heading, an altitude and a speed to fly, given as the last one ends.
import { RUNWAY, NM, FT, DEG } from './config.js';
import { MISSED } from './nav.js';

const LEGS = ['crosswind', 'downwind', 'base', 'intercept', 'established'];

export class CircuitGuide {
  constructor() { this.leg = null; this.hdg = RUNWAY.headingDeg; this.altFt = MISSED.altFt; this.speedKts = MISSED.speedKts; }

  get done() { return this.leg === 'established'; }

  /** What the controller says for a leg. */
  text(leg = this.leg) {
    const H = MISSED.headings, alt = MISSED.altFt;
    return {
      crosswind: `TURN LEFT HEADING ${H.crosswind}, CLIMB AND MAINTAIN ${alt}`,
      downwind: `TURN LEFT HEADING 0${H.downwind}, MAINTAIN ${alt}, ${MISSED.speedKts} KNOTS`,
      base: `TURN LEFT HEADING ${H.base}, MAINTAIN ${alt}`,
      intercept: `TURN LEFT HEADING ${H.intercept}, CLEARED ILS RUNWAY 27`,
      established: 'ESTABLISHED ON THE LOCALIZER — RUNWAY 27, CLEARED TO LAND',
    }[leg] || '';
  }

  /**
   * One step. Returns the new leg's name on the step it begins (its vector is then spoken), or null.
   * The turns begin early by the radius the turn itself takes at 25° of bank, as the autoland's do.
   */
  update(st) {
    if (this.done) return null;
    const M = MISSED, T = RUNWAY.thresholdX, lead = (st.groundSpeed * st.groundSpeed) / (9.81 * Math.tan(25 * DEG));
    let next = null;
    if (this.leg === null) { if (st.alt > M.turnAltFt * FT) next = 'crosswind'; }
    else if (this.leg === 'crosswind') { if (st.z > M.downwindNm * NM - lead) next = 'downwind'; }
    else if (this.leg === 'downwind') { if (st.x > T + M.baseNm * NM - lead) next = 'base'; }
    else if (this.leg === 'base') { if (st.z < M.interceptNm * NM + 0.87 * lead) next = 'intercept'; }
    else if (this.leg === 'intercept') { if (st.landingDirection === RUNWAY.ident && Math.abs(st.lateralOffset) < M.captureM) next = 'established'; }
    if (!next) return null;
    this.leg = next;
    this.hdg = next === 'established' ? RUNWAY.headingDeg : M.headings[next];
    return next;
  }
}

export { LEGS as CIRCUIT_LEGS };
