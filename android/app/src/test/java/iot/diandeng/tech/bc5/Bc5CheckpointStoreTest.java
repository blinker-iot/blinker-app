package iot.diandeng.tech.bc5;

import static org.junit.Assert.*;

import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.Test;

public final class Bc5CheckpointStoreTest {
    private static final String SCOPE = id(32, 1);
    private static final String INTENT = id(16, 1);

    @Test public void comparesOriginalBytesAndReadsTheSameRecordAfterRecreation() {
        MemoryStorage disk = new MemoryStorage();
        Bc5CheckpointStore store = new Bc5CheckpointStore(disk);
        assertNull(store.read(SCOPE, INTENT));
        assertTrue(store.compareAndSet(SCOPE, INTENT, null, "issued"));
        assertFalse(store.compareAndSet(SCOPE, INTENT, null, "duplicate"));
        assertFalse(store.compareAndSet(SCOPE, INTENT, "other", "armed"));
        assertTrue(store.compareAndSet(SCOPE, INTENT, "issued", "armed"));
        assertEquals("armed", new Bc5CheckpointStore(disk).read(SCOPE, INTENT));
        assertEquals(2, disk.writes);
    }

    @Test public void competingCreateHasOneWinnerAndOneStorageWrite() throws Exception {
        MemoryStorage disk = new MemoryStorage();
        Bc5CheckpointStore store = new Bc5CheckpointStore(disk);
        ExecutorService threads = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            Future<Boolean> first = threads.submit(() -> { start.await(); return store.compareAndSet(SCOPE, INTENT, null, "first"); });
            Future<Boolean> second = threads.submit(() -> { start.await(); return store.compareAndSet(SCOPE, INTENT, null, "second"); });
            start.countDown();
            assertNotEquals(first.get(2, TimeUnit.SECONDS), second.get(2, TimeUnit.SECONDS));
            assertEquals(1, disk.writes);
        } finally { threads.shutdownNow(); }
    }

    @Test public void failedDiskCommitCannotAuthorizeACachedRecordOrAnotherWrite() {
        MemoryStorage disk = new MemoryStorage();
        disk.confirm = false;
        Bc5CheckpointStore store = new Bc5CheckpointStore(disk);
        assertThrows(IllegalStateException.class, () -> store.compareAndSet(SCOPE, INTENT, null, "issued"));
        assertEquals("issued", store.read(SCOPE, INTENT)); // SharedPreferences can have updated its cache.
        disk.confirm = true;
        assertThrows(IllegalStateException.class, () -> store.compareAndSet(SCOPE, INTENT, "issued", "armed"));
        assertEquals(1, disk.writes);
    }

    @Test public void limitsNewIntentsPerScopeWithoutEvictionOrBlockingTheOriginalRecord() {
        MemoryStorage disk = new MemoryStorage();
        Bc5CheckpointStore store = new Bc5CheckpointStore(disk);
        for (int i = 1; i <= 32; i++) assertTrue(store.compareAndSet(SCOPE, id(16, i), null, "issued"));
        assertThrows(IllegalStateException.class, () -> store.compareAndSet(SCOPE, id(16, 33), null, "overflow"));
        assertEquals("issued", store.read(SCOPE, INTENT));
        assertTrue(store.compareAndSet(SCOPE, INTENT, "issued", "armed"));
        assertTrue(store.compareAndSet(id(32, 2), INTENT, null, "separate"));
    }

    @Test public void rejectsNoncanonicalIdsAndUnboundedPayloadBeforeStorage() {
        MemoryStorage disk = new MemoryStorage();
        Bc5CheckpointStore store = new Bc5CheckpointStore(disk);
        String noncanonical = INTENT.substring(0, 21) + "R";
        assertThrows(IllegalArgumentException.class, () -> store.compareAndSet(SCOPE, noncanonical, null, "issued"));
        assertThrows(IllegalArgumentException.class, () -> store.compareAndSet(id(32, 0), INTENT, null, "issued"));
        assertThrows(IllegalArgumentException.class, () -> store.compareAndSet(SCOPE, INTENT, null, "x".repeat(4097)));
        assertThrows(IllegalArgumentException.class, () -> store.compareAndSet(SCOPE, INTENT, "", "issued"));
        assertEquals(0, disk.writes);
    }

    @Test public void capsNewRecordsAcrossAllScopesWithoutEvictingOrBlockingAnUpdate() {
        MemoryStorage disk = new MemoryStorage();
        Bc5CheckpointStore store = new Bc5CheckpointStore(disk);
        for (int i = 1; i <= 128; i++) assertTrue(store.compareAndSet(id(32, i), INTENT, null, "issued"));
        assertThrows(IllegalStateException.class, () -> store.compareAndSet(id(32, 129), INTENT, null, "overflow"));
        assertEquals("issued", store.read(SCOPE, INTENT));
        assertTrue(store.compareAndSet(SCOPE, INTENT, "issued", "armed"));
        assertEquals(129, disk.writes);
    }

    private static String id(int bytes, int value) {
        byte[] data = new byte[bytes];
        data[data.length - 1] = (byte) value;
        return Base64.getUrlEncoder().withoutPadding().encodeToString(data);
    }

    private static final class MemoryStorage implements Bc5CheckpointStore.Storage {
        private final Map<String, String> values = new HashMap<>();
        private boolean confirm = true;
        private int writes;
        @Override public String read(String key) { return values.get(key); }
        @Override public Iterable<String> keys() { return values.keySet(); }
        @Override public boolean write(String key, String value) { writes++; values.put(key, value); return confirm; }
    }
}
