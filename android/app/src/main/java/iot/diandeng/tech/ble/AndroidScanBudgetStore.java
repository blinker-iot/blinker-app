package iot.diandeng.tech.ble;

import android.content.Context;
import android.content.SharedPreferences;
import android.provider.Settings;

// A few timestamps only. Independent of login, discovery identity and secrets.
final class AndroidScanBudgetStore implements ScanBudget.Store {
    private final SharedPreferences preferences;
    private final int boot;

    AndroidScanBudgetStore(Context context) {
        preferences = context.getSharedPreferences("blinker.scan-budget", Context.MODE_PRIVATE);
        int current;
        try { current = Settings.Global.getInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, -1); }
        catch (RuntimeException e) { current = -1; }
        boot = current;
    }

    public long[] read() {
        int savedBoot = preferences.getInt("boot", -1);
        if (boot >= 0 && savedBoot >= 0 && boot != savedBoot) return null;
        String encoded = preferences.getString("history", null);
        if (encoded == null) return null;
        if (encoded.length() > 160) return new long[0];
        String[] parts = encoded.split(",", -1);
        if (parts.length < 2 || parts.length > 7) return new long[0];
        try {
            long[] values = new long[parts.length];
            for (int i = 0; i < values.length; ++i) values[i] = Long.parseLong(parts[i]);
            return values;
        } catch (NumberFormatException e) { return new long[0]; }
    }

    public void write(long[] snapshot) {
        StringBuilder encoded = new StringBuilder();
        for (long value : snapshot) { if (encoded.length() > 0) encoded.append(','); encoded.append(value); }
        // apply() could be lost when killed immediately after startScan().
        if (!preferences.edit().putInt("boot", boot).putString("history", encoded.toString()).commit()) {
            throw new IllegalStateException("BLE_SCAN_BUDGET_STORAGE_FAILED");
        }
    }
}
