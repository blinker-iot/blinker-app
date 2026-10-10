import { IndexedDbIntentStorage } from './intent-storage';

function fixture() {
  const request = {} as any;
  const store = { get: vi.fn(() => request), put: vi.fn(() => request), delete: vi.fn(() => request) };
  const tx = { durability: 'strict', objectStore: vi.fn(() => store), abort: vi.fn() } as any;
  const db = { transaction: vi.fn(() => tx), close: vi.fn(), createObjectStore: vi.fn() };
  const open = { result: db } as any;
  const factory = { open: vi.fn(() => open) };
  const journal = new IndexedDbIntentStorage('blinker-device-tasks', 'TASK_JOURNAL_UNAVAILABLE', () => factory as any);
  return { request, store, tx, db, open, factory, journal };
}

describe('shared intent storage commit boundary', () => {
  it('keeps each feature database and error classification explicit', async () => {
    const open = {} as any, factory = { open: vi.fn(() => open) };
    const storage = new IndexedDbIntentStorage('blinker-automations', 'AUTOMATION_JOURNAL_UNAVAILABLE', () => factory as any);
    const read = storage.getItem('account'); const rejected = expect(read).rejects.toThrow('AUTOMATION_JOURNAL_UNAVAILABLE');
    open.onerror(); await rejected; expect(factory.open).toHaveBeenCalledWith('blinker-automations', 1);
  });
  it('does not acknowledge put until strict transaction complete', async () => {
    const f = fixture(); let completed = false;
    const work = f.journal.setItem('account/device', 'exact intent').then(() => completed = true);
    f.open.onupgradeneeded(); f.open.onsuccess();
    expect(f.db.createObjectStore).toHaveBeenCalledWith('intents');
    expect(f.db.transaction).toHaveBeenCalledWith('intents', 'readwrite', { durability: 'strict' });
    expect(f.store.put).toHaveBeenCalledWith('exact intent', 'account/device');
    f.request.onsuccess(); await Promise.resolve(); expect(completed).toBe(false);
    f.tx.oncomplete(); await work; expect(f.db.close).toHaveBeenCalledTimes(1);
  });
  it('returns only committed reads and treats absent values as absent', async () => {
    for (const value of [undefined, 'exact intent']) {
      const f = fixture(); const work = f.journal.getItem('key'); f.open.onsuccess();
      f.request.result = value; f.request.onsuccess(); f.tx.oncomplete();
      expect(await work).toBe(value ?? null);
    }
  });
  it('rejects failed commits, unsupported strict durability and malformed values', async () => {
    const f = fixture(), failed = f.journal.setItem('k', 'v'); f.open.onsuccess(); f.tx.onabort();
    await expect(failed).rejects.toThrow('TASK_JOURNAL_UNAVAILABLE');
    const g = fixture(); g.tx.durability = 'default';
    const unsupported = g.journal.setItem('k', 'v'); g.open.onsuccess();
    await expect(unsupported).rejects.toThrow(); expect(g.store.put).not.toHaveBeenCalled(); expect(g.tx.abort).toHaveBeenCalled();
    const h = fixture(), corrupt = h.journal.getItem('k'); h.open.onsuccess(); h.request.result = {}; h.request.onsuccess();
    await expect(corrupt).rejects.toThrow(); expect(h.tx.abort).toHaveBeenCalled();
  });
  it('awaits deletion commit and closes a late connection after blocked open', async () => {
    const f = fixture(), removed = f.journal.removeItem('k'); f.open.onsuccess();
    expect(f.store.delete).toHaveBeenCalledWith('k'); f.tx.oncomplete(); await removed;
    const g = fixture(), blocked = g.journal.getItem('k'); g.open.onblocked();
    await expect(blocked).rejects.toThrow(); g.open.onsuccess();
    expect(g.db.close).toHaveBeenCalledTimes(1); expect(g.db.transaction).not.toHaveBeenCalled();
  });
  it('bounds a stuck storage transaction without acknowledging it', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(), work = f.journal.setItem('k', 'v'); const failed = expect(work).rejects.toThrow();
      f.open.onsuccess(); await vi.advanceTimersByTimeAsync(5000); await failed;
      expect(f.tx.abort).toHaveBeenCalledTimes(1); expect(f.db.close).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});
