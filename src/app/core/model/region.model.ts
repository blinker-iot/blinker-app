export interface RegionSnapshot {
  revision: number;
  order: string[];
  rooms: Record<string, string[]>;
}

export function isRegionSnapshot(value: unknown): value is RegionSnapshot {
  if (!value || typeof value !== 'object') return false;

  const snapshot = value as RegionSnapshot;

  return Number.isSafeInteger(snapshot.revision)
    && snapshot.revision >= 0
    && Array.isArray(snapshot.order)
    && snapshot.order.length <= 99
    && new Set(snapshot.order).size === snapshot.order.length
    && !!snapshot.rooms
    && typeof snapshot.rooms === 'object'
    && !Array.isArray(snapshot.rooms)
    && Object.keys(snapshot.rooms).length === snapshot.order.length
    && snapshot.order.every(name => typeof name === 'string'
      && !!name.trim() && name.length <= 10
      && !['__proto__', 'constructor', 'prototype'].includes(name)
      && Object.hasOwn(snapshot.rooms, name)
      && Array.isArray(snapshot.rooms[name])
      && snapshot.rooms[name].every(id => typeof id === 'string' && !!id));
}
