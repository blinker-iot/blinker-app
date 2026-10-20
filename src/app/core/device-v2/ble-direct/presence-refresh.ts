interface RefreshScope {
  key: string;
  ids: readonly string[];
  abort: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  work?: Promise<void>;
}

// Foreground demand only. Radio ownership and the native start quota belong to
// the existing scanner; this loop neither opens links nor refunds that quota.
export class BlePresenceRefresh {
  private scope?: RefreshScope;
  private retirement: Promise<void> = Promise.resolve();

  constructor(
    private readonly refresh: (ids: readonly string[], signal: AbortSignal) => Promise<void>,
    private readonly now = () => performance.now(),
  ) {}

  setDemand(context: string | undefined, logicalDeviceIds: readonly string[]): void {
    const ids = [...new Set(logicalDeviceIds.filter(id => id.length > 0))].sort();
    const key = context && ids.length ? `${context}\0${ids.join('\0')}` : undefined;
    if (key === this.scope?.key) return;
    this.close();
    if (!key) return;
    const scope: RefreshScope = { key, ids, abort: new AbortController() };
    this.scope = scope;
    scope.work = this.run(scope);
  }

  close(): void {
    const scope = this.scope;
    this.scope = undefined;
    if (!scope) return;
    clearTimeout(scope.timer);
    scope.abort.abort();
    // A new lifetime cannot start before the old observer has drained native
    // cleanup. Failed cleanup remains fenced by ScanCoordinator itself.
    this.retirement = Promise.all([this.retirement, scope.work]).then(() => undefined);
  }

  private async run(scope: RefreshScope): Promise<void> {
    await this.retirement;
    if (this.scope !== scope || scope.abort.signal.aborted) return;
    let nextStart = this.now() + 10_000;
    try {
      await this.refresh(scope.ids, scope.abort.signal);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      // Permission/radio/background failure is not device absence. Wait for a
      // new visible lifetime (or adapter transition), not repeated prompts.
      if (['BLE_SCAN_PERMISSION', 'BLE_SCAN_UNAVAILABLE', 'BLE_SCAN_UNSUPPORTED',
        'BLE_SCAN_BACKGROUND', 'BLE_SCAN_CLOSE_FAILED'].includes(code)) return;
      if (code === 'BLE_SCAN_THROTTLED') {
        const retry = (error as Error & { retryAfterMs?: number }).retryAfterMs;
        nextStart = Math.max(nextStart, this.now() + (Number.isFinite(retry) && retry! > 0 ? retry! : 30_000));
      }
    }
    if (this.scope !== scope || scope.abort.signal.aborted) return;
    // Normal starts are at least ten seconds apart; a native cool-down is
    // measured from the rejection, so elapsed work never shortens it.
    const wait = Math.max(0, nextStart - this.now());
    scope.timer = setTimeout(() => {
      scope.timer = undefined;
      scope.work = this.run(scope);
    }, wait);
  }
}
