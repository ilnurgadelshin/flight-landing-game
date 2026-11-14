// The taxi route of a departure from stand 4: from where the pushback leaves the aircraft, along
// the apron, up to the parallel taxiway, east along it, up the last connector to the holding
// point and onto runway 27. Shared by the rules (progress, the holding point), the drawn guidance
// (js/world/taxi-route.js) and the tests, which drive it.
import { RUNWAY } from './config.js';
import { TAXIWAY_CONNECTORS } from './airport-layout.js';

const CONNECTOR = TAXIWAY_CONNECTORS[TAXIWAY_CONNECTORS.length - 1];   // the one by the 27 threshold
export const TAXI = {
  radius: 40,                 // m, the turns
  holdZ: 76,                  // the holding point's marking across the connector (m south of the centreline)
  straightKt: 15, turnKt: 8,  // taxi speeds to hold
};
// corners of the route (x east, z south): the turns are rounded to TAXI.radius
const CORNERS = [[108, 295], [300, 295], [300, 135], [CONNECTOR, 135], [CONNECTOR, 0], [CONNECTOR - 120, 0]];

/** The route as points about 2 m apart, each { x, z, s (m along), turn (true on a rounded corner) }. */
export function taxiRoute() {
  const pts = [], R = TAXI.radius, push = (x, z, turn) => { const p = pts[pts.length - 1]; if (!p || Math.hypot(x - p.x, z - p.z) > 1e-6) pts.push({ x, z, turn }); };
  const line = (ax, az, bx, bz) => { const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 2)); for (let i = 0; i <= n; i++) push(ax + (bx - ax) * i / n, az + (bz - az) * i / n, false); };
  let from = CORNERS[0];
  for (let i = 1; i < CORNERS.length; i++) {
    const c = CORNERS[i], next = CORNERS[i + 1];
    const inL = Math.hypot(c[0] - from[0], c[1] - from[1]), ux = (c[0] - from[0]) / inL, uz = (c[1] - from[1]) / inL;
    if (!next) { line(from[0], from[1], c[0], c[1]); break; }
    const outL = Math.hypot(next[0] - c[0], next[1] - c[1]), vx = (next[0] - c[0]) / outL, vz = (next[1] - c[1]) / outL;
    const a = [c[0] - ux * R, c[1] - uz * R], b = [c[0] + vx * R, c[1] + vz * R];
    line(from[0], from[1], a[0], a[1]);
    // a quarter circle from a to b, its centre the corner of the square they make
    const ox = a[0] + vx * R, oz = a[1] + vz * R;
    for (let k = 1; k < 32; k++) { const t = k / 32 * Math.PI / 2; push(ox - vx * R * Math.cos(t) + ux * R * Math.sin(t), oz - vz * R * Math.cos(t) + uz * R * Math.sin(t), true); }
    from = b;
  }
  let s = 0; pts[0].s = 0;
  for (let i = 1; i < pts.length; i++) { s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); pts[i].s = s; }
  return pts;
}

/** Where a position is on the route: { i (nearest point's index), s, off (m from the line), left (m to go) }. */
export function routeProgress(route, x, z, from = 0) {
  let best = from, d = Infinity;
  for (let i = Math.max(0, from - 5); i < Math.min(route.length, from + 60); i++) { const e = Math.hypot(route[i].x - x, route[i].z - z); if (e < d) { d = e; best = i; } }
  return { i: best, s: route[best].s, off: d, left: route[route.length - 1].s - route[best].s };
}

/** Past the holding point's marking, towards the runway. */
export function pastHoldingPoint(x, z) { return Math.abs(x - CONNECTOR) < 20 && z < TAXI.holdZ && z > RUNWAY.width / 2; }

export { CONNECTOR as TAXI_CONNECTOR };
