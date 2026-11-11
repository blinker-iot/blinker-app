import * as L from 'leaflet';
import { MANAGED_MAP_LIMITS, ManagedMapError, ManagedMapLayer, ManagedMapTransport,
  ManagedTileCoordinates, managedMapError, validManagedTile } from './managed-map';

type Limits = { [K in keyof typeof MANAGED_MAP_LIMITS]: number };
type Phase = 'queued' | 'fetching' | 'image' | 'painted' | 'cancelled';
interface Job {
  layer: ManagedMapLayer;
  coords: ManagedTileCoordinates;
  image: HTMLImageElement;
  done: L.DoneCallback;
  controller: AbortController;
  timer: ReturnType<typeof setTimeout>;
  phase: Phase;
  pending: boolean;
  completed: boolean;
  url?: string;
  bytes: number;
}

/** Two layers share one bounded owner, with no URL credentials or tile retry. */
export function createManagedMapLayers(transport: ManagedMapTransport, options: Partial<Limits> = {}): {
  layers: L.GridLayer[]; dispose(): void;
} {
  const limits: Limits = { ...MANAGED_MAP_LIMITS, ...options };
  for (const key of Object.keys(MANAGED_MAP_LIMITS) as (keyof Limits)[]) {
    if (!Number.isInteger(limits[key]) || limits[key] < (key === 'queued' ? 0 : 1)
      || limits[key] > MANAGED_MAP_LIMITS[key]) throw new ManagedMapError('invalid');
  }
  const jobs = new Map<HTMLImageElement, Job>(), active = new Set<Job>(), queued: Job[] = [];
  let stopped = false, urls = 0, bytes = 0;
  const current = () => { try { return !stopped && transport.current(); } catch { return false; } };

  function releaseUrl(job: Job): void {
    if (!job.url) return;
    URL.revokeObjectURL(job.url); urls--; bytes -= job.bytes;
    job.url = undefined; job.bytes = 0;
  }
  function cancel(job: Job): void {
    job.phase = 'cancelled'; clearTimeout(job.timer); job.controller.abort();
    job.image.onload = null; job.image.onerror = null; job.image.removeAttribute('src');
    releaseUrl(job); jobs.delete(job.image);
    const index = queued.indexOf(job); if (index >= 0) queued.splice(index, 1);
    // A transport that has not settled still owns its real concurrency slot.
    if (!job.pending) active.delete(job);
  }
  function dispose(): void {
    if (stopped) return;
    stopped = true;
    for (const job of jobs.values()) cancel(job);
    queued.length = 0;
    for (const layer of layers) layer.off('tileunload', unload);
  }
  function done(job: Job, error?: ManagedMapError): void {
    if (job.completed) return;
    job.completed = true;
    // Leaflet owns this callback. Teardown may have removed its tile already.
    try { job.done(error, job.image); } catch { /* The owner is already bounded/settled. */ }
  }
  function fail(error: unknown, job?: Job, deferred = false): void {
    if (stopped) return;
    if (!current()) { dispose(); return; }
    const safe = managedMapError(error);
    dispose();
    const notify = () => {
      try { if (!transport.current()) return; } catch { return; }
      if (job) done(job, safe);
      try { transport.onError(safe); } catch { /* Teardown cannot reopen this owner. */ }
    };
    if (deferred) queueMicrotask(notify); else notify();
  }
  function pump(): void {
    if (!current()) { dispose(); return; }
    while (active.size < limits.active && queued.length) start(queued.shift()!);
  }
  function finishImage(job: Job, failed: boolean): void {
    if (job.phase !== 'image' || !jobs.has(job.image)) return;
    if (!current()) { dispose(); return; }
    if (failed || job.image.naturalWidth !== 256 || job.image.naturalHeight !== 256) {
      fail(new ManagedMapError('invalid'), job); return;
    }
    job.phase = 'painted'; clearTimeout(job.timer);
    job.image.onload = null; job.image.onerror = null;
    active.delete(job); done(job); pump();
  }
  async function load(job: Job): Promise<void> {
    try {
      if (!current()) { dispose(); return; }
      if (!jobs.has(job.image)) return;
      job.pending = true;
      const blob = await transport.getTile(job.layer, job.coords, job.controller.signal);
      job.pending = false;
      if (!current()) { dispose(); return; }
      if (!jobs.has(job.image)) return;
      if (!(blob instanceof Blob) || !['image/png', 'image/jpeg'].includes(blob.type)
        || blob.size <= 0 || blob.size > limits.tileBytes) { fail(new ManagedMapError('invalid'), job); return; }
      if (urls >= limits.urls || bytes + blob.size > limits.bytes) { fail(new ManagedMapError('busy'), job); return; }
      job.url = URL.createObjectURL(blob); job.bytes = blob.size; urls++; bytes += blob.size;
      job.phase = 'image';
      job.image.onload = () => finishImage(job, false);
      job.image.onerror = () => finishImage(job, true);
      job.image.src = job.url;
    } catch (error) {
      if (job.phase !== 'cancelled' && !job.controller.signal.aborted) fail(error, job);
    } finally {
      job.pending = false;
      if (job.phase !== 'image') { active.delete(job); pump(); }
    }
  }
  function start(job: Job): void {
    job.phase = 'fetching'; active.add(job);
    // A real asynchronous createTile(coords, done) must return the element
    // before Leaflet can receive completion or a terminal owner error.
    queueMicrotask(() => { void load(job); });
  }
  function unload(event: L.TileEvent): void {
    const job = jobs.get(event.tile as HTMLImageElement);
    if (job) { cancel(job); pump(); }
  }
  function createTile(layer: ManagedMapLayer, coords: L.Coords, callback: L.DoneCallback): HTMLImageElement {
    const image = document.createElement('img'); image.alt = ''; image.decoding = 'async';
    if (!current()) { dispose(); return image; }
    if (!validManagedTile(layer, coords)) {
      fail(new ManagedMapError('invalid'), undefined, true); return image;
    }
    const job: Job = { layer, coords: { z: coords.z, x: coords.x, y: coords.y }, image, done: callback,
      controller: new AbortController(), phase: 'queued', pending: false, completed: false, bytes: 0,
      timer: setTimeout(() => fail(new ManagedMapError('timeout'), job), limits.deadlineMs) };
    jobs.set(image, job);
    if (active.size < limits.active) start(job);
    else if (queued.length < limits.queued) queued.push(job);
    else fail(new ManagedMapError('busy'), job, true);
    return image;
  }
  class ManagedLayer extends L.GridLayer {
    constructor(private readonly kind: ManagedMapLayer) {
      super({ minZoom: 1, maxZoom: 18, tileSize: 256, noWrap: true,
        updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 0,
        attribution: kind === 'base'
          ? '&copy; <a href="https://www.tianditu.gov.cn/" target="_blank" rel="noopener noreferrer">天地图</a>' : '' });
      this.on('tileunload', unload);
    }
    createTile(coords: L.Coords, callback: L.DoneCallback): HTMLElement { return createTile(this.kind, coords, callback); }
    onRemove(map: L.Map): this { dispose(); super.onRemove(map); return this; }
  }
  const layers = [new ManagedLayer('base'), new ManagedLayer('annotation')];
  return { layers, dispose };
}
