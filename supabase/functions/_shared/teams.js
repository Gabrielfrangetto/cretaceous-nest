// Team presets: teams set up ahead in the Team tab, loaded in one go when a team sets out. The player is
// always the first place (dinosaurs never set out without them), so a preset holds the other places:
// a dinosaur old enough to explore (not in a pack) or a pack, or nothing. Pure rules on the state
// passed in, shared by the browser and the server.
// s.teams = [{ name, slots: [{ kind: 'dino' | 'pack', id } | null] }], TEAM_PRESETS of them
import { TEAM_PRESETS, TEAM_SLOTS } from './config.js';
import { stageOf } from './economy.js';
import { packOf } from './packs.js';

export const PRESET_SLOTS = TEAM_SLOTS - 1;
const presetName = i => `Team ${i + 1}`;

// why this unit can't fill a preset's place, or null when it can
export function slotProblem(s, unit) {
  if (!unit || typeof unit !== 'object') return 'missing';
  if (unit.kind === 'pack') return (s.packs || []).some(p => p.id === unit.id) ? null : 'missing';
  if (unit.kind !== 'dino') return 'missing';
  const b = s.hatched.find(x => x.id === unit.id);
  if (!b) return 'missing';
  if (stageOf(b).id === 'baby') return 'too-young';
  if (packOf(s, b.id)) return 'in-pack';
  return null;
}

// the presets as they stand: always TEAM_PRESETS of them, each with its places, gone units emptied
export function cleanTeams(s) {
  const old = Array.isArray(s.teams) ? s.teams : [];
  return Array.from({ length: TEAM_PRESETS }, (_, i) => {
    const t = old[i] && typeof old[i] === 'object' ? old[i] : {};
    const seen = new Set();
    const slots = Array.from({ length: PRESET_SLOTS }, (_, j) => {
      const u = Array.isArray(t.slots) ? t.slots[j] : null;
      if (!u || slotProblem(s, u)) return null;
      const unit = { kind: u.kind, id: String(u.id) }, key = `${unit.kind}:${unit.id}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return unit;
    });
    return { name: String(t.name ?? '').trim().slice(0, 24) || presetName(i), slots };
  });
}

// puts a unit in a preset's place (null empties it); a unit already elsewhere in the preset moves here
export function setTeamSlot(s, { team, slot, unit }) {
  const i = Math.floor(Number(team)), j = Math.floor(Number(slot));
  if (!(i >= 0 && i < TEAM_PRESETS) || !(j >= 0 && j < PRESET_SLOTS)) return { ok: false, reason: 'missing' };
  s.teams = cleanTeams(s);
  const t = s.teams[i];
  if (unit == null) { t.slots[j] = null; return { ok: true }; }
  const problem = slotProblem(s, unit);
  if (problem) return { ok: false, reason: problem };
  const u = { kind: unit.kind, id: String(unit.id) };
  t.slots = t.slots.map(x => (x && x.kind === u.kind && x.id === u.id ? null : x));
  t.slots[j] = u;
  return { ok: true };
}

export function renameTeam(s, { team, name }) {
  const i = Math.floor(Number(team));
  if (!(i >= 0 && i < TEAM_PRESETS)) return { ok: false, reason: 'missing' };
  s.teams = cleanTeams(s);
  s.teams[i].name = String(name ?? '').trim().slice(0, 24) || presetName(i);
  return { ok: true };
}
