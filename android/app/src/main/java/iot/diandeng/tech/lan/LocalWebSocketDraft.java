package iot.diandeng.tech.lan;

import java.nio.ByteBuffer;
import java.util.Collections;
import java.util.List;
import java.util.function.LongConsumer;
import org.java_websocket.drafts.Draft;
import org.java_websocket.drafts.Draft_6455;
import org.java_websocket.enums.HandshakeState;
import org.java_websocket.exceptions.InvalidDataException;
import org.java_websocket.exceptions.InvalidHandshakeException;
import org.java_websocket.framing.Framedata;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.handshake.Handshakedata;
import org.java_websocket.handshake.ServerHandshake;

// The library checks declared payload and aggregate sizes before allocation.
// Add bounded HTTP and fragment counts (including zero-byte fragments), rather
// than accepting an unbounded message then checking it in onMessage().
final class LocalWebSocketDraft extends Draft_6455 {
    static final int MAX_RECORD = 420;
    private final LongConsumer progress;
    private int header, opcode, length, remaining, aggregate, fragments;
    private boolean fin, fragmented;
    private long serial;

    LocalWebSocketDraft() { this(value -> {}); }
    LocalWebSocketDraft(LongConsumer progress) { super(Collections.emptyList(), MAX_RECORD); this.progress = progress; }
    @Override public Draft copyInstance() { return new LocalWebSocketDraft(progress); }

    @Override public Handshakedata translateHandshake(ByteBuffer input) throws InvalidHandshakeException {
        int start = input.position(), length = Math.min(input.remaining(), 1024);
        boolean complete = false;
        for (int i = 3; i < length; i++) {
            if (input.get(start + i - 3) == 13 && input.get(start + i - 2) == 10
                && input.get(start + i - 1) == 13 && input.get(start + i) == 10) { complete = true; break; }
        }
        if (!complete && input.remaining() >= 1024) throw new InvalidHandshakeException("LOCAL_WS_HTTP_LIMIT");
        return super.translateHandshake(input);
    }

    @Override public HandshakeState acceptHandshakeAsClient(ClientHandshake request, ServerHandshake response)
        throws InvalidHandshakeException {
        if (response.getHttpStatus() != 101 || response.hasFieldValue("Sec-WebSocket-Extensions")
            || response.hasFieldValue("Sec-WebSocket-Protocol")) return HandshakeState.NOT_MATCHED;
        return super.acceptHandshakeAsClient(request, response);
    }

    @Override public List<Framedata> translateFrame(ByteBuffer input) throws InvalidDataException {
        // Inspect the original wire BEFORE decoding: the upstream decoded
        // Framedata does not preserve the received mask bit. No payload copy,
        // encoding, reassembly or second protocol implementation here.
        ByteBuffer bytes = input.asReadOnlyBuffer();
        while (bytes.hasRemaining()) {
            if (remaining != 0) {
                int take = Math.min(remaining, bytes.remaining());
                bytes.position(bytes.position() + take); remaining -= take;
                if (remaining == 0) finishFrame();
                continue;
            }
            int b = bytes.get() & 255;
            if (header == 0) {
                if (!fragmented) serial++;
                opcode = b & 15; fin = (b & 128) != 0;
                if ((b & 112) != 0 || !(opcode == 0 || opcode == 2 || opcode == 8 || opcode == 9 || opcode == 10)
                    || (opcode >= 8 && !fin) || (opcode == 0 && !fragmented) || (opcode == 2 && fragmented)) reject();
                header = 1;
            } else if (header == 1) {
                if ((b & 128) != 0 || b == 127 || (opcode >= 8 && b > 125)) reject();
                length = b; header = b == 126 ? 2 : 4;
                if (header == 4) payload();
            } else if (header == 2) { length = b << 8; header = 3; }
            else {
                length |= b;
                if (length < 126) reject();
                header = 4; payload();
            }
        }
        progress.accept(header != 0 || remaining != 0 || fragmented ? serial : 0);
        return super.translateFrame(input);
    }
    private void payload() throws InvalidDataException {
        if (length > MAX_RECORD) reject();
        if (opcode < 8) {
            if (opcode == 2) aggregate = 0;
            aggregate += length;
            if (++fragments > 16 || aggregate > MAX_RECORD || (fin && aggregate == 0)) reject();
        }
        remaining = length;
        if (remaining == 0) finishFrame();
    }
    private void finishFrame() {
        header = 0;
        if (opcode < 8) {
            fragmented = !fin;
            if (fin) { aggregate = 0; fragments = 0; }
        }
    }
    private static void reject() throws InvalidDataException {
        throw new InvalidDataException(1002, "LOCAL_WS_FRAME_INVALID");
    }
}
