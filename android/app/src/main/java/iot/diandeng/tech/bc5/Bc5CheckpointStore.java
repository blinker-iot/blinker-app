package iot.diandeng.tech.bc5;

import java.util.Base64;
import java.util.Objects;

/** One store per process; its lock covers comparison, quota and checked disk write. */
final class Bc5CheckpointStore {
    interface Storage {
        String read(String key);
        Iterable<String> keys();
        boolean write(String key, String value);
    }

    private static final int MAX_PER_SCOPE = 32;
    private static final int MAX_TOTAL = 128;
    private static final int MAX_ENCODED = 4096;
    private static final Base64.Decoder DECODER = Base64.getUrlDecoder();
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();

    private final Storage storage;
    private boolean writeUnconfirmed;

    Bc5CheckpointStore(Storage storage) { this.storage = storage; }

    synchronized String read(String scope, String intentId) {
        return current(key(scope, intentId));
    }

    synchronized boolean compareAndSet(String scope, String intentId, String expected, String encoded) {
        String key = key(scope, intentId);
        if (!validPayload(encoded) || (expected != null && !validPayload(expected))) throw new IllegalArgumentException();
        if (writeUnconfirmed) throw new IllegalStateException();
        if (!Objects.equals(current(key), expected)) return false;
        if (expected == null) {
            int count = 0, total = 0;
            String prefix = scope + ':';
            for (String other : storage.keys()) {
                if (++total >= MAX_TOTAL || (other.startsWith(prefix) && ++count >= MAX_PER_SCOPE))
                    throw new IllegalStateException();
            }
        }
        // A failed commit can still change SharedPreferences' in-memory copy.
        // Keep recovery readable, but never use that copy to approve a write.
        writeUnconfirmed = true;
        if (!storage.write(key, encoded)) throw new IllegalStateException();
        writeUnconfirmed = false;
        return true;
    }

    private String current(String key) {
        String encoded = storage.read(key);
        if (encoded != null && !validPayload(encoded)) throw new IllegalStateException();
        return encoded;
    }

    private static boolean validPayload(String value) {
        return value != null && !value.isEmpty() && value.length() <= MAX_ENCODED;
    }

    private static String key(String scope, String intentId) {
        if (!canonical(scope, 43, 32) || !canonical(intentId, 22, 16)) throw new IllegalArgumentException();
        return scope + ':' + intentId;
    }

    private static boolean canonical(String value, int length, int size) {
        if (value == null || value.length() != length) return false;
        byte[] bytes = DECODER.decode(value);
        if (bytes.length != size || !ENCODER.encodeToString(bytes).equals(value)) return false;
        for (byte item : bytes) if (item != 0) return true;
        return false;
    }
}
