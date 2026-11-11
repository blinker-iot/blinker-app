export interface WiFiProvCloudLease {
  /** Caller supplies the existing, matching native close/death operation. */
  retire(close: () => Promise<void>): Promise<void>;
}

const busy = () => Object.assign(Error('A Local provisioning owner still holds the Cloud boundary'),
  { code: 'WIFIPROV_CLOUD_BOUNDARY_BUSY' });

/** Single Local owner. Time, visibility and network readiness cannot release it. */
export class WiFiProvCloudBoundary {
  private owner?: object;
  private readonly listeners = new Set<(blocked: boolean) => void>();

  get blocked(): boolean { return this.owner !== undefined; }

  subscribe(listener: (blocked: boolean) => void): () => void {
    this.listeners.add(listener);
    this.notify(listener);
    return () => this.listeners.delete(listener);
  }

  enter(): WiFiProvCloudLease {
    if (this.blocked) throw busy();
    const owner = {};
    this.owner = owner;
    this.publish();
    let retired = false;
    let retiring: Promise<void> | undefined;
    return {
      retire: (close) => {
        if (retired) return Promise.resolve(); // Never release a later owner.
        if (this.owner !== owner) return Promise.reject(busy());
        if (retiring) return retiring;
        if (typeof close !== 'function') return Promise.reject(busy());
        const task = Promise.resolve().then(close).then(() => {
          if (this.owner !== owner) throw busy();
          retired = true;
          this.owner = undefined;
          this.publish();
        }).finally(() => {
          if (retiring === task) retiring = undefined;
        });
        retiring = task;
        // Failure retains ownership. Only another explicit retire call may retry close.
        return task;
      },
    };
  }

  private publish(): void { for (const listener of [...this.listeners]) this.notify(listener); }
  private notify(listener: (blocked: boolean) => void): void {
    try { listener(this.blocked); } catch { /* A consumer cannot change ownership. */ }
  }
}

export const wiFiProvCloudBoundary = new WiFiProvCloudBoundary();
