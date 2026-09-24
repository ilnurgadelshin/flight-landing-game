// One glossary of the player's controls, rendered for the active control scheme:
// 'desktop' (keyboard + mouse) or 'touch' (on-screen stick, thrust lever and buttons).
// Hint text is written once with [[name]] tokens, so the same sentence reads right on a
// laptop and on a phone: "Gear down ([[gear]])" -> "Gear down (G)" or "Gear down (GEAR)".
// With tilt steering on, a control's `tilt` wording (when it has one) replaces its touch wording.
// While a game controller is the device in use, `pad(labels)` gives the wording with the button
// names printed on that controller (Xbox, PlayStation or Nintendo, js/gamepad.js).

const kbd = (...keys) => keys.map((k) => `<kbd>${k}</kbd>`).join(' / ');
const chip = (label) => `<span class="tc">${label}</span>`;
const pb = (label) => `<span class="gp">${label}</span>`;

export const CONTROLS = {
  pitch:        { key: `${kbd('↑')}/${kbd('↓')} or mouse`,   touch: `${chip('STICK')} up/down`, tilt: 'Tip the top edge towards / away from you', pad: () => 'left stick ↑/↓' },
  roll:         { key: `${kbd('←')}/${kbd('→')} or mouse`,   touch: `${chip('STICK')} left/right`, tilt: 'Lower the left / right side', pad: () => 'left stick ←/→' },
  center:       { key: '',                                    touch: chip('CENTER') },
  rudder:       { key: kbd('A', 'D'),                         touch: chip('RUDDER'), pad: (L) => `${pb(L.LT)} / ${pb(L.RT)}` },
  rudderLeft:   { key: kbd('A'),                              touch: chip('RUDDER ◀'), pad: (L) => pb(L.LT) },
  rudderRight:  { key: kbd('D'),                              touch: chip('RUDDER ▶'), pad: (L) => pb(L.RT) },
  thrust:       { key: kbd('W', 'S'),                         touch: `the ${chip('THRUST')} lever`, pad: (L) => `${pb(L.A)} / ${pb(L.B)} (hold)` },
  thrustUp:     { key: kbd('W'),                              touch: `${chip('THRUST')} lever up`, pad: (L) => pb(L.A) },
  thrustDown:   { key: kbd('S'),                              touch: `${chip('THRUST')} lever down`, pad: (L) => pb(L.B) },
  toga:         { key: kbd('T'),                              touch: chip('TO/GA'), pad: (L) => pb(L.View) },
  flapsDown:    { key: kbd('F'),                              touch: chip('FLAPS +'), pad: (L) => pb(L.RB) },
  flapsUp:      { key: kbd('V'),                              touch: chip('FLAPS −'), pad: (L) => pb(L.LB) },
  gear:         { key: kbd('G'),                              touch: chip('GEAR'), pad: (L) => pb(L.Y) },
  armSpeedbrake:{ key: kbd('X'),                              touch: chip('ARM'), pad: () => pb('D-pad →') },
  speedbrake:   { key: kbd('Space'),                          touch: chip('EXT'), pad: () => `hold ${pb('D-pad →')}` },
  brakes:       { key: kbd('B'),                              touch: chip('BRAKE'), pad: (L) => pb(L.X) },
  autobrake:    { key: kbd('N'),                              touch: chip('A/BRK'), pad: () => pb('D-pad ←') },
  reverse:      { key: `hold ${kbd('R')}`,                    touch: `pull the ${chip('THRUST')} lever down past idle into ${chip('REV')}`, pad: (L) => `at idle on the ground, keep holding ${pb(L.B)}` },
  reverseStow:  { key: `release ${kbd('R')}`,                 touch: `push the ${chip('THRUST')} lever up out of ${chip('REV')}`, pad: (L) => `press ${pb(L.A)}` },
  trim:         { key: `${kbd('[')} / ${kbd(']')} (or PageUp / PageDown): trim nose up / down`, touch: 'Trim is automatic: hold a steady stick input and the stabiliser follows it', pad: () => `${pb('D-pad ↑')} / ${pb('D-pad ↓')}: trim nose down / up` },
  look:         { key: `hold ${kbd('L')} or right-drag`,      touch: chip('VIEW'), pad: (L) => `the right stick (${pb(L.R3)}: panel, head-up view)` },
  view:         { key: kbd('C'),                              touch: chip('VIEW'), pad: (L) => pb(L.R3) },
  reposition:   { key: kbd('Backspace'),                      touch: chip('REPOSITION'), pad: (L) => pb(L.View) },
  help:         { key: kbd('H'),                              touch: chip('?') },
  ndView:       { key: kbd('J'),                              touch: chip('MAP'), pad: (L) => pb(L.L3) },
  chart:        { key: kbd('E'),                              touch: `${chip('❚❚')} → ${chip('APPROACH CHART')}`, pad: (L) => `${pb(L.Menu)} then ${pb(L.Y)}` },
  ndRange:      { key: `${kbd(',')} / ${kbd('.')}`,             touch: `${chip('MAP')}, then ${chip('−')} / ${chip('+')}`, pad: (L) => pb(L.L3) },
  ndMode:       { key: kbd('K'),                              touch: `${chip('MAP')}, then the mode button`, pad: (L) => `hold ${pb(L.L3)}` },
  pause:        { key: kbd('P'),                              touch: chip('❚❚'), pad: (L) => pb(L.Menu) },
  takeover:     { key: 'press any flight key',                touch: `touch the ${chip('STICK')}`, tilt: 'tilt the phone', pad: () => 'move the left stick' },
  flyWith:      { key: 'Click the window to engage the <b>mouse yoke</b>, or fly with the keyboard.',
                  touch: 'Fly with the <b>stick</b> (right thumb) and the <b>thrust lever</b> (left thumb). The stick springs back to centre when you let go and the aircraft holds its attitude.',
                  tilt: 'Fly by <b>tilting the phone</b>: tip the top edge towards you to raise the nose, lower a side to bank. The way you hold it when the flight starts is level; [[center]] resets that. The <b>thrust lever</b> is under your left thumb.',
                  pad: (L) => `Fly with the <b>left stick</b>: it springs back and the aircraft holds its attitude and trims itself. Thrust: hold ${pb(L.A)} for more, ${pb(L.B)} for less; rudder on ${pb(L.LT)} / ${pb(L.RT)}.` },
};

let scheme = 'desktop';
let tilt = false;
let padLabels = null;             // the controller in use: its button names
const listeners = [];
export function getScheme() { return scheme; }
export function setScheme(s) {
  if (s === scheme) return;
  scheme = s;
  for (const fn of listeners) fn(s);
}
export function tiltWording() { return scheme === 'touch' && tilt && !padLabels; }
export function padWording() { return padLabels; }
export function setPad(labels) {
  if (labels === padLabels) return;
  padLabels = labels;
  for (const fn of listeners) fn(scheme);
}
export function setTilt(on) {
  if (on === tilt) return;
  tilt = on;
  for (const fn of listeners) fn(scheme);
}
export function onSchemeChange(fn) { listeners.push(fn); }

/** Replace [[name]] tokens with the active scheme's control markup. */
export function controlsHtml(text) {
  if (!text || text.indexOf('[[') < 0) return text;
  const t = tiltWording();
  return text.replace(/\[\[(\w+)\]\]/g, (m, name) => {
    const c = CONTROLS[name];
    if (!c) return m;
    if (padLabels && c.pad) return c.pad(padLabels);
    // a wording may itself name controls (the tilt text names CENTER)
    return scheme === 'touch' ? (t && c.tilt ? controlsHtml(c.tilt) : c.touch) : c.key;
  });
}

/** Same, as plain text (for single-line status messages). */
export function controlsText(text) { return controlsHtml(text).replace(/<[^>]+>/g, ''); }
