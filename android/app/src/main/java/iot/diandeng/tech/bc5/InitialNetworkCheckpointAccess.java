package iot.diandeng.tech.bc5;

/** Two exact metadata keys: the original install stays read-only. */
final class InitialNetworkCheckpointAccess {
    private final String originalScope, originalIntent, networkScope, operation;

    InitialNetworkCheckpointAccess(String originalScope, String originalIntent, String networkScope, String operation) {
        if (originalScope == null || originalIntent == null || networkScope == null || operation == null
            || originalScope.equals(networkScope) || originalIntent.equals(operation)) throw new IllegalArgumentException();
        this.originalScope = originalScope;
        this.originalIntent = originalIntent;
        this.networkScope = networkScope;
        this.operation = operation;
    }

    boolean permitsRead(String scope, String intent) {
        return permitsWrite(scope, intent) || (originalScope.equals(scope) && originalIntent.equals(intent));
    }

    boolean permitsWrite(String scope, String intent) {
        return networkScope.equals(scope) && operation.equals(intent);
    }
}
