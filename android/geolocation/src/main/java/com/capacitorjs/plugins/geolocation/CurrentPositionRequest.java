package com.capacitorjs.plugins.geolocation;

import java.util.Objects;
import java.util.function.LongSupplier;

/** One native position request owns one deadline, cancellation and terminal callback. */
public final class CurrentPositionRequest {
    public interface Scheduler {
        void postDelayed(Runnable task, long delayMillis);
        void remove(Runnable task);
    }

    private final LongSupplier clock;
    private final Scheduler scheduler;
    private final Runnable onTimeout;
    private final Runnable deadline;
    private final long expiresAt;
    private boolean active = true;
    private Runnable cancellation;

    public CurrentPositionRequest(long timeoutMillis, LongSupplier clock,
                                  Scheduler scheduler, Runnable onTimeout) {
        if (timeoutMillis <= 0) throw new IllegalArgumentException("Positive timeout required");
        this.clock = Objects.requireNonNull(clock);
        this.scheduler = Objects.requireNonNull(scheduler);
        this.onTimeout = Objects.requireNonNull(onTimeout);
        this.expiresAt = Math.addExact(clock.getAsLong(), timeoutMillis);
        this.deadline = () -> finish(this.onTimeout, false);
        scheduler.postDelayed(deadline, timeoutMillis);
    }

    /** A success or failure arriving at/after the deadline becomes the one timeout instead. */
    public boolean complete(Runnable terminal) {
        return finish(Objects.requireNonNull(terminal), true);
    }

    /** Explicit cancellation wins if no terminal callback has already claimed this request. */
    public void cancel(Runnable terminal) {
        finish(Objects.requireNonNull(terminal), false);
    }

    public void linkCancellation(Runnable cancel) {
        Objects.requireNonNull(cancel);
        isActive();
        synchronized (this) {
            if (active) {
                if (cancellation != null) throw new IllegalStateException("Cancellation already linked");
                cancellation = cancel;
                return;
            }
        }
        cancel.run();
    }

    /** Also retires a permission/settings callback that arrives after a suspended deadline. */
    public boolean isActive() {
        synchronized (this) {
            if (!active) return false;
            if (clock.getAsLong() < expiresAt) return true;
        }
        finish(onTimeout, false);
        return false;
    }

    private boolean finish(Runnable terminal, boolean respectDeadline) {
        final Runnable cancel;
        final boolean expired;
        synchronized (this) {
            if (!active) return false;
            expired = respectDeadline && clock.getAsLong() >= expiresAt;
            active = false;
            cancel = cancellation;
            cancellation = null;
        }
        try {
            scheduler.remove(deadline);
        } finally {
            try {
                if (cancel != null) cancel.run();
            } finally {
                (expired ? onTimeout : terminal).run();
            }
        }
        return !expired;
    }
}
