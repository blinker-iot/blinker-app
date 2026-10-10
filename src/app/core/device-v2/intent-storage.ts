export interface IntentStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

// Non-secret typed intent records; callers own account/device/rule scoping and
// bounds. No credential store, retry queue or localStorage fallback. Strict transaction
// completion is the write-ahead barrier; request.onsuccess alone is NOT commit.
export class IndexedDbIntentStorage implements IntentStorage {
  constructor(private readonly database: string, private readonly errorCode: string,
    private readonly factory: () => IDBFactory = () => indexedDB) {}
  getItem(key: string): Promise<string | null> { return this.access(key, 'readonly'); }
  async setItem(key: string, value: string): Promise<void> { await this.access(key, 'readwrite', value); }
  async removeItem(key: string): Promise<void> { await this.access(key, 'readwrite'); }
  private access(key: string, mode: IDBTransactionMode, value?: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      let db: IDBDatabase | undefined, tx: IDBTransaction | undefined, finished = false;
      const finish = (error?: Error, result: string | null = null) => {
        if (finished) return; finished = true; clearTimeout(deadline); db?.close();
        if (error) reject(error); else resolve(result);
      };
      const failure = () => finish(new Error(this.errorCode));
      const deadline = setTimeout(() => { try { tx?.abort(); } catch { /* Already committed. */ } failure(); }, 5000);
      try {
        const open = this.factory().open(this.database, 1);
        open.onupgradeneeded = () => { open.result.createObjectStore('intents'); };
        open.onerror = failure; open.onblocked = failure;
        open.onsuccess = () => {
          db = open.result;
          if (finished) { db.close(); return; }
          db.onversionchange = () => db?.close();
          try {
            tx = db.transaction('intents', mode, { durability: 'strict' });
            // Older WebViews that ignore the option are not admitted for writes.
            if (mode === 'readwrite' && tx.durability !== 'strict') { tx.abort(); failure(); return; }
            const store = tx.objectStore('intents');
            const request = mode === 'readonly' ? store.get(key)
              : value === undefined ? store.delete(key) : store.put(value, key);
            let result: string | null = null;
            request.onsuccess = () => {
              if (mode === 'readonly') {
                if (request.result !== undefined && typeof request.result !== 'string') { tx?.abort(); failure(); return; }
                result = request.result ?? null;
              }
            };
            tx.oncomplete = () => finish(undefined, result);
            tx.onabort = failure; tx.onerror = failure;
          } catch { failure(); }
        };
      } catch { failure(); }
    });
  }
}
