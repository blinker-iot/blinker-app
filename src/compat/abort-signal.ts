// Older Android WebViews lack this method, although AbortController is present.
export function installAbortSignalCompatibility(): void {
if (typeof AbortSignal !== 'undefined' &&
    typeof AbortSignal.prototype.throwIfAborted !== 'function') {
  Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', {
    configurable: true,
    writable: true,
    value: function throwIfAborted(this: AbortSignal): void {
      if (this.aborted) {
        throw 'reason' in this ? this.reason : new DOMException('The operation was aborted.', 'AbortError');
      }
    },
  });
}
}

installAbortSignalCompatibility();
