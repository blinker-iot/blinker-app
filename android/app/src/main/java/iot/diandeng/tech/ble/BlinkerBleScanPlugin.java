package iot.diandeng.tech.ble;

import android.bluetooth.le.ScanResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "BlinkerBleScan")
public class BlinkerBleScanPlugin extends Plugin {
    @PluginMethod public void start(PluginCall call) {
        String id = call.getString("id");
        List<String> services = new ArrayList<>();
        try {
            JSArray input = call.getArray("services", new JSArray());
            for (int i = 0; i < input.length(); ++i) services.add(input.getString(i));
        } catch (Exception e) { call.reject("BLE_SCAN_FILTER_INVALID"); return; }
        AndroidBleScanner.get(getContext()).start(id, services, 30_000, new AndroidBleScanner.Listener() {
            boolean submitted;
            public void started() { submitted = true; call.resolve(); }
            public void result(ScanResult value) {
                JSObject event = new JSObject(); event.put("id", id); event.put("result", encode(value));
                notifyListeners("scan", event);
            }
            public void ended(String error, long retryAfterMs) {
                if (error != null) {
                    JSObject event = new JSObject(); event.put("id", id); event.put("error", error); event.put("retryAfterMs", retryAfterMs);
                    notifyListeners("scan", event);
                    if (!submitted) call.reject(error);
                }
            }
        });
    }
    @PluginMethod public void stop(PluginCall call) {
        AndroidBleScanner.get(getContext()).stop(call.getString("id"), ok -> {
            if (ok) call.resolve(); else call.reject("BLE_SCAN_CLOSE_FAILED");
        });
    }

    private static JSObject encode(ScanResult result) {
        JSObject output = new JSObject(), device = new JSObject(), serviceData = new JSObject(), manufacturerData = new JSObject();
        device.put("deviceId", result.getDevice().getAddress());
        var record = result.getScanRecord();
        if (record != null) {
            device.put("name", record.getDeviceName()); output.put("localName", record.getDeviceName());
            var services = record.getServiceData();
            if (services != null) for (var entry : services.entrySet()) serviceData.put(entry.getKey().toString(), hex(entry.getValue()));
            var manufacturers = record.getManufacturerSpecificData();
            if (manufacturers != null) for (int i = 0; i < manufacturers.size(); ++i) manufacturerData.put(Integer.toString(manufacturers.keyAt(i)), hex(manufacturers.valueAt(i)));
            JSArray uuids = new JSArray();
            if (record.getServiceUuids() != null) for (var uuid : record.getServiceUuids()) uuids.put(uuid.toString());
            output.put("uuids", uuids);
            output.put("rawAdvertisement", hex(record.getBytes()));
        }
        output.put("device", device); output.put("rssi", result.getRssi()); output.put("txPower", result.getTxPower());
        output.put("serviceData", serviceData); output.put("manufacturerData", manufacturerData);
        return output;
    }
    private static String hex(byte[] data) {
        if (data == null || data.length > 512) return "";
        char[] digits = "0123456789abcdef".toCharArray(), output = new char[data.length * 2];
        for (int i = 0; i < data.length; ++i) { output[i * 2] = digits[(data[i] & 255) >>> 4]; output[i * 2 + 1] = digits[data[i] & 15]; }
        return new String(output);
    }
}
