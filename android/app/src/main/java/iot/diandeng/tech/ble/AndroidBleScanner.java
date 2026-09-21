package iot.diandeng.tech.ble;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.os.SystemClock;
import java.util.ArrayList;
import java.util.List;
import java.util.LinkedHashMap;

// One physical scanner for Direct, tools and injected WiFiProv discovery.
// All state/SDK calls are serialized on the main looper; no account or protocol state.
@SuppressLint("MissingPermission")
public final class AndroidBleScanner {
    public interface Listener {
        void started();
        void result(ScanResult result);
        void ended(String error, long retryAfterMs);
    }
    private static AndroidBleScanner instance;
    public static synchronized AndroidBleScanner get(Context context) {
        if (instance == null) instance = new AndroidBleScanner(context.getApplicationContext());
        return instance;
    }
    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ScanBudget budget;
    private Run active;
    private boolean foreground = true;

    private AndroidBleScanner(Context context) {
        this.context = context;
        budget = new ScanBudget(new AndroidScanBudgetStore(context), SystemClock.elapsedRealtime());
    }

    public void start(String id, List<String> services, int durationMs, Listener listener) {
        main.post(() -> {
            if (!foreground) { listener.ended("BLE_SCAN_BACKGROUND", 0); return; }
            if (active != null) { listener.ended("BLE_SCAN_BUSY", 0); return; }
            if (id == null || id.length() > 96 || durationMs < 1 || durationMs > 30_000 || services.size() > 8) {
                listener.ended("BLE_SCAN_BUDGET_INVALID", 0); return;
            }
            try {
                BluetoothManager manager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
                BluetoothLeScanner scanner = manager == null || manager.getAdapter() == null
                    ? null : manager.getAdapter().getBluetoothLeScanner();
                if (scanner == null) { listener.ended("BLE_SCAN_UNAVAILABLE", 0); return; }
                List<ScanFilter> filters = new ArrayList<>();
                for (String service : services) filters.add(new ScanFilter.Builder().setServiceUuid(ParcelUuid.fromString(service)).build());
                long wait;
                try { wait = budget.reserve(SystemClock.elapsedRealtime()); }
                catch (RuntimeException e) { listener.ended("BLE_SCAN_BUDGET_STORAGE_FAILED", 0); return; }
                if (wait > 0) { listener.ended("BLE_SCAN_THROTTLED", wait); return; }
                Run run = new Run(id, scanner, listener);
                active = run;
                try {
                    scanner.startScan(filters, new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), run.callback);
                    main.postDelayed(run.expire, durationMs);
                    listener.started(); // Submitted, not proof of Android registration success.
                } catch (SecurityException e) { finish(run, "BLE_SCAN_PERMISSION", 0); }
                catch (RuntimeException e) { finish(run, "BLE_SCAN_FAILED", 0); }
            } catch (SecurityException e) { listener.ended("BLE_SCAN_PERMISSION", 0); }
            catch (RuntimeException e) { listener.ended("BLE_SCAN_FAILED", 0); }
        });
    }

    public void stop(String id, java.util.function.Consumer<Boolean> completed) {
        main.post(() -> completed.accept(active == null || !active.id.equals(id) || finish(active, "BLE_SCAN_CANCELLED", 0)));
    }

    public void foreground(boolean value) {
        main.post(() -> { foreground = value; if (!value && active != null) finish(active, "BLE_SCAN_BACKGROUND", 0); });
    }

    private boolean finish(Run run, String error, long retryAfterMs) {
        if (active != run) return true;
        main.removeCallbacks(run.expire);
        main.removeCallbacks(run.flush);
        synchronized (run.pending) { run.pending.clear(); }
        try { run.scanner.stopScan(run.callback); }
        catch (RuntimeException e) {
            // Fence unknown native ownership. Only another explicit close can release it.
            if (!run.failed) { run.failed = true; run.listener.ended("BLE_SCAN_CLOSE_FAILED", 0); }
            return false;
        }
        active = null;
        if (!run.failed) { run.failed = true; run.listener.ended(error, retryAfterMs); }
        return true;
    }

    private final class Run {
        final String id;
        final BluetoothLeScanner scanner;
        final Listener listener;
        boolean failed;
        final LinkedHashMap<String, ScanResult> pending = new LinkedHashMap<>();
        boolean flushScheduled;
        final Runnable flush = this::flushResults;
        private void flushResults() {
            List<ScanResult> results;
            synchronized (pending) { results = new ArrayList<>(pending.values()); pending.clear(); flushScheduled = false; }
            if (active == this && !failed) for (ScanResult result : results) listener.result(result);
        }
        final Runnable expire = () -> finish(this, "BLE_SCAN_DEADLINE", 0);
        final ScanCallback callback = new ScanCallback() {
            @Override public void onScanResult(int type, ScanResult result) {
                synchronized (pending) {
                    String address = result.getDevice().getAddress();
                    if (pending.containsKey(address) || pending.size() < 64) pending.put(address, result);
                    if (!flushScheduled) { flushScheduled = true; main.postDelayed(flush, 50); }
                }
            }
            @Override public void onScanFailed(int code) {
                main.post(() -> {
                    if (active != Run.this) return;
                    if (code == 6) {
                        try { budget.throttled(SystemClock.elapsedRealtime()); }
                        catch (RuntimeException e) { finish(Run.this, "BLE_SCAN_BUDGET_STORAGE_FAILED", 0); return; }
                    }
                    String error = switch (code) {
                        case 1 -> "BLE_SCAN_BUSY";
                        case 2 -> "BLE_SCAN_REGISTRATION_FAILED";
                        case 4 -> "BLE_SCAN_UNSUPPORTED";
                        case 5 -> "BLE_SCAN_RESOURCES";
                        case 6 -> "BLE_SCAN_THROTTLED";
                        default -> "BLE_SCAN_FAILED";
                    };
                    finish(Run.this, error, code == 6 ? 30_000 : 0);
                });
            }
        };
        Run(String id, BluetoothLeScanner scanner, Listener listener) { this.id = id; this.scanner = scanner; this.listener = listener; }
    }
}
