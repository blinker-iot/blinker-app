package iot.diandeng.tech.ble;

import android.bluetooth.le.ScanResult;
import android.content.Context;
import com.wifiprov.capacitor.BleDiscovery;
import java.util.Collections;
import java.util.UUID;

// Only the scan port changes; the WiFiProv SDK still owns Security1 and GATT.
public final class WiFiProvDiscovery implements BleDiscovery {
    private final AndroidBleScanner scanner;
    private String active;
    public WiFiProvDiscovery(Context context) { scanner = AndroidBleScanner.get(context); }

    public synchronized void start(String prefix, BleDiscovery.Listener listener) {
        if (active != null) { listener.ended("BLE_SCAN_BUSY"); return; }
        String id = UUID.randomUUID().toString(); active = id;
        scanner.start(id, Collections.emptyList(), 10_000, new AndroidBleScanner.Listener() {
            public void started() {}
            public void result(ScanResult value) {
                synchronized (WiFiProvDiscovery.this) {
                    if (!id.equals(active)) return;
                    String name = value.getScanRecord() == null ? null : value.getScanRecord().getDeviceName();
                    if (name != null && name.startsWith(prefix)) listener.result(value);
                }
            }
            public void ended(String error, long retryAfterMs) {
                synchronized (WiFiProvDiscovery.this) {
                    if (!id.equals(active)) return;
                    if (!"BLE_SCAN_CLOSE_FAILED".equals(error)) active = null;
                    listener.ended("BLE_SCAN_DEADLINE".equals(error) ? null : error);
                }
            }
        });
    }

    public synchronized void stop(BleDiscovery.Completion completed) {
        String id = active;
        if (id == null) { completed.complete(null); return; }
        // Completion and any pending createDevice settle only after native stop.
        scanner.stop(id, ok -> {
            synchronized (WiFiProvDiscovery.this) { if (ok && id.equals(active)) active = null; }
            completed.complete(ok ? null : "BLE_SCAN_CLOSE_FAILED");
        });
    }
}
