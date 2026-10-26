package com.capacitorjs.plugins.geolocation;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

public class CurrentPositionRequestTest {
    private static final class Clock implements CurrentPositionRequest.Scheduler {
        final AtomicLong now = new AtomicLong(1000);
        final List<String> order = new ArrayList<>();
        Runnable pending;
        long delay;
        int removed;
        public void postDelayed(Runnable task, long delayMillis) {
            assertNull(pending);
            pending = task;
            delay = delayMillis;
        }
        public void remove(Runnable task) {
            order.add("remove");
            removed++;
            if (pending == task) pending = null;
        }
        void fire() {
            Runnable task = pending;
            assertNotNull(task);
            pending = null;
            task.run();
        }
    }

    @Test public void stalledRequestExpiresAndCancelsBeforeItsOnlyTerminal() {
        Clock clock = new Clock();
        AtomicInteger timeouts = new AtomicInteger(), cancellations = new AtomicInteger();
        CurrentPositionRequest request = new CurrentPositionRequest(100, clock.now::get, clock,
            () -> { clock.order.add("timeout"); timeouts.incrementAndGet(); });
        request.linkCancellation(() -> { clock.order.add("cancel"); cancellations.incrementAndGet(); });
        assertEquals(100, clock.delay);
        clock.now.set(1100);
        clock.fire();
        assertEquals(List.of("remove", "cancel", "timeout"), clock.order);
        assertFalse(request.isActive());
        assertFalse(request.complete(() -> fail("Late success")));
        request.cancel(() -> fail("Second terminal"));
        assertEquals(1, timeouts.get());
        assertEquals(1, cancellations.get());
        assertEquals(1, clock.removed);
        assertNull(clock.pending);
    }

    @Test public void firstResultWinsAndLateSuccessFailureOrTimeoutCannotReturnAgain() {
        Clock clock = new Clock();
        AtomicInteger terminals = new AtomicInteger(), cancellations = new AtomicInteger();
        CurrentPositionRequest request = new CurrentPositionRequest(100, clock.now::get, clock,
            () -> fail("Timeout after success"));
        Runnable alreadyQueuedDeadline = clock.pending;
        request.linkCancellation(cancellations::incrementAndGet);
        assertTrue(request.complete(terminals::incrementAndGet));
        assertFalse(request.complete(() -> fail("Late failure")));
        alreadyQueuedDeadline.run();
        assertEquals(1, terminals.get());
        assertEquals(1, cancellations.get());
        assertEquals(1, clock.removed);
    }

    @Test public void explicitCancelWinsEvenWhenItsTimerHasNotRunPastTheDeadline() {
        Clock clock = new Clock();
        AtomicInteger cancellations = new AtomicInteger(), terminals = new AtomicInteger();
        CurrentPositionRequest request = new CurrentPositionRequest(100, clock.now::get, clock,
            () -> fail("Explicit cancellation is not a timeout"));
        request.linkCancellation(cancellations::incrementAndGet);
        clock.now.set(1200);
        request.cancel(terminals::incrementAndGet);
        assertFalse(request.complete(() -> fail("Success after cancellation")));
        request.cancel(() -> fail("Repeated cancellation terminal"));
        assertEquals(1, terminals.get());
        assertEquals(1, cancellations.get());
        assertNull(clock.pending);
    }

    @Test public void cancellationLinkedAfterTerminalIsInvokedImmediatelyWithoutNewTerminal() {
        Clock clock = new Clock();
        AtomicInteger cancellations = new AtomicInteger(), terminals = new AtomicInteger();
        CurrentPositionRequest request = new CurrentPositionRequest(100, clock.now::get, clock,
            () -> fail("Unexpected timeout"));
        assertTrue(request.complete(terminals::incrementAndGet));
        request.linkCancellation(cancellations::incrementAndGet);
        assertEquals(1, terminals.get());
        assertEquals(1, cancellations.get());
        assertEquals(1, clock.removed);
    }

    @Test public void overdueSuccessBeforeSuspendedTimerIsTimeoutNotPosition() {
        Clock clock = new Clock();
        AtomicInteger timeouts = new AtomicInteger(), cancellations = new AtomicInteger();
        CurrentPositionRequest request = new CurrentPositionRequest(100, clock.now::get, clock,
            timeouts::incrementAndGet);
        request.linkCancellation(cancellations::incrementAndGet);
        clock.now.set(1100);
        assertFalse(request.complete(() -> fail("Overdue position must not reach JS")));
        assertEquals(1, timeouts.get());
        assertEquals(1, cancellations.get());
        assertNull(clock.pending);
    }

    @Test public void latePermissionCallbackCannotStartAnotherNativeTask() {
        Clock clock = new Clock();
        AtomicInteger timeouts = new AtomicInteger(), starts = new AtomicInteger(), cancellations = new AtomicInteger();
        CurrentPositionRequest request = new CurrentPositionRequest(100, clock.now::get, clock,
            timeouts::incrementAndGet);
        clock.now.set(1101);
        if (request.isActive()) starts.incrementAndGet();
        request.linkCancellation(cancellations::incrementAndGet);
        assertEquals(0, starts.get());
        assertEquals(1, timeouts.get());
        assertEquals(1, cancellations.get());
        assertFalse(request.isActive());
        assertEquals(1, timeouts.get());
    }

    @Test public void cancellationCallbackMayReenterWithoutClaimingASecondTerminal() {
        Clock clock = new Clock();
        AtomicInteger terminals = new AtomicInteger();
        CurrentPositionRequest request = new CurrentPositionRequest(100, clock.now::get, clock,
            () -> fail("Unexpected timeout"));
        request.linkCancellation(() -> {
            assertFalse(request.isActive());
            assertFalse(request.complete(() -> fail("Reentrant result")));
        });
        assertTrue(request.complete(terminals::incrementAndGet));
        assertEquals(1, terminals.get());
    }

    @Test public void cleanupFailureDoesNotLoseTheOnlyTerminalCallback() {
        Clock clock = new Clock();
        AtomicInteger terminals = new AtomicInteger();
        CurrentPositionRequest request = new CurrentPositionRequest(100, clock.now::get, clock,
            () -> fail("Unexpected timeout"));
        request.linkCancellation(() -> { throw new IllegalStateException("Cancellation failed"); });
        assertThrows(IllegalStateException.class, () -> request.cancel(terminals::incrementAndGet));
        assertEquals(1, terminals.get());
        assertFalse(request.isActive());
        assertNull(clock.pending);
    }
}
