package iot.diandeng.tech.ble;

import org.junit.Test;
import static org.junit.Assert.*;

public class ScanBudgetTest {
    private static class Memory implements ScanBudget.Store {
        long[] snapshot;
        boolean fail;
        public long[] read() { return snapshot; }
        public void write(long[] value) { if (fail) throw new IllegalStateException(); snapshot = value.clone(); }
    }
    @Test public void sixthStartHasExplicitRemainingWaitAndWindowBoundaryRecovers() {
        ScanBudget budget = new ScanBudget();
        for (int i = 0; i < 5; ++i) assertEquals(0, budget.reserve(100 + i));
        assertEquals(29_995, budget.reserve(105));
        assertEquals(1, budget.reserve(30_099));
        assertEquals(0, budget.reserve(30_100));
        assertEquals(1, budget.reserve(30_100));
    }
    @Test public void vendorFailureCanBeStricterThanTheLocalBudget() {
        ScanBudget budget = new ScanBudget();
        assertEquals(0, budget.reserve(0)); budget.throttled(100);
        assertEquals(30_000, budget.reserve(100));
        assertEquals(0, budget.reserve(30_100));
    }
    @Test public void processRestartDoesNotRefundTheFivePhysicalAttempts() {
        Memory memory = new Memory(); ScanBudget before = new ScanBudget(memory, 100);
        for (int i = 0; i < 5; ++i) assertEquals(0, before.reserve(100 + i));
        ScanBudget after = new ScanBudget(memory, 1000);
        assertEquals(29_100, after.reserve(1000));
        assertEquals(0, after.reserve(30_100));
        assertEquals(1, new ScanBudget(memory, 30_100).reserve(30_100));
    }
    @Test public void vendorCooldownPersistsEvenWithUnusedLocalAttempts() {
        Memory memory = new Memory(); ScanBudget budget = new ScanBudget(memory, 10);
        budget.reserve(10); budget.throttled(20);
        assertEquals(29_920, new ScanBudget(memory, 100).reserve(100));
        assertEquals(0, new ScanBudget(memory, 30_020).reserve(30_020));
    }
    @Test public void expiredHistoryAndNewBootCanStartWithoutArtificialWaiting() {
        Memory memory = new Memory(); ScanBudget before = new ScanBudget(memory, 0);
        for (int i = 0; i < 5; ++i) before.reserve(i);
        assertEquals(0, new ScanBudget(memory, 31_000).reserve(31_000));
        memory.snapshot = null; // Android store identifies a different boot count.
        assertEquals(0, new ScanBudget(memory, 2).reserve(2));
    }
    @Test public void corruptOrRolledBackHistoryGetsBoundedCooldownNotFreeAttempts() {
        long[][] invalid = { {}, {200, 0, 100}, {100, 90000}, {100, 0, 80, 70}, {100, 0, -1}, {100, 0, 101} };
        for (long[] history : invalid) {
            Memory memory = new Memory(); memory.snapshot = history;
            ScanBudget budget = new ScanBudget(memory, 100);
            assertEquals(30_000, budget.reserve(100));
            assertEquals(0, budget.reserve(30_100));
        }
    }
    @Test public void commitFailureCannotAdmitAnUnrecordedSdkStartOrSpendAnAttempt() {
        Memory memory = new Memory(); ScanBudget budget = new ScanBudget(memory, 100);
        memory.fail = true;
        assertThrows(IllegalStateException.class, () -> budget.reserve(100));
        memory.fail = false;
        for (int i = 0; i < 5; ++i) assertEquals(0, budget.reserve(101 + i));
        assertEquals(29_995, budget.reserve(106));
    }
}
