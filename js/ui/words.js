// Odds and amounts told in words, never in numbers, and a few ways of naming things in a sentence.
import { esc } from '../util.js';
import { AIRLIFT } from '../config.js';

// Odds are told in words, never in numbers: how often, how good a chance, how grave a risk, how a fight
// would go.
export const often = p => (p >= 0.9 ? 'almost always' : p >= 0.65 ? 'usually' : p >= 0.4 ? 'often' : p >= 0.2 ? 'sometimes' : p >= 0.07 ? 'now and then' : 'rarely');
export const chanceOf = p => (p >= 0.85 ? 'a near-certain' : p >= 0.6 ? 'a good' : p >= 0.35 ? 'a fair' : p >= 0.12 ? 'a poor' : 'a slim');
export const riskOf = p => (p >= 0.45 ? 'likely to die' : p >= 0.2 ? 'a grave risk of dying' : p >= 0.05 ? 'a real risk of dying' : 'a slight risk of dying');
export const winOf = p => (p >= 0.85 ? 'should win with ease' : p >= 0.6 ? 'should win' : p >= 0.4 ? 'could go either way' : p >= 0.15 ? 'would likely lose' : 'stands almost no chance');
export const cap = t => t[0].toUpperCase() + t.slice(1);
export const article = name => (/^[AEIOU]/.test(name) ? 'an' : 'a');
// "A", "A and B", "A, B and C"
export const listNames = list => list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
// how hurt one on a journey is, by the share of its health left
export const healthWord = left => (left <= 0 ? 'down' : left >= 0.95 ? 'unhurt' : left >= 0.7 ? 'scratched' : left > AIRLIFT.bad ? 'wounded' : 'badly hurt');
export const wildName = x => `${article(x.name)} ${esc(x.name)}`;
