package iot.diandeng.tech.ble;

import java.util.ArrayDeque;

// Monotonic accounting across processes in one boot. No account/device data.
// The platform can still impose a stricter quota without reporting a callback.
final class ScanBudget {
    interface Store {
        long[] read(); // null = no history/new boot; empty = unreadable history.
        void write(long[] snapshot); // Must commit before the physical attempt.
    }
    private static final long WINDOW = 30_000;
    private final ArrayDeque<Long> starts = new ArrayDeque<>(5);
    private final Store store;
    private long coolingUntil;

    ScanBudget() { this(null, 0); }

    ScanBudget(Store store, long now) {
        this.store = store;
        if (store == null) return;
        long[] saved;
        try { saved = store.read(); } catch (RuntimeException e) { saved = new long[0]; }
        if (saved == null) return;
        boolean valid = saved.length >= 2 && saved.length <= 7
            && saved[0] >= 0 && saved[0] <= now && saved[1] >= 0 && saved[1] - saved[0] <= WINDOW;
        for (int i = 2; valid && i < saved.length; ++i) {
            valid = saved[i] >= 0 && saved[i] <= saved[0] && (i == 2 || saved[i] >= saved[i - 1]);
        }
        if (!valid) { coolingUntil = now + WINDOW; return; }
        coolingUntil = saved[1];
        for (int i = 2; i < saved.length; ++i) starts.addLast(saved[i]);
    }

    long reserve(long now) {
        while (!starts.isEmpty() && now - starts.peekFirst() >= WINDOW) starts.removeFirst();
        long wait = Math.max(0, coolingUntil - now);
        if (starts.size() == 5) wait = Math.max(wait, starts.peekFirst() + WINDOW - now);
        if (wait == 0) {
            starts.addLast(now);
            try { save(now); }
            catch (RuntimeException e) { starts.removeLast(); throw e; } // No SDK attempt occurred.
        }
        return wait;
    }

    void throttled(long now) { coolingUntil = Math.max(coolingUntil, now + WINDOW); save(now); }

    private void save(long now) {
        if (store == null) return;
        long[] snapshot = new long[starts.size() + 2];
        snapshot[0] = now; snapshot[1] = coolingUntil;
        int i = 2; for (long start : starts) snapshot[i++] = start;
        store.write(snapshot);
    }
}
