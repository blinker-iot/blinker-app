package iot.diandeng.tech.bc5;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "BlinkerBc5Checkpoint")
public final class BlinkerBc5CheckpointPlugin extends Plugin {
    private static final String BETA_PACKAGE = "iot.diandeng.tech.beta";
    private static final int MAX_CONFIG = 8192;
    private static Bc5CheckpointStore shared;

    /** The bundled native profile is checked before adding any bridge methods. */
    public static boolean enabled(Context context) {
        return profile(context) != null;
    }

    /** Return only the immutable, non-secret scope from the candidate APK. */
    @PluginMethod public void getAdmission(PluginCall call) {
        resolveAdmission(call, false);
    }

    @PluginMethod public void getRecoveryAdmission(PluginCall call) {
        resolveAdmission(call, true);
    }

    @PluginMethod public void getInitialNetworkAdmission(PluginCall call) {
        if (call.getData().length() != 0) { call.reject("BC5_ADMISSION_INVALID"); return; }
        Profile profile = profile(getContext());
        if (profile == null || profile.networkAdmission == null) call.reject("BC5_ADMISSION_UNAVAILABLE");
        else call.resolve(profile.networkAdmission);
    }

    private void resolveAdmission(PluginCall call, boolean recovery) {
        if (call.getData().length() != 0) { call.reject("BC5_ADMISSION_INVALID"); return; }
        Profile profile = profile(getContext());
        if (profile == null || profile.isRecovery() != recovery) call.reject("BC5_ADMISSION_UNAVAILABLE");
        else call.resolve(profile.admission);
    }

    private static final class Profile {
        final JSObject admission;
        final String recoveryScope;
        final JSObject networkAdmission;
        final InitialNetworkCheckpointAccess networkAccess;
        Profile(JSObject admission, String recoveryScope) {
            this(admission, recoveryScope, null, null);
        }
        Profile(JSObject admission, String recoveryScope, JSObject networkAdmission, InitialNetworkCheckpointAccess networkAccess) {
            this.admission = admission;
            this.recoveryScope = recoveryScope;
            this.networkAdmission = networkAdmission;
            this.networkAccess = networkAccess;
        }
        boolean isRecovery() { return recoveryScope != null; }
    }

    private static Profile profile(Context context) {
        if (!BETA_PACKAGE.equals(context.getPackageName())) return null;
        try (InputStream input = context.getAssets().open("capacitor.config.json")) {
            byte[] data = new byte[MAX_CONFIG + 1];
            int used = 0;
            while (used < data.length) {
                int count = input.read(data, used, data.length - used);
                if (count < 0) break;
                if (count == 0) return null;
                used += count;
            }
            if (used > MAX_CONFIG) return null;
            JSONObject config = new JSONObject(new String(data, 0, used, StandardCharsets.UTF_8));
            JSONObject server = config.getJSONObject("server");
            // Capacitor can log plugin inputs unless this profile disables it.
            if (!(BETA_PACKAGE.equals(config.opt("appId")) && "none".equals(config.opt("loggingBehavior"))
                && "https".equals(server.opt("androidScheme")) && Boolean.FALSE.equals(server.opt("cleartext"))
                && !server.has("url"))) return null;
            JSONObject plugins = config.getJSONObject("plugins");
            JSONObject wifi = plugins.optJSONObject("WiFiProv");
            Object installFlag = wifi == null ? null : wifi.opt("initialCloudWifiCandidate");
            JSONObject checkpoint = plugins.getJSONObject("BlinkerBc5Checkpoint");
            if (checkpoint.length() != 1 || plugins.has("BlinkerWiFiProvAllocation")
                || (plugins.has("WiFiProv") && wifi == null) || (installFlag != null && !(installFlag instanceof Boolean))) return null;
            boolean network = checkpoint.has("initialNetworkAdmission");
            boolean recovery = network || !Boolean.TRUE.equals(installFlag);
            if (network && !Boolean.TRUE.equals(installFlag)) return null;
            JSONObject networkProfile = network ? checkpoint.getJSONObject("initialNetworkAdmission") : null;
            if (network && networkProfile.length() != 2) return null;
            JSONObject value = network ? networkProfile.getJSONObject("originalRecovery")
                : checkpoint.getJSONObject(recovery ? "recoveryAdmission" : "admission");
            if (value.length() != 7) return null;
            String origin = string(value, "origin"), region = string(value, "region"), intentId = string(value, "intentId");
            URI uri = URI.create(origin);
            if (origin.length() > 512 || !"https".equals(uri.getScheme()) || uri.getHost() == null
                || uri.getRawUserInfo() != null || !"".equals(uri.getRawPath()) || uri.getRawQuery() != null
                || uri.getRawFragment() != null || uri.getPort() == 0 || uri.getPort() == 443 || uri.getPort() > 65535
                || !origin.equals("https://" + uri.getHost().toLowerCase(java.util.Locale.ROOT)
                    + (uri.getPort() < 0 ? "" : ":" + uri.getPort()))
                || !("China".equals(region) || "Global".equals(region) || "Development".equals(region))
                || !intentId.matches("[A-Za-z0-9_-]{22}")) return null;
            byte[] intent = Base64.getUrlDecoder().decode(intentId);
            boolean nonzero = false;
            for (byte b : intent) nonzero |= b != 0;
            if (!nonzero || intent.length != 16 || !Base64.getUrlEncoder().withoutPadding().encodeToString(intent).equals(intentId)) return null;
            Object expires = value.opt("expiresAt");
            if (!(expires instanceof Number)) return null;
            long expiry = ((Number) expires).longValue();
            if (expiry <= 0 || expiry > 9007199254740991L || ((Number) expires).doubleValue() != expiry) return null;
            String owner = identifier(value, "ownerUserId"), tenant = identifier(value, "tenantId");
            JSObject admission = new JSObject().put("origin", origin).put("region", region).put("intentId", intentId)
                .put("ownerUserId", owner).put("tenantId", tenant)
                .put("sourceLogicalDeviceId", identifier(value, "sourceLogicalDeviceId")).put("expiresAt", expiry);
            // Same checkpoint key as the existing Web client. Android JSON may escape solidus; JSON.stringify does not.
            String scope = null;
            if (recovery) {
                String tuple = new JSONArray().put("blinker.bc5-checkpoint.v1").put(origin).put(region).put(tenant).put(owner)
                    .toString().replace("\\/", "/");
                scope = Base64.getUrlEncoder().withoutPadding().encodeToString(
                    MessageDigest.getInstance("SHA-256").digest(tuple.getBytes(StandardCharsets.UTF_8)));
            }
            if (!network) return new Profile(admission, scope);
            JSONObject next = networkProfile.getJSONObject("operation");
            if (next.length() != 12 || !"blinker.installed-key-initial-network.v1".equals(next.opt("contract"))
                || !origin.equals(next.opt("origin")) || !region.equals(next.opt("region"))
                || !owner.equals(next.opt("ownerUserId")) || !tenant.equals(next.opt("tenantId"))
                || !admission.getString("sourceLogicalDeviceId").equals(next.opt("sourceLogicalDeviceId"))) return null;
            String operation = canonical(next, "operationId", 16), target = identifier(next, "targetLogicalDeviceId");
            canonical(next, "existingLocator", 16);
            if (target.equals(admission.getString("sourceLogicalDeviceId"))) return null;
            positive(next, "expiresAt", 9007199254740991L);
            positive(next, "cloudCredentialVersion", 0xffffffffL);
            JSONObject root = next.getJSONObject("expectedRoot");
            if (root.length() != 5) return null;
            canonical(root, "deviceInstanceId", 16);
            canonical(root, "controllerId", 16);
            canonical(root, "adminFingerprint", 32);
            positive(root, "accessEpoch", 0xffffffffL);
            positive(root, "credentialVersion", 0xffffffffL);
            String networkScope = scope("blinker.initial-network-checkpoint.v1", origin, region, tenant, owner);
            return new Profile(admission, scope, new JSObject(next.toString()),
                new InitialNetworkCheckpointAccess(scope, intentId, networkScope, operation));
        } catch (Exception ignored) { return null; }
    }

    @PluginMethod public void read(PluginCall call) {
        try {
            Profile profile = profile(getContext());
            if (profile == null) { call.reject("BC5_ADMISSION_UNAVAILABLE"); return; }
            JSObject data = call.getData();
            if (data.length() != 2) throw new IllegalArgumentException();
            String scope = string(data, "scope"), intent = string(data, "intentId");
            if (profile.networkAccess != null ? !profile.networkAccess.permitsRead(scope, intent)
                : profile.isRecovery() && (!profile.recoveryScope.equals(scope) || !profile.admission.optString("intentId").equals(intent))) {
                call.reject("BC5_ADMISSION_UNAVAILABLE"); return;
            }
            String encoded = store(getContext()).read(scope, intent);
            call.resolve(new JSObject().put("encoded", encoded == null ? JSONObject.NULL : encoded));
        } catch (IllegalArgumentException invalid) { call.reject("BC5_CHECKPOINT_INVALID"); }
        catch (RuntimeException unavailable) { call.reject("BC5_CHECKPOINT_STORE_UNAVAILABLE"); }
    }

    @PluginMethod public void compareAndSet(PluginCall call) {
        try {
            Profile profile = profile(getContext());
            if (profile == null || (profile.isRecovery() && profile.networkAccess == null)) { call.reject("BC5_ADMISSION_UNAVAILABLE"); return; }
            JSObject data = call.getData();
            if (data.length() != 4) throw new IllegalArgumentException();
            if (profile.networkAccess != null && (!profile.networkAccess.permitsWrite(string(data, "scope"), string(data, "intentId"))
                || System.currentTimeMillis() >= profile.networkAdmission.optLong("expiresAt", 0L))) {
                call.reject("BC5_ADMISSION_UNAVAILABLE"); return;
            }
            String expected = data.opt("expected") == JSONObject.NULL ? null : string(data, "expected");
            boolean applied = store(getContext()).compareAndSet(string(data, "scope"), string(data, "intentId"),
                expected, string(data, "encoded"));
            call.resolve(new JSObject().put("applied", applied));
        } catch (IllegalArgumentException invalid) { call.reject("BC5_CHECKPOINT_INVALID"); }
        catch (RuntimeException unavailable) { call.reject("BC5_CHECKPOINT_STORE_UNAVAILABLE"); }
    }

    private static String identifier(JSONObject data, String name) {
        String value = string(data, name);
        if (value.isEmpty() || space(value.codePointAt(0)) || space(value.codePointBefore(value.length()))
            || value.getBytes(StandardCharsets.UTF_8).length > 128
            || value.matches("(?s).*[\\x00-\\x1f\\x7f/].*")) throw new IllegalArgumentException();
        return value;
    }

    private static String canonical(JSONObject data, String name, int length) {
        String value = string(data, name);
        byte[] bytes = Base64.getUrlDecoder().decode(value);
        boolean nonzero = false;
        for (byte item : bytes) nonzero |= item != 0;
        if (bytes.length != length || !nonzero || !Base64.getUrlEncoder().withoutPadding().encodeToString(bytes).equals(value))
            throw new IllegalArgumentException();
        return value;
    }

    private static void positive(JSONObject data, String name, long maximum) {
        Object value = data.opt(name);
        if (!(value instanceof Number) || ((Number) value).longValue() <= 0 || ((Number) value).longValue() > maximum
            || ((Number) value).doubleValue() != ((Number) value).longValue()) throw new IllegalArgumentException();
    }

    private static String scope(String domain, String origin, String region, String tenant, String owner) throws Exception {
        String tuple = new JSONArray().put(domain).put(origin).put(region).put(tenant).put(owner).toString().replace("\\/", "/");
        return Base64.getUrlEncoder().withoutPadding().encodeToString(
            MessageDigest.getInstance("SHA-256").digest(tuple.getBytes(StandardCharsets.UTF_8)));
    }

    private static boolean space(int point) {
        return Character.isWhitespace(point) || Character.isSpaceChar(point) || point == 0xfeff;
    }

    private static String string(JSONObject data, String name) {
        Object value = data.opt(name);
        if (!(value instanceof String)) throw new IllegalArgumentException();
        return (String) value;
    }

    private static synchronized Bc5CheckpointStore store(Context context) {
        if (shared == null) {
            SharedPreferences prefs = context.getSharedPreferences("blinker.bc5-install", Context.MODE_PRIVATE);
            shared = new Bc5CheckpointStore(new Bc5CheckpointStore.Storage() {
                @Override public String read(String key) { return prefs.getString(key, null); }
                @Override public Iterable<String> keys() { return prefs.getAll().keySet(); }
                @Override public boolean write(String key, String value) { return prefs.edit().putString(key, value).commit(); }
            });
        }
        return shared;
    }
}
