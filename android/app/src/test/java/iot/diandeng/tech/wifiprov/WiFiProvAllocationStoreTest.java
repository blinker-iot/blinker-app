package iot.diandeng.tech.wifiprov;

import static org.junit.Assert.*;

import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

public class WiFiProvAllocationStoreTest {
    private static final String SCOPE = token(32, 1), OTHER_SCOPE = token(32, 2);
    private static final String INSTANCE = token(16, 1), LOCATOR = token(16, 9), RECIPIENT = token(32, 3);
    private static final String LOGICAL = "device_12345678-1234-1234-1234-123456789abc";
    private static final String[] PHASES = {"prepared", "create-dispatched", "card-confirmed",
        "bootstrap-dispatched", "bootstrap-accepted", "wifi-dispatched", "wifi-confirmed"};

    private static final class FakeStorage implements WiFiProvAllocationStore.Storage {
        final Map<String, String> values = new LinkedHashMap<>();
        final Map<String, String> durable = new LinkedHashMap<>();
        boolean fail;
        int writes;

        @Override public String read(String key) { return values.get(key); }
        @Override public Iterable<String> keys() { return values.keySet(); }
        @Override public boolean write(String key, String value) {
            writes++;
            values.put(key, value); // SharedPreferences can change the process cache before disk success.
            if (fail) return false;
            durable.put(key, value);
            return true;
        }
    }

    @Test public void onlyExactMonotonicCasSurvivesRestartAndScopesAreIsolated() {
        FakeStorage disk = new FakeStorage();
        WiFiProvAllocationStore store = new WiFiProvAllocationStore(disk);
        String previous = null;
        for (int phase = 0; phase < PHASES.length; phase++) {
            String encoded = record(INSTANCE, phase);
            assertTrue(store.compareAndSet(SCOPE, INSTANCE, previous, encoded));
            assertFalse(store.compareAndSet(SCOPE, INSTANCE, previous, encoded));
            assertEquals(encoded, store.read(SCOPE, INSTANCE));
            assertEquals(List.of(encoded), store.list(SCOPE));
            assertNull(store.read(OTHER_SCOPE, INSTANCE));
            assertTrue(store.list(OTHER_SCOPE).isEmpty());
            previous = encoded;
        }
        assertEquals(PHASES.length, disk.writes);
        assertEquals(previous, new WiFiProvAllocationStore(disk).read(SCOPE, INSTANCE));
        assertThrows(IllegalArgumentException.class, () -> store.compareAndSet(SCOPE, INSTANCE,
            record(INSTANCE, 6), record(INSTANCE, 0)));
    }

    @Test public void invalidEnvelopeFieldsAndChangesNeverReachStorage() {
        FakeStorage disk = new FakeStorage();
        WiFiProvAllocationStore store = new WiFiProvAllocationStore(disk);
        String prepared = record(INSTANCE, 0);
        assertThrows(IllegalArgumentException.class, () -> store.compareAndSet(SCOPE, INSTANCE, null,
            prepared.replace("\"version\":1", "\"version\":1,\"version\":1")));
        assertThrows(IllegalArgumentException.class, () -> store.compareAndSet(SCOPE, INSTANCE, null,
            prepared.replace("\"version\":1", "\"version\":1,\"sealedKey\":\"unexpected\"")));
        assertThrows(IllegalArgumentException.class, () -> store.compareAndSet(SCOPE, INSTANCE, null,
            prepared.replace("\"version\":1", "\"version\": 1")));
        assertThrows(IllegalArgumentException.class, () -> store.compareAndSet(SCOPE, INSTANCE, null,
            record(token(16, 2), 0)));
        assertThrows(IllegalArgumentException.class, () -> store.compareAndSet(SCOPE, INSTANCE, null, record(INSTANCE, 1)));
        assertThrows(IllegalArgumentException.class, () -> store.read(SCOPE, INSTANCE.substring(0, 21) + 'B'));
        assertEquals(0, disk.writes);
        assertTrue(store.compareAndSet(SCOPE, INSTANCE, null, prepared));
        assertThrows(IllegalArgumentException.class, () -> store.compareAndSet(SCOPE, INSTANCE, prepared, record(INSTANCE, 2)));
        String dispatched = record(INSTANCE, 1);
        assertTrue(store.compareAndSet(SCOPE, INSTANCE, prepared, dispatched));
        String confirmed = record(INSTANCE, 2);
        assertThrows(IllegalArgumentException.class, () -> store.compareAndSet(SCOPE, INSTANCE, dispatched,
            confirmed.replace(RECIPIENT, token(32, 5))));
        assertTrue(store.compareAndSet(SCOPE, INSTANCE, dispatched, confirmed));
        assertThrows(IllegalArgumentException.class, () -> store.compareAndSet(SCOPE, INSTANCE, confirmed,
            record(INSTANCE, 3).replace(LOCATOR, token(16, 11))));
        assertThrows(IllegalArgumentException.class, () -> store.compareAndSet(SCOPE, INSTANCE, confirmed, confirmed));
        assertEquals(3, disk.writes);
    }

    @Test public void failedCommitFencesReadsAndWritesUntilDurableStateIsReopened() {
        FakeStorage disk = new FakeStorage();
        WiFiProvAllocationStore store = new WiFiProvAllocationStore(disk);
        String prepared = record(INSTANCE, 0), dispatched = record(INSTANCE, 1);
        assertTrue(store.compareAndSet(SCOPE, INSTANCE, null, prepared));
        disk.fail = true;
        assertThrows(IllegalStateException.class, () -> store.compareAndSet(SCOPE, INSTANCE, prepared, dispatched));
        assertEquals(dispatched, disk.values.get(SCOPE + '.' + INSTANCE));
        assertThrows(IllegalStateException.class, () -> store.read(SCOPE, INSTANCE));
        assertThrows(IllegalStateException.class, () -> store.list(SCOPE));
        assertThrows(IllegalStateException.class, () -> store.compareAndSet(SCOPE, INSTANCE, prepared, dispatched));
        assertEquals(2, disk.writes);
        disk.values.clear();
        disk.values.putAll(disk.durable);
        assertEquals(prepared, new WiFiProvAllocationStore(disk).read(SCOPE, INSTANCE));
    }

    @Test public void capacityDoesNotDeleteOldRecordsOrBlockExistingTransitions() {
        WiFiProvAllocationStore store = new WiFiProvAllocationStore(new FakeStorage());
        for (int group = 1; group <= 4; group++) {
            for (int i = 1; i <= 32; i++) {
                String instance = token(16, i);
                assertTrue(store.compareAndSet(token(32, group), instance, null, record(instance, 0)));
            }
            assertEquals(32, store.list(token(32, group)).size());
            String extra = token(16, 33), scope = token(32, group);
            assertThrows(IllegalStateException.class, () -> store.compareAndSet(scope, extra, null, record(extra, 0)));
        }
        assertThrows(IllegalStateException.class, () -> store.compareAndSet(token(32, 5), INSTANCE, null, record(INSTANCE, 0)));
        assertTrue(store.compareAndSet(SCOPE, INSTANCE, record(INSTANCE, 0), record(INSTANCE, 1)));
    }

    private static String token(int size, int value) {
        byte[] bytes = new byte[size];
        bytes[size - 1] = (byte) value;
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String record(String instance, int phase) {
        return "{\"version\":1,\"deviceInstanceId\":\"" + instance + "\",\"requestId\":\"wifiprov-" + "1".repeat(32)
            + "\",\"nameDigest\":\"" + "2".repeat(64) + "\",\"phase\":\"" + PHASES[phase] + "\""
            + (phase == 0 ? "" : ",\"recipientPublicKey\":\"" + RECIPIENT + "\"")
            + (phase < 2 ? "" : ",\"context\":{\"logicalDeviceId\":\"" + LOGICAL
                + "\",\"credentialVersion\":1,\"locator\":\"" + LOCATOR + "\"}") + '}';
    }
}
