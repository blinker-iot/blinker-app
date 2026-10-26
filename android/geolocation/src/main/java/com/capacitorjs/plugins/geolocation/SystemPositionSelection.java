package com.capacitorjs.plugins.geolocation;

/** Pure selection policy; the request owner alone controls its deadline and terminal callback. */
public final class SystemPositionSelection {
    public static final int NETWORK = 1;
    public static final int GNSS = 2;

    public enum Decision { IGNORE, WAIT, ACCEPT, UNAVAILABLE }

    private final long startedNanos;
    private final long maximumAgeNanos;
    private int pending;
    private boolean finished;

    public SystemPositionSelection(int providers, long startedNanos, long maximumAgeMillis) {
        if ((providers & ~(NETWORK | GNSS)) != 0 || startedNanos <= 0 || maximumAgeMillis < 0) {
            throw new IllegalArgumentException("Invalid system position policy");
        }
        this.pending = providers;
        this.startedNanos = startedNanos;
        this.maximumAgeNanos = maximumAgeMillis > Long.MAX_VALUE / 1_000_000
            ? Long.MAX_VALUE : maximumAgeMillis * 1_000_000;
        this.finished = providers == 0;
    }

    /** Invalid fixes are ignored in the same registration; a null/error retires that provider. */
    public synchronized Decision result(int provider, boolean hasPosition,
                                        double latitude, double longitude,
                                        boolean hasAccuracy, double accuracy,
                                        long timestampMillis, long fixElapsedNanos, long nowNanos) {
        if (finished || (provider != NETWORK && provider != GNSS) || (pending & provider) == 0) {
            return Decision.IGNORE;
        }
        if (hasPosition && valid(latitude, longitude, hasAccuracy, accuracy,
                                 timestampMillis, fixElapsedNanos, nowNanos)) {
            finished = true;
            return Decision.ACCEPT;
        }
        if (hasPosition) return Decision.WAIT;
        pending &= ~provider;
        if (pending == 0) {
            finished = true;
            return Decision.UNAVAILABLE;
        }
        return Decision.WAIT;
    }

    public synchronized void cancel() {
        finished = true;
        pending = 0;
    }

    private boolean valid(double latitude, double longitude, boolean hasAccuracy, double accuracy,
                          long timestampMillis, long fixElapsedNanos, long nowNanos) {
        if (!Double.isFinite(latitude) || latitude < -90 || latitude > 90 ||
            !Double.isFinite(longitude) || longitude < -180 || longitude > 180 ||
            !hasAccuracy || !Double.isFinite(accuracy) || accuracy < 0 || timestampMillis <= 0 ||
            fixElapsedNanos <= 0 || nowNanos < startedNanos || fixElapsedNanos > nowNanos) {
            return false;
        }
        // Age is measured only by Android's monotonic clock, not a changeable wall clock.
        // maximumAge=0 explicitly means measured during this request, never a cached fix.
        return maximumAgeNanos == 0
            ? fixElapsedNanos >= startedNanos
            : nowNanos - fixElapsedNanos <= maximumAgeNanos;
    }
}
