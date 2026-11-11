package iot.diandeng.tech.wifiprov;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "BlinkerWiFiProvAllocation")
public final class BlinkerWiFiProvAllocationPlugin extends Plugin {
    private static final String NAME = "BlinkerWiFiProvAllocation";
    private static final String BETA_PACKAGE = "iot.diandeng.tech.beta";
    private static final int MAX_CONFIG = 8192;
    private static WiFiProvAllocationStore shared;

    private enum Admission { UNAVAILABLE, READ_ONLY, READ_WRITE }
    private Admission admission = Admission.UNAVAILABLE;

    /** Keep reads reachable after pilot writes are disabled so an old intent still fences legacy. */
    public static boolean available(Context context) { return admission(context) != Admission.UNAVAILABLE; }

    @Override public void load() { admission = admission(getContext()); }

    @PluginMethod public void read(PluginCall call) {
        if (!allowed(call, false)) return;
        try {
            JSObject data = call.getData();
            if (data.length() != 2) throw new IllegalArgumentException();
            String encoded = store(getContext()).read(string(data, "scope"), string(data, "instance"));
            call.resolve(new JSObject().put("encoded", encoded == null ? JSONObject.NULL : encoded));
        } catch (IllegalArgumentException invalid) { call.reject("WIFIPROV_ALLOCATION_INVALID"); }
        catch (RuntimeException unavailable) { call.reject("WIFIPROV_ALLOCATION_STORE_UNAVAILABLE"); }
    }

    @PluginMethod public void list(PluginCall call) {
        if (!allowed(call, false)) return;
        try {
            JSObject data = call.getData();
            if (data.length() != 1) throw new IllegalArgumentException();
            call.resolve(new JSObject().put("encoded", new JSONArray(store(getContext()).list(string(data, "scope")))));
        } catch (IllegalArgumentException invalid) { call.reject("WIFIPROV_ALLOCATION_INVALID"); }
        catch (RuntimeException unavailable) { call.reject("WIFIPROV_ALLOCATION_STORE_UNAVAILABLE"); }
    }

    @PluginMethod public void compareAndSet(PluginCall call) {
        if (!allowed(call, true)) return;
        try {
            JSObject data = call.getData();
            if (data.length() != 4) throw new IllegalArgumentException();
            String expected = data.opt("expected") == JSONObject.NULL ? null : string(data, "expected");
            boolean applied = store(getContext()).compareAndSet(string(data, "scope"), string(data, "instance"),
                expected, string(data, "encoded"));
            call.resolve(new JSObject().put("applied", applied));
        } catch (IllegalArgumentException invalid) { call.reject("WIFIPROV_ALLOCATION_INVALID"); }
        catch (RuntimeException unavailable) { call.reject("WIFIPROV_ALLOCATION_STORE_UNAVAILABLE"); }
    }

    private boolean allowed(PluginCall call, boolean write) {
        if (admission == Admission.UNAVAILABLE || (write && admission != Admission.READ_WRITE)) {
            call.reject("WIFIPROV_ALLOCATION_UNAVAILABLE");
            return false;
        }
        return true;
    }

    private static Admission admission(Context context) {
        if (!BETA_PACKAGE.equals(context.getPackageName())) return Admission.UNAVAILABLE;
        try (InputStream input = context.getAssets().open("capacitor.config.json")) {
            byte[] data = new byte[MAX_CONFIG + 1];
            int used = 0;
            while (used < data.length) {
                int count = input.read(data, used, data.length - used);
                if (count < 0) break;
                if (count == 0) return Admission.UNAVAILABLE;
                used += count;
            }
            if (used > MAX_CONFIG) return Admission.UNAVAILABLE;
            JSONObject config = new JSONObject(new String(data, 0, used, StandardCharsets.UTF_8));
            JSONObject server = config.getJSONObject("server");
            if (!(BETA_PACKAGE.equals(config.opt("appId")) && "none".equals(config.opt("loggingBehavior"))
                && "https".equals(server.opt("androidScheme")) && Boolean.FALSE.equals(server.opt("cleartext"))
                && !server.has("url"))) return Admission.UNAVAILABLE;
            JSONObject plugins = config.optJSONObject("plugins");
            JSONObject value = plugins == null ? null : plugins.optJSONObject(NAME);
            return value != null && value.length() == 1 && Boolean.TRUE.equals(value.opt("enabled"))
                ? Admission.READ_WRITE : Admission.READ_ONLY;
        } catch (Exception ignored) { return Admission.UNAVAILABLE; }
    }

    private static String string(JSONObject data, String name) {
        Object value = data.opt(name);
        if (!(value instanceof String)) throw new IllegalArgumentException();
        return (String) value;
    }

    private static synchronized WiFiProvAllocationStore store(Context context) {
        if (shared == null) {
            SharedPreferences prefs = context.getSharedPreferences("blinker.wifiprov-allocation-v1", Context.MODE_PRIVATE);
            shared = new WiFiProvAllocationStore(new WiFiProvAllocationStore.Storage() {
                @Override public String read(String key) { return prefs.getString(key, null); }
                @Override public Iterable<String> keys() { return prefs.getAll().keySet(); }
                @Override public boolean write(String key, String value) { return prefs.edit().putString(key, value).commit(); }
            });
        }
        return shared;
    }
}
