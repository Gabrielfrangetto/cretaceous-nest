// Game time. Signed-in players follow the server's clock, so hatch and hunger timers on screen
// match what the server checks even when the device clock is a few seconds off.
let offset = 0;

export const now = () => Date.now() + offset;

export function setServerTime(serverNow) {
  if (Number.isFinite(serverNow)) offset = serverNow - Date.now();
}
