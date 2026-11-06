package iot.diandeng.tech.ble;

import android.bluetooth.le.ScanResult;
import com.wifiprov.capacitor.BleDiscovery;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import org.junit.Test;
import static org.junit.Assert.*;

public class WiFiProvDiscoveryTest {
    private static final class Run {
        final String id;
        final AndroidBleScanner.Listener listener;
        Run(String id, AndroidBleScanner.Listener listener) { this.id = id; this.listener = listener; }
    }
    private static final class FakeScanner implements WiFiProvDiscovery.ScanPort {
        final List<Run> runs = new ArrayList<>();
        final List<Consumer<Boolean>> completions = new ArrayList<>();
        public void start(String id, AndroidBleScanner.Listener listener) {
            runs.add(new Run(id, listener)); listener.started();
        }
        public void stop(String id, Consumer<Boolean> completed) { completions.add(completed); }
        void ended(int run, String error) { runs.get(run).listener.ended(error, 0); }
        void closed(int stop, boolean ok) { completions.get(stop).accept(ok); }
    }
    private static final class Observer implements BleDiscovery.Listener {
        final List<String> ended = new ArrayList<>();
        public void result(ScanResult result) { fail("This lifecycle test must not fabricate a discovery result"); }
        public void ended(String error) { ended.add(error); }
    }

    @Test public void ownerRequestedStopIsNormalAndCompletesAfterNativeClose() {
        FakeScanner scanner = new FakeScanner(); WiFiProvDiscovery discovery = new WiFiProvDiscovery(scanner);
        Observer observer = new Observer(); List<String> closed = new ArrayList<>();
        discovery.start("BLINKER_", observer); discovery.stop(closed::add);
        assertTrue(closed.isEmpty());
        scanner.ended(0, "BLE_SCAN_CANCELLED");
        assertEquals(1, observer.ended.size()); assertNull(observer.ended.get(0));
        assertTrue(closed.isEmpty());
        scanner.closed(0, true); assertEquals(1, closed.size()); assertNull(closed.get(0));
    }

    @Test public void idleStopDoesNotSpendAnotherNativeOperation() {
        FakeScanner scanner = new FakeScanner(); WiFiProvDiscovery discovery = new WiFiProvDiscovery(scanner);
        List<String> closed = new ArrayList<>(); discovery.stop(closed::add);
        assertTrue(scanner.runs.isEmpty()); assertTrue(scanner.completions.isEmpty());
        assertEquals(1, closed.size()); assertNull(closed.get(0));
    }

    @Test public void deadlineStillCompletesNormallyAndAllowsFreshDiscovery() {
        FakeScanner scanner = new FakeScanner(); WiFiProvDiscovery discovery = new WiFiProvDiscovery(scanner);
        Observer observer = new Observer(); discovery.start("BLINKER_", observer);
        scanner.ended(0, "BLE_SCAN_DEADLINE"); assertNull(observer.ended.get(0));
        discovery.start("BLINKER_", new Observer()); assertEquals(2, scanner.runs.size());
    }

    @Test public void unexpectedCancellationAndBackgroundRemainFailures() {
        FakeScanner scanner = new FakeScanner(); WiFiProvDiscovery discovery = new WiFiProvDiscovery(scanner);
        Observer unexpected = new Observer(); discovery.start("BLINKER_", unexpected);
        scanner.ended(0, "BLE_SCAN_CANCELLED"); assertEquals("BLE_SCAN_CANCELLED", unexpected.ended.get(0));
        Observer background = new Observer(); discovery.start("BLINKER_", background); discovery.stop(error -> {});
        scanner.ended(1, "BLE_SCAN_BACKGROUND"); assertEquals("BLE_SCAN_BACKGROUND", background.ended.get(0));
        scanner.closed(0, true);
    }

    @Test public void closeFailureKeepsOwnershipFencedUntilAnExplicitSuccessfulRetry() {
        FakeScanner scanner = new FakeScanner(); WiFiProvDiscovery discovery = new WiFiProvDiscovery(scanner);
        Observer observer = new Observer(); List<String> closed = new ArrayList<>();
        discovery.start("BLINKER_", observer); discovery.stop(closed::add);
        scanner.ended(0, "BLE_SCAN_CLOSE_FAILED"); scanner.closed(0, false);
        assertEquals("BLE_SCAN_CLOSE_FAILED", observer.ended.get(0));
        assertEquals("BLE_SCAN_CLOSE_FAILED", closed.get(0));
        Observer blocked = new Observer(); discovery.start("BLINKER_", blocked);
        assertEquals("BLE_SCAN_BUSY", blocked.ended.get(0)); assertEquals(1, scanner.runs.size());
        discovery.stop(closed::add); scanner.ended(0, "BLE_SCAN_CANCELLED"); scanner.closed(1, true);
        assertNull(observer.ended.get(1)); assertNull(closed.get(1));
        discovery.start("BLINKER_", new Observer()); assertEquals(2, scanner.runs.size());
    }

    @Test public void lateStopCompletionCannotReleaseTheNextOwner() {
        FakeScanner scanner = new FakeScanner(); WiFiProvDiscovery discovery = new WiFiProvDiscovery(scanner);
        Observer first = new Observer(); discovery.start("BLINKER_", first); discovery.stop(error -> {});
        scanner.ended(0, "BLE_SCAN_CANCELLED"); assertNull(first.ended.get(0));
        discovery.start("BLINKER_", new Observer()); scanner.closed(0, true);
        Observer blocked = new Observer(); discovery.start("BLINKER_", blocked);
        assertEquals("BLE_SCAN_BUSY", blocked.ended.get(0)); assertEquals(2, scanner.runs.size());
    }

    @Test public void lateEndedCallbackCannotChangeTheNextOwner() {
        FakeScanner scanner = new FakeScanner(); WiFiProvDiscovery discovery = new WiFiProvDiscovery(scanner);
        Observer first = new Observer(); discovery.start("BLINKER_", first); scanner.ended(0, "BLE_SCAN_DEADLINE");
        discovery.start("BLINKER_", new Observer()); scanner.ended(0, "BLE_SCAN_CANCELLED");
        Observer blocked = new Observer(); discovery.start("BLINKER_", blocked);
        assertEquals("BLE_SCAN_BUSY", blocked.ended.get(0)); assertEquals(1, first.ended.size());
    }

    @Test public void failedStopCompletionDoesNotTurnALaterUnexpectedCancellationIntoSuccess() {
        FakeScanner scanner = new FakeScanner(); WiFiProvDiscovery discovery = new WiFiProvDiscovery(scanner);
        Observer observer = new Observer(); discovery.start("BLINKER_", observer); discovery.stop(error -> {});
        scanner.closed(0, false);
        Observer blocked = new Observer(); discovery.start("BLINKER_", blocked);
        assertEquals("BLE_SCAN_BUSY", blocked.ended.get(0));
        scanner.ended(0, "BLE_SCAN_CANCELLED"); assertEquals("BLE_SCAN_CANCELLED", observer.ended.get(0));
    }
}
