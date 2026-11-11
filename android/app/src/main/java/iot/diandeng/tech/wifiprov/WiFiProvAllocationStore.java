package iot.diandeng.tech.wifiprov;

import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Non-secret journal for the ordinary, empty-root WiFiProv allocation only. */
final class WiFiProvAllocationStore {
    interface Storage {
        String read(String key);
        Iterable<String> keys();
        boolean write(String key, String encoded);
    }

    private enum Phase {
        PREPARED, CREATE_DISPATCHED, CARD_CONFIRMED, BOOTSTRAP_DISPATCHED,
        BOOTSTRAP_ACCEPTED, WIFI_DISPATCHED, WIFI_CONFIRMED
    }

    private static final int MAX_ENCODED = 2048;
    private static final int MAX_PER_SCOPE = 32;
    private static final int MAX_TOTAL = 128;
    private static final String TOKEN = "[A-Za-z0-9_-]";
    private static final String INSTANCE = TOKEN + "{22}";
    private static final String PUBLIC_KEY = TOKEN + "{43}";
    private static final String LOGICAL_ID = "device_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}";
    // Match the canonical bridge encoding rather than a permissive JSON parser: no duplicate keys,
    // whitespace, escape sequences, or unexpected credential-bearing fields may enter the journal.
    private static final Pattern RECORD = Pattern.compile(
        "\\{\"version\":1,\"deviceInstanceId\":\"(" + INSTANCE + ")\",\"requestId\":\"(wifiprov-[0-9a-f]{32})\","
        + "\"nameDigest\":\"([0-9a-f]{64})\",\"phase\":\"(prepared|create-dispatched|card-confirmed|bootstrap-dispatched"
        + "|bootstrap-accepted|wifi-dispatched|wifi-confirmed)\""
        + "(?:,\"recipientPublicKey\":\"(" + PUBLIC_KEY + ")\")?"
        + "(?:,\"context\":\\{\"logicalDeviceId\":\"(" + LOGICAL_ID + ")\",\"credentialVersion\":1,"
        + "\"locator\":\"(" + INSTANCE + ")\"\\})?\\}");

    private static final class Record {
        final String requestId, nameDigest, recipient, logicalId, locator;
        final Phase phase;

        Record(String instance, String encoded) {
            if (encoded == null || encoded.length() > MAX_ENCODED) throw new IllegalArgumentException();
            Matcher match = RECORD.matcher(encoded);
            if (!match.matches() || !instance.equals(match.group(1))) throw new IllegalArgumentException();
            requestId = match.group(2);
            nameDigest = match.group(3);
            phase = Phase.valueOf(match.group(4).toUpperCase(java.util.Locale.ROOT).replace('-', '_'));
            recipient = match.group(5);
            logicalId = match.group(6);
            locator = match.group(7);
            if ((recipient != null) != (phase != Phase.PREPARED)
                || (logicalId != null) != (phase.ordinal() >= Phase.CARD_CONFIRMED.ordinal())
                || (recipient != null && !canonicalToken(recipient, 32))
                || (locator != null && !canonicalToken(locator, 16))) throw new IllegalArgumentException();
        }

        boolean follows(Record previous) {
            return phase.ordinal() == previous.phase.ordinal() + 1 && requestId.equals(previous.requestId)
                && nameDigest.equals(previous.nameDigest) && retains(previous.recipient, recipient)
                && retains(previous.logicalId, logicalId) && retains(previous.locator, locator);
        }

        private static boolean retains(String before, String after) { return before == null || before.equals(after); }
    }

    private final Storage storage;
    private boolean commitUnconfirmed;

    WiFiProvAllocationStore(Storage storage) { this.storage = storage; }

    synchronized String read(String scope, String instance) {
        requireAvailable();
        return readValidated(prefix(scope) + checkedInstance(instance), instance);
    }

    synchronized List<String> list(String scope) {
        requireAvailable();
        String prefix = prefix(scope);
        List<String> instances = scopeInstances(prefix, false);
        Collections.sort(instances);
        List<String> records = new ArrayList<>(instances.size());
        for (String instance : instances) {
            String encoded = readValidated(prefix + instance, instance);
            if (encoded == null) throw new IllegalStateException();
            records.add(encoded);
        }
        return records;
    }

    synchronized boolean compareAndSet(String scope, String instance, String expected, String encoded) {
        requireAvailable();
        String prefix = prefix(scope);
        String key = prefix + checkedInstance(instance);
        Record next = new Record(instance, encoded);
        Record previous = expected == null ? null : new Record(instance, expected);
        if (previous == null ? next.phase != Phase.PREPARED : !next.follows(previous)) {
            throw new IllegalArgumentException();
        }
        String current = readValidated(key, instance);
        if (expected == null ? current != null : !expected.equals(current)) return false;
        if (previous == null) scopeInstances(prefix, true);
        // SharedPreferences can update its process cache even when the disk commit fails. Never
        // report such cached state as durable, or attempt another write in this process.
        commitUnconfirmed = true;
        if (!storage.write(key, encoded)) throw new IllegalStateException();
        commitUnconfirmed = false;
        return true;
    }

    private List<String> scopeInstances(String prefix, boolean inserting) {
        List<String> instances = new ArrayList<>();
        int total = 0;
        for (String key : storage.keys()) {
            if (++total > MAX_TOTAL) throw new IllegalStateException();
            if (!key.startsWith(prefix)) continue;
            String instance = key.substring(prefix.length());
            if (!canonicalToken(instance, 16) || instances.size() == MAX_PER_SCOPE) throw new IllegalStateException();
            instances.add(instance);
        }
        if (inserting && (total == MAX_TOTAL || instances.size() == MAX_PER_SCOPE)) throw new IllegalStateException();
        return instances;
    }

    private String readValidated(String key, String instance) {
        String encoded = storage.read(key);
        if (encoded != null) {
            try { new Record(instance, encoded); }
            catch (IllegalArgumentException invalid) { throw new IllegalStateException(); }
        }
        return encoded;
    }

    private void requireAvailable() {
        if (commitUnconfirmed) throw new IllegalStateException();
    }

    private static String prefix(String scope) {
        if (!canonicalToken(scope, 32)) throw new IllegalArgumentException();
        return scope + '.';
    }

    private static String checkedInstance(String instance) {
        if (!canonicalToken(instance, 16)) throw new IllegalArgumentException();
        return instance;
    }

    private static boolean canonicalToken(String value, int size) {
        if (value == null || value.length() != (size == 16 ? 22 : 43)) return false;
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(value);
            if (decoded.length != size || !Base64.getUrlEncoder().withoutPadding().encodeToString(decoded).equals(value)) return false;
            for (byte b : decoded) if (b != 0) return true;
            return false;
        } catch (IllegalArgumentException invalid) { return false; }
    }
}
