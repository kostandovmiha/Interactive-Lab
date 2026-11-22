import { legacySeed, limit, worldModes } from './layout.js';

const storageKey = 'magic-island-world-v2';
const legacyKey = 'magic-island-layout-v1';

export function readWorld(storage) {
  try {
    const data = JSON.parse(storage.getItem(storageKey));
    if (data?.version === 2 && Number.isInteger(data.seed) && data.seed >= 0 &&
        data.seed <= 0xffffffff && worldModes.includes(data.mode) && Array.isArray(data.placements)) {
      return { ...data, placements: data.placements.slice(0, limit) };
    }
  } catch {
    // A damaged or unavailable save falls back to the starter island.
  }
  let placements = [];
  try {
    const old = JSON.parse(storage.getItem(legacyKey));
    if (Array.isArray(old)) placements = old.slice(0, 18).map(item => item && { ...item, legacy: true });
  } catch {
    // No readable older save.
  }
  return { version: 2, seed: legacySeed, mode: 'ready', placements };
}

export function saveWorld(storage, seed, mode, placements) {
  storage.setItem(storageKey, JSON.stringify({ version: 2, seed, mode, placements }));
}
