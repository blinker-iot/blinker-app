// An optional optimization, not a readiness or authentication prerequisite.
// No native Promise is awaited by the record/control path. A missing response
// ends the hint early; the full window is also bounded if bootstrap stalls.
export const BLE_PRIORITY_RESPONSE_BUDGET_MS = 250;
export const BLE_BOOTSTRAP_PRIORITY_WINDOW_MS = 5_000;

export interface BleBootstrapPriorityWindow {
  finish(): void;
  cancel(): void;
}

export function startBleBootstrapPriority(
  request: (priority: 0 | 1) => Promise<void>,
  isCurrent: () => boolean,
): BleBootstrapPriorityWindow {
  let ended = false;
  let responseTimer: ReturnType<typeof setTimeout> | undefined;
  let windowTimer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    ended = true;
    clearTimeout(responseTimer);
    clearTimeout(windowTimer);
  };
  const finish = () => {
    if (ended) return;
    cancel();
    if (!isCurrent()) return;
    // Independent of the HIGH Promise: an unsettled bridge response must not
    // prevent restoring BALANCED. There is no retry or late follow-up request.
    try { void request(0).catch(() => undefined); } catch { /* Best effort. */ }
  };
  const window = { finish, cancel };
  if (!isCurrent()) {
    cancel();
    return window;
  }
  responseTimer = setTimeout(finish, BLE_PRIORITY_RESPONSE_BUDGET_MS);
  windowTimer = setTimeout(finish, BLE_BOOTSTRAP_PRIORITY_WINDOW_MS);
  try {
    void request(1).then(() => {
      // A late response cannot restart the window or act on a successor link.
      if (!ended) clearTimeout(responseTimer);
    }, finish);
  } catch { finish(); }
  return window;
}
