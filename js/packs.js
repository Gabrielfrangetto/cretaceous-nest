// Packs: dinosaurs of a pack-hunting species grouped to go out as one unit (PACK_LIMITS in config.js).
// Pure rules on the state passed in, shared by the browser and the server.
// s.packs = [{ id, type, name, members: [babyId] }]
import { PACK_LIMITS, PACK_MIN, SPECIES, HERDS } from './config.js';
import { stageOf } from './economy.js';
import { isAway } from './world.js';

export const packOf = (s, babyId) => (s.packs || []).find(p => p.members.includes(babyId)) || null;
export const canPack = type => !!PACK_LIMITS[type];

// why these dinosaurs can't be this pack, or null when they can
export function packProblem(s, type, members, packId = null) {
  if (!canPack(type)) return 'not-pack-species';
  if (!Array.isArray(members) || new Set(members).size !== members.length) return 'bad-members';
  if (members.length < PACK_MIN) return 'too-few';
  if (members.length > PACK_LIMITS[type]) return 'too-many';
  for (const id of members) {
    const b = s.hatched.find(x => x.id === id);
    if (!b || b.type !== type) return 'bad-members';
    if (stageOf(b).id === 'baby') return 'too-young';
    const other = packOf(s, id);
    if (other && other.id !== packId) return 'in-other-pack';
    if (isAway(s, id)) return 'away';
  }
  return null;
}

const cleanName = (name, type) => String(name ?? '').trim().slice(0, 24) || `${SPECIES[type].species} ${HERDS.includes(type) ? 'herd' : 'pack'}`;

export function formPack(s, { type, members, name }) {
  const problem = packProblem(s, type, members);
  if (problem) return { ok: false, reason: problem };
  s.packs = s.packs || [];
  // the id comes from the pack's first member, so the browser and the server agree
  const pack = { id: `pack-${members[0]}`, type, name: cleanName(name, type), members: [...members] };
  s.packs.push(pack);
  return { ok: true, pack };
}

// changes who is in a pack; fewer than PACK_MIN members breaks it up
export function setPackMembers(s, { id, members }) {
  const pack = (s.packs || []).find(p => p.id === id);
  if (!pack) return { ok: false, reason: 'no-pack' };
  if (pack.members.some(m => isAway(s, m))) return { ok: false, reason: 'away' };
  if (Array.isArray(members) && members.length < PACK_MIN) return disbandPack(s, { id });
  const problem = packProblem(s, pack.type, members, id);
  if (problem) return { ok: false, reason: problem };
  pack.members = [...members];
  return { ok: true, pack };
}

export function renamePack(s, { id, name }) {
  const pack = (s.packs || []).find(p => p.id === id);
  if (!pack) return { ok: false, reason: 'no-pack' };
  pack.name = cleanName(name, pack.type);
  return { ok: true };
}

export function disbandPack(s, { id }) {
  const pack = (s.packs || []).find(p => p.id === id);
  if (!pack) return { ok: false, reason: 'no-pack' };
  if (pack.members.some(m => isAway(s, m))) return { ok: false, reason: 'away' };
  s.packs = s.packs.filter(p => p.id !== id);
  return { ok: true, disbanded: true };
}

// keeps loaded packs inside the rules: real members of the right species, in one pack each
export function cleanPacks(packs, s) {
  const taken = new Set();
  return (Array.isArray(packs) ? packs : []).flatMap(p => {
    if (!p || !canPack(p.type)) return [];
    const members = [...new Set(Array.isArray(p.members) ? p.members : [])]
      .filter(id => !taken.has(id) && s.hatched.some(b => b.id === id && b.type === p.type))
      .slice(0, PACK_LIMITS[p.type]);
    if (members.length < PACK_MIN) return [];
    members.forEach(id => taken.add(id));
    return [{ id: String(p.id || `pack-${members[0]}`), type: p.type, name: cleanName(p.name, p.type), members }];
  });
}
