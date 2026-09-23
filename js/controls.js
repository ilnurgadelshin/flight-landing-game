// One glossary of the player's controls, rendered for the active control scheme:
// 'desktop' (keyboard + mouse) or 'touch' (on-screen stick, thrust lever and buttons).
// Hint text is written once with [[name]] tokens, so the same sentence reads right on a
// laptop and on a phone: "Gear down ([[gear]])" -> "Gear down (G)" or "Gear down (GEAR)".

const kbd = (...keys) => keys.map((k) => `<kbd>${k}</kbd>`).join(' / ');
const chip = (label) => `<span class="tc">${label}</span>`;

export const CONTROLS = {
  pitch:        { key: `${kbd('↑')}/${kbd('↓')} or mouse`,   touch: `${chip('STICK')} up/down` },
  roll:         { key: `${kbd('←')}/${kbd('→')} or mouse`,   touch: `${chip('STICK')} left/right` },
  rudder:       { key: kbd('A', 'D'),                         touch: chip('RUDDER') },
  rudderLeft:   { key: kbd('A'),                              touch: chip('RUDDER ◀') },
  rudderRight:  { key: kbd('D'),                              touch: chip('RUDDER ▶') },
  thrust:       { key: kbd('W', 'S'),                         touch: `the ${chip('THRUST')} lever` },
  thrustUp:     { key: kbd('W'),                              touch: `${chip('THRUST')} lever up` },
  thrustDown:   { key: kbd('S'),                              touch: `${chip('THRUST')} lever down` },
  toga:         { key: kbd('T'),                              touch: chip('TO/GA') },
  flapsDown:    { key: kbd('F'),                              touch: chip('FLAPS +') },
  flapsUp:      { key: kbd('V'),                              touch: chip('FLAPS −') },
  gear:         { key: kbd('G'),                              touch: chip('GEAR') },
  armSpeedbrake:{ key: kbd('X'),                              touch: chip('ARM') },
  speedbrake:   { key: kbd('Space'),                          touch: chip('EXT') },
  brakes:       { key: kbd('B'),                              touch: chip('BRAKE') },
  autobrake:    { key: kbd('N'),                              touch: chip('A/BRK') },
  reverse:      { key: `hold ${kbd('R')}`,                    touch: `pull the ${chip('THRUST')} lever down past idle into ${chip('REV')}` },
  reverseStow:  { key: `release ${kbd('R')}`,                 touch: `push the ${chip('THRUST')} lever up out of ${chip('REV')}` },
  trim:         { key: `${kbd('[')} / ${kbd(']')} (or PageUp / PageDown): trim nose up / down`, touch: 'Trim is automatic: hold a steady stick input and the stabiliser follows it' },
  look:         { key: `hold ${kbd('L')} or right-drag`,      touch: chip('VIEW') },
  reposition:   { key: kbd('Backspace'),                      touch: chip('REPOSITION') },
  help:         { key: kbd('H'),                              touch: chip('?') },
  pause:        { key: kbd('P'),                              touch: chip('❚❚') },
  takeover:     { key: 'press any flight key',                touch: `touch the ${chip('STICK')}` },
  flyWith:      { key: 'Click the window to engage the <b>mouse yoke</b>, or fly with the keyboard.',
                  touch: 'Fly with the <b>stick</b> (right thumb) and the <b>thrust lever</b> (left thumb). The stick springs back to centre when you let go and the aircraft holds its attitude.' },
};

let scheme = 'desktop';
const listeners = [];
export function getScheme() { return scheme; }
export function setScheme(s) {
  if (s === scheme) return;
  scheme = s;
  for (const fn of listeners) fn(s);
}
export function onSchemeChange(fn) { listeners.push(fn); }

/** Replace [[name]] tokens with the active scheme's control markup. */
export function controlsHtml(text) {
  if (!text || text.indexOf('[[') < 0) return text;
  return text.replace(/\[\[(\w+)\]\]/g, (m, name) => {
    const c = CONTROLS[name];
    return c ? (scheme === 'touch' ? c.touch : c.key) : m;
  });
}

/** Same, as plain text (for single-line status messages). */
export function controlsText(text) { return controlsHtml(text).replace(/<[^>]+>/g, ''); }
