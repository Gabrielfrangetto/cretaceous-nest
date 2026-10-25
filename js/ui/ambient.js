// What moves on the map, drawn every frame over it (on the trains' canvas, ui/world.js): light glinting
// on the water, drifting; waves washing in on the sea's beaches; smoke rising from the volcanoes that
// smoke. Only close enough to see it, and never for those who'd rather nothing moved.
import { SIZE } from './hexdraw.js';
import { ambientOf, hexesIn } from './mapcanvas.js';

// (the closest a hex is drawn, in pixels across, for any of it to show)
export const AMBIENT_PX = 12;
const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)');
export const ambientOn = scale => SIZE * scale >= AMBIENT_PX && !(still && still.matches);

// the glints: soft pale streaks, lying as the waves do, on a picture that repeats
let glints = null;
function glintsOf(ctx) {
  if (glints) return glints;
  const c = document.createElement('canvas'), n = 256;
  c.width = c.height = n;
  const g = c.getContext('2d');
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const x = rand() * n, y = rand() * n, l = 6 + rand() * 18, a = 0.25 + rand() * 0.55;
    for (const [dx, dy] of [[0, 0], [n, 0], [-n, 0], [0, n], [0, -n]]) {
      g.strokeStyle = `rgba(255, 255, 255, ${a})`;
      g.lineWidth = 1 + rand() * 1.5;
      g.beginPath();
      g.moveTo(x + dx - l / 2, y + dy);
      g.quadraticCurveTo(x + dx, y + dy - 2.5, x + dx + l / 2, y + dy);
      g.stroke();
    }
  }
  return (glints = { pattern: ctx.createPattern(c, 'repeat'), n });
}

let kept = { id: '', of: null };
// ctx: drawn in map units; [x0, y0, x1, y1]: the map in view; t: performance.now()
export function drawAmbient(ctx, seed, [x0, y0, x1, y1], t) {
  const id = `${seed}|${Math.round(x0)}|${Math.round(y0)}|${Math.round(x1)}|${Math.round(y1)}`;
  if (kept.id !== id || kept.of.pending) kept = { id, of: ambientOf(seed, hexesIn(x0 - SIZE * 2, y0 - SIZE * 2, x1 + SIZE * 2, y1 + SIZE * 4)) };
  const { water, surf, craters } = kept.of;
  if (water) {
    ctx.save();
    ctx.clip(water);
    // (two sheets of glints drifting different ways: where they cross, the light twinkles)
    const G = glintsOf(ctx), k = SIZE * 3 / G.n;
    for (const [vx, vy, a] of [[0.0021, 0.0006, 0.16], [-0.0014, 0.0011, 0.11]]) {
      G.pattern.setTransform(new DOMMatrix([k, 0, 0, k * 0.75, (t * vx) % (SIZE * 3), (t * vy) % (SIZE * 3)]));
      ctx.globalAlpha = a;
      ctx.fillStyle = G.pattern;
      ctx.fillRect(x0 - SIZE, y0 - SIZE, x1 - x0 + SIZE * 2, y1 - y0 + SIZE * 2);
    }
    // (on the sea's beaches, waves washing in: a band of white coming in to the shore, thinning, gone;
    // and a broken line of foam running along it)
    if (surf) {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#f4f8f4';
      for (const shift of [0, 0.5]) {
        const u = (t / 3600 + shift) % 1;
        ctx.globalAlpha = 0.32 * Math.sin(Math.PI * u);
        ctx.lineWidth = SIZE * 0.5 * (1 - u);
        ctx.stroke(surf);
      }
      ctx.setLineDash([SIZE * 0.25, SIZE * 0.45]);
      ctx.lineDashOffset = -t * 0.003;
      ctx.globalAlpha = 0.45 + 0.2 * Math.sin(t / 900);
      ctx.lineWidth = SIZE * 0.06;
      ctx.stroke(surf);
    }
    ctx.restore();
  }
  // (smoke from each smoking crater: puffs rising, growing, drifting with the wind, fading)
  const LIFE = 7000, PUFFS = 11;
  for (const c of craters) {
    for (let i = 0; i < PUFFS; i++) {
      const u = ((t + (i * LIFE) / PUFFS + c.x * 37) % LIFE) / LIFE;
      const x = c.x + c.size * (0.22 * u * u + 0.025 * Math.sin(u * 7 + i)), y = c.y - c.size * 0.65 * u;
      const r = c.size * (0.06 + 0.15 * u), a = 0.85 * Math.sin(Math.PI * Math.min(1, u * 1.2)) * (1 - u * 0.4);
      // (each puff round: shade below it, light on its top, as the light comes from the top left)
      for (const [dx, dy, k, rgb, f] of [[0.15, 0.18, 1, '58, 54, 52', 1], [-0.12, -0.14, 0.78, '222, 218, 212', 0.95]]) {
        const px = x + r * dx, py = y + r * dy, rr = r * k, g = ctx.createRadialGradient(px, py, 0, px, py, rr);
        g.addColorStop(0, `rgba(${rgb}, ${a * f})`);
        g.addColorStop(0.65, `rgba(${rgb}, ${a * f * 0.7})`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return !!(water || craters.length);
}
