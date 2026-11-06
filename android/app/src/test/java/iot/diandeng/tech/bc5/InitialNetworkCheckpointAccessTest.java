package iot.diandeng.tech.bc5;

import static org.junit.Assert.*;
import org.junit.Test;

/** Pure scope policy: the existing install record is never a write target. */
public final class InitialNetworkCheckpointAccessTest {
    private final InitialNetworkCheckpointAccess access =
        new InitialNetworkCheckpointAccess("original-scope", "original-intent", "network-scope", "new-operation");

    @Test public void readsOnlyTheTwoExactCoordinates() {
        assertTrue(access.permitsRead("original-scope", "original-intent"));
        assertTrue(access.permitsRead("network-scope", "new-operation"));
        for (String scope : new String[] { "other-scope", "original-scope", "network-scope", null }) {
            for (String operation : new String[] { "other-operation", "original-intent", "new-operation", null }) {
                boolean expected = ("original-scope".equals(scope) && "original-intent".equals(operation))
                    || ("network-scope".equals(scope) && "new-operation".equals(operation));
                assertEquals(expected, access.permitsRead(scope, operation));
            }
        }
    }

    @Test public void writesOnlyTheNewNetworkOperationAndNeverTheOldRecord() {
        assertTrue(access.permitsWrite("network-scope", "new-operation"));
        for (String scope : new String[] { "other-scope", "original-scope", "network-scope", null }) {
            for (String operation : new String[] { "other-operation", "original-intent", "new-operation", null }) {
                assertEquals("network-scope".equals(scope) && "new-operation".equals(operation),
                    access.permitsWrite(scope, operation));
            }
        }
    }

    @Test public void cannotAliasTheOriginalScopeOrIntentAsANetworkOperation() {
        assertThrows(IllegalArgumentException.class,
            () -> new InitialNetworkCheckpointAccess("same", "old", "same", "new"));
        assertThrows(IllegalArgumentException.class,
            () -> new InitialNetworkCheckpointAccess("old-scope", "same", "new-scope", "same"));
        assertThrows(IllegalArgumentException.class,
            () -> new InitialNetworkCheckpointAccess(null, "old", "new-scope", "new"));
        assertThrows(IllegalArgumentException.class,
            () -> new InitialNetworkCheckpointAccess("old-scope", null, "new-scope", "new"));
        assertThrows(IllegalArgumentException.class,
            () -> new InitialNetworkCheckpointAccess("old-scope", "old", null, "new"));
        assertThrows(IllegalArgumentException.class,
            () -> new InitialNetworkCheckpointAccess("old-scope", "old", "new-scope", null));
    }
}
