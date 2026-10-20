package iot.diandeng.tech.lan;

import android.net.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Arrays;
import java.util.Base64;
import java.util.concurrent.ScheduledThreadPoolExecutor;

@CapacitorPlugin(name = "BlinkerLocalWebSocket")
public final class BlinkerLocalWebSocketPlugin extends Plugin {
    private final ScheduledThreadPoolExecutor clock = new ScheduledThreadPoolExecutor(1);
    private LocalWebSocketSession session;
    private String sessionId;
    private ConnectivityManager networks;
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean foreground = true;

    @Override public void load() {
        clock.setRemoveOnCancelPolicy(true);
        networks = getContext().getSystemService(ConnectivityManager.class);
    }

    @PluginMethod public synchronized void open(PluginCall call) {
        if (!foreground || session != null) { call.reject("LOCAL_WS_UNAVAILABLE"); return; }
        String id = call.getString("id"), host = call.getString("host");
        Integer port = call.getInt("port");
        try {
            if (id == null || !id.matches("[a-f0-9]{32}") || port == null || port != 8920)
                throw new IllegalArgumentException();
            byte[] target = LocalDestination.address(host);
            Network network = networks.getActiveNetwork();
            NetworkCapabilities caps = networks.getNetworkCapabilities(network);
            LinkProperties properties = networks.getLinkProperties(network);
            if (caps == null || properties == null || !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                || caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) || !onLink(target, properties))
                throw new IllegalArgumentException();
            sessionId = id;
            session = new LocalWebSocketSession(host, port, network::bindSocket, clock);
            LocalWebSocketSession current = session;
            current.finished.thenRun(() -> retire(current));
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override public void onAvailable(Network changed) { if (!network.equals(changed)) retire(current); }
                @Override public void onLost(Network changed) { if (network.equals(changed)) retire(current); }
                @Override public void onLinkPropertiesChanged(Network changed, LinkProperties value) {
                    if (network.equals(changed) && !properties.equals(value)) retire(current);
                }
                @Override public void onCapabilitiesChanged(Network changed, NetworkCapabilities value) {
                    if (network.equals(changed) && (!value.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                        || value.hasTransport(NetworkCapabilities.TRANSPORT_VPN))) retire(current);
                }
            };
            networks.registerDefaultNetworkCallback(networkCallback);
            // Catch changes between the first snapshot and callback installation.
            if (!network.equals(networks.getActiveNetwork())
                || !properties.equals(networks.getLinkProperties(network))) throw new IllegalStateException();
            current.opened.whenComplete((value, error) -> {
                if (error == null && isCurrent(current)) call.resolve();
                else { retire(current); call.reject("LOCAL_WS_OPEN_FAILED"); }
            });
            current.connect();
        } catch (Exception error) { retire(session); call.reject("LOCAL_WS_DESTINATION_UNAVAILABLE"); }
    }

    @PluginMethod public synchronized void send(PluginCall call) {
        LocalWebSocketSession current = select(call);
        if (current == null) return;
        String encoded = call.getString("data");
        byte[] bytes = null;
        try {
            if (encoded == null || encoded.length() > 560 || encoded.isEmpty()) throw new IllegalArgumentException();
            bytes = Base64.getDecoder().decode(encoded);
            if (!Base64.getEncoder().encodeToString(bytes).equals(encoded)) throw new IllegalArgumentException();
            current.send(bytes).whenComplete((value, error) -> {
                if (error == null && isCurrent(current)) call.resolve();
                else { retire(current); call.reject("LOCAL_WS_SEND_FAILED"); }
            });
        } catch (Exception error) { retire(current); call.reject("LOCAL_WS_RECORD_INVALID"); }
        finally { if (bytes != null) Arrays.fill(bytes, (byte) 0); }
    }

    @PluginMethod public synchronized void receive(PluginCall call) {
        LocalWebSocketSession current = select(call);
        if (current == null) return;
        current.receive().whenComplete((bytes, error) -> {
            try {
                if (error == null && isCurrent(current)) call.resolve(new JSObject().put("data", Base64.getEncoder().encodeToString(bytes)));
                else { retire(current); call.reject("LOCAL_WS_RECEIVE_FAILED"); }
            } finally { if (bytes != null) Arrays.fill(bytes, (byte) 0); }
        });
    }

    @PluginMethod public synchronized void close(PluginCall call) {
        if (sessionId != null && sessionId.equals(call.getString("id"))) retire(session);
        call.resolve(); // Stale owners cannot close a newer session.
    }
    private synchronized boolean isCurrent(LocalWebSocketSession current) { return session == current; }
    private LocalWebSocketSession select(PluginCall call) {
        if (session == null || !sessionId.equals(call.getString("id"))) { call.reject("LOCAL_WS_STALE_OWNER"); return null; }
        return session;
    }
    private synchronized void retire(LocalWebSocketSession current) {
        if (current != session) return;
        session = null; sessionId = null;
        if (networkCallback != null) {
            try { networks.unregisterNetworkCallback(networkCallback); } catch (Exception ignored) { }
            networkCallback = null;
        }
        if (current != null) current.close();
    }
    private static boolean onLink(byte[] target, LinkProperties properties) {
        for (LinkAddress address : properties.getLinkAddresses())
            if (LocalDestination.onLink(target, address.getAddress().getAddress(), address.getPrefixLength())) return true;
        return false;
    }
    @Override protected synchronized void handleOnPause() { foreground = false; retire(session); }
    @Override protected synchronized void handleOnResume() { foreground = true; }
    @Override protected synchronized void handleOnDestroy() { retire(session); clock.shutdownNow(); }
}
