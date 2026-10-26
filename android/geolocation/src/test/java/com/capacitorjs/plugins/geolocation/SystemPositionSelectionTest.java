package com.capacitorjs.plugins.geolocation;

import org.junit.Test;
import static org.junit.Assert.*;
import static com.capacitorjs.plugins.geolocation.SystemPositionSelection.*;

public class SystemPositionSelectionTest {
    private static final long START = 10_000_000_000L;
    private static final long NOW = START + 500_000_000L;

    private static Decision fix(SystemPositionSelection policy, int provider, long measured) {
        return policy.result(provider, true, 31.0, 121.0, true, 25.0, 1000, measured, NOW);
    }

    @Test public void firstFreshNetworkResultWinsWithoutWaitingForGnssUpgrade() {
        SystemPositionSelection policy = new SystemPositionSelection(NETWORK | GNSS, START, 0);
        assertEquals(Decision.ACCEPT, fix(policy, NETWORK, NOW));
        assertEquals(Decision.IGNORE, fix(policy, GNSS, NOW));
        assertEquals(Decision.IGNORE, fix(policy, NETWORK, NOW));
    }

    @Test public void networkNullDoesNotFailTheStillPendingGnss() {
        SystemPositionSelection policy = new SystemPositionSelection(NETWORK | GNSS, START, 0);
        assertEquals(Decision.WAIT, policy.result(NETWORK, false, 0, 0, false, 0, 0, 0, NOW));
        assertEquals(Decision.ACCEPT, fix(policy, GNSS, NOW));
    }

    @Test public void maximumAgeZeroIgnoresOldFixWithinTheSameRegistration() {
        SystemPositionSelection policy = new SystemPositionSelection(NETWORK | GNSS, START, 0);
        assertEquals(Decision.WAIT, fix(policy, NETWORK, START - 1));
        assertEquals(Decision.WAIT, fix(policy, GNSS, START - 1));
        assertEquals(Decision.ACCEPT, fix(policy, NETWORK, NOW));
    }

    @Test public void configuredCacheAgeUsesMonotonicMeasurementTime() {
        assertEquals(Decision.ACCEPT, fix(new SystemPositionSelection(NETWORK, START, 1000), NETWORK, NOW - 1_000_000_000L));
        assertEquals(Decision.WAIT, fix(new SystemPositionSelection(NETWORK, START, 1000), NETWORK, NOW - 1_000_000_001L));
        assertEquals(Decision.WAIT, fix(new SystemPositionSelection(NETWORK, START, 0), NETWORK, NOW + 1));
    }

    @Test public void invalidCoordinatesAccuracyOrTimeCannotBecomePosition() {
        double[][] invalid = {
            {Double.NaN, 121, 25}, {91, 121, 25}, {31, -181, 25},
            {31, Double.POSITIVE_INFINITY, 25}, {31, 121, -1}, {31, 121, Double.NaN}
        };
        for (double[] value : invalid) {
            SystemPositionSelection policy = new SystemPositionSelection(GNSS, START, 0);
            assertEquals(Decision.WAIT, policy.result(GNSS, true, value[0], value[1], true, value[2], 1000, NOW, NOW));
        }
        assertEquals(Decision.WAIT, new SystemPositionSelection(GNSS, START, 0)
            .result(GNSS, true, 31, 121, false, 0, 1000, NOW, NOW));
        assertEquals(Decision.WAIT, new SystemPositionSelection(GNSS, START, 0)
            .result(GNSS, true, 31, 121, true, 25, 0, NOW, NOW));
        assertEquals(Decision.WAIT, new SystemPositionSelection(GNSS, START, 0)
            .result(GNSS, true, 31, 121, true, 25, 1000, 0, NOW));
    }

    @Test public void allProvidersEndingWithoutAValidFixReturnsUnavailableOnce() {
        SystemPositionSelection policy = new SystemPositionSelection(NETWORK | GNSS, START, 0);
        assertEquals(Decision.WAIT, policy.result(NETWORK, false, 0, 0, false, 0, 0, 0, NOW));
        assertEquals(Decision.IGNORE, fix(policy, NETWORK, NOW));
        assertEquals(Decision.UNAVAILABLE, policy.result(GNSS, false, 0, 0, false, 0, 0, 0, NOW));
        assertEquals(Decision.IGNORE, fix(policy, GNSS, NOW));
    }

    @Test public void cancelledOwnerAndUnrequestedProviderCannotReturnAnything() {
        SystemPositionSelection coarseOnly = new SystemPositionSelection(NETWORK, START, 0);
        assertEquals(Decision.IGNORE, fix(coarseOnly, GNSS, NOW));
        coarseOnly.cancel();
        assertEquals(Decision.IGNORE, fix(coarseOnly, NETWORK, NOW));
        assertEquals(Decision.IGNORE, fix(new SystemPositionSelection(0, START, 0), NETWORK, NOW));
    }
}
