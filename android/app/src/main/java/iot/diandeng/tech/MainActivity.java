package iot.diandeng.tech;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import com.wifiprov.capacitor.WiFiProvPlugin;
import iot.diandeng.tech.bc5.BlinkerBc5CheckpointPlugin;
import iot.diandeng.tech.ble.AndroidBleScanner;
import iot.diandeng.tech.ble.BlinkerBleScanPlugin;
import iot.diandeng.tech.ble.WiFiProvDiscovery;
import iot.diandeng.tech.lan.BlinkerLocalWebSocketPlugin;
import iot.diandeng.tech.wifiprov.BlinkerWiFiProvAllocationPlugin;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        WiFiProvPlugin.setBleDiscoveryFactory(WiFiProvDiscovery::new);
        registerPlugin(BlinkerBleScanPlugin.class);
        registerPlugin(BlinkerLocalWebSocketPlugin.class);
        if (BlinkerBc5CheckpointPlugin.enabled(this)) registerPlugin(BlinkerBc5CheckpointPlugin.class);
        if (BlinkerWiFiProvAllocationPlugin.available(this)) registerPlugin(BlinkerWiFiProvAllocationPlugin.class);
        super.onCreate(savedInstanceState);
    }
    @Override public void onResume() { super.onResume(); AndroidBleScanner.get(this).foreground(true); }
    @Override public void onPause() { AndroidBleScanner.get(this).foreground(false); super.onPause(); }
}
