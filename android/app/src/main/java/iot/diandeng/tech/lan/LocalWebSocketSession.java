package iot.diandeng.tech.lan;

import java.io.*;
import java.net.*;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.concurrent.*;
import javax.net.SocketFactory;
import org.java_websocket.WebSocket;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.framing.Framedata;
import org.java_websocket.handshake.ServerHandshake;

// Android-independent message port. No identity, Noise, discovery, MQTT, business
// queue or retry lives here. One native session, one pending send/receive and one
// unread message. Writer completion means socket write, NOT a device ACK.
final class LocalWebSocketSession implements AutoCloseable {
    interface Binder { void bind(Socket socket) throws IOException; }
    final CompletableFuture<Void> opened = new CompletableFuture<>();
    final CompletableFuture<Void> finished = new CompletableFuture<>();
    private final Object lock = new Object();
    private final ScheduledExecutorService clock;
    private final WebSocketClient client;
    private final WireSocket socket;
    private CompletableFuture<Void> sending;
    private CompletableFuture<byte[]> receiving;
    private byte[] inbox;
    private boolean closed;
    private boolean pongQueued;
    private ScheduledFuture<?> sendDeadline;
    private ScheduledFuture<?> recordDeadline;
    private long recordSerial;
    private final ScheduledFuture<?> openDeadline;
    private final ScheduledFuture<?> maximumLifetime;

    LocalWebSocketSession(String host, int port, Binder binder, ScheduledExecutorService clock) throws Exception {
        this.clock = clock;
        socket = new WireSocket();
        try { binder.bind(socket); } // Bind the exact selected WiFi network BEFORE connect.
        catch (IOException error) { socket.close(); throw error; }
        client = new WebSocketClient(new URI("ws", null, host, port, "/bbp2", null, null),
            new LocalWebSocketDraft(this::recordProgress), null, 3000) {
            @Override public void onOpen(ServerHandshake handshake) { opened.complete(null); }
            @Override public void onMessage(String value) { LocalWebSocketSession.this.close(); }
            @Override public void onMessage(ByteBuffer value) { accept(value); }
            @Override public void onClose(int code, String reason, boolean remote) { LocalWebSocketSession.this.close(); }
            @Override public void onClosing(int code, String reason, boolean remote) { LocalWebSocketSession.this.close(); }
            @Override public void onError(Exception error) { LocalWebSocketSession.this.close(); }
            @Override public void onWebsocketPing(WebSocket connection, Framedata frame) {
                // Automatic Pong must not create an unbounded writer queue.
                if (!reservePong()) LocalWebSocketSession.this.close();
                else super.onWebsocketPing(connection, frame);
            }
        };
        client.setConnectionLostTimeout(0);
        client.setTcpNoDelay(true);
        client.setProxy(Proxy.NO_PROXY);
        client.setSocketFactory(new SocketFactory() {
            @Override public Socket createSocket() { return socket; }
            @Override public Socket createSocket(String h, int p) throws IOException { throw new IOException(); }
            @Override public Socket createSocket(String h, int p, InetAddress l, int lp) throws IOException { throw new IOException(); }
            @Override public Socket createSocket(InetAddress h, int p) throws IOException { throw new IOException(); }
            @Override public Socket createSocket(InetAddress h, int p, InetAddress l, int lp) throws IOException { throw new IOException(); }
        });
        openDeadline = clock.schedule(this::close, 15, TimeUnit.SECONDS);
        maximumLifetime = clock.schedule(this::close, 300, TimeUnit.SECONDS);
        opened.thenRun(() -> openDeadline.cancel(false));
    }

    void connect() { synchronized (lock) { if (!closed) client.connect(); } }

    CompletableFuture<Void> send(byte[] bytes) {
        CompletableFuture<Void> result;
        boolean failed = false;
        synchronized (lock) {
            if (closed || !client.isOpen()) return failed();
            if (sending != null || bytes.length == 0 || bytes.length > LocalWebSocketDraft.MAX_RECORD) return failed();
            result = new CompletableFuture<>();
            sending = result;
            sendDeadline = clock.schedule(this::close, 3, TimeUnit.SECONDS);
            try { client.send(bytes); } catch (Exception error) { failed = true; }
        }
        if (failed) close();
        return result;
    }

    CompletableFuture<byte[]> receive() {
        synchronized (lock) {
            if (closed || receiving != null) return failed();
            if (inbox != null) {
                byte[] bytes = inbox; inbox = null; lock.notifyAll();
                return CompletableFuture.completedFuture(bytes);
            }
            receiving = new CompletableFuture<>();
            return receiving;
        }
    }

    private void accept(ByteBuffer data) {
        if (!data.hasRemaining() || data.remaining() > LocalWebSocketDraft.MAX_RECORD) { close(); return; }
        CompletableFuture<byte[]> pending = null;
        byte[] bytes = null;
        synchronized (lock) {
            // Backpressure the dedicated socket reader, never the Android main
            // thread. No unbounded JS event buffer, and no dropping a BBP ACK.
            long end = System.nanoTime() + 3_000_000_000L;
            while (!closed && inbox != null && System.nanoTime() < end) {
                try { TimeUnit.NANOSECONDS.timedWait(lock, Math.max(1, end - System.nanoTime())); }
                catch (InterruptedException error) { Thread.currentThread().interrupt(); break; }
            }
            if (!closed && inbox == null && !Thread.currentThread().isInterrupted()) {
                bytes = new byte[data.remaining()]; data.get(bytes);
                if (receiving == null) inbox = bytes;
                else { pending = receiving; receiving = null; }
            }
        }
        if (bytes == null) close();
        else if (pending != null) pending.complete(bytes);
    }

    private void written() {
        CompletableFuture<Void> pending;
        synchronized (lock) {
            if (closed || sending == null) return;
            pending = sending; sending = null;
            sendDeadline.cancel(false);
        }
        pending.complete(null);
    }

    private boolean reservePong() {
        synchronized (lock) {
            if (closed || pongQueued) return false;
            pongQueued = true; return true;
        }
    }

    private void recordProgress(long serial) {
        synchronized (lock) {
            if (closed || recordSerial == serial) return;
            recordSerial = serial;
            if (recordDeadline != null) recordDeadline.cancel(false);
            recordDeadline = serial == 0 ? null : clock.schedule(this::close, 3, TimeUnit.SECONDS);
        }
    }

    private static <T> CompletableFuture<T> failed() {
        CompletableFuture<T> result = new CompletableFuture<>();
        result.completeExceptionally(new IOException("LOCAL_WS_CLOSED_OR_BUSY")); return result;
    }

    @Override public void close() {
        CompletableFuture<Void> pendingSend;
        CompletableFuture<byte[]> pendingReceive;
        synchronized (lock) {
            if (closed) return;
            closed = true;
            openDeadline.cancel(false); maximumLifetime.cancel(false);
            if (sendDeadline != null) sendDeadline.cancel(false);
            if (recordDeadline != null) recordDeadline.cancel(false);
            if (inbox != null) { Arrays.fill(inbox, (byte) 0); inbox = null; }
            pendingSend = sending; sending = null;
            pendingReceive = receiving; receiving = null;
            lock.notifyAll();
        }
        // Closing the raw socket also interrupts blocked OS reads/writes. Do not
        // wait for the peer's graceful Close or drain old queued business data.
        try { socket.close(); } catch (IOException ignored) { }
        IOException error = new IOException("LOCAL_WS_CLOSED");
        opened.completeExceptionally(error);
        if (pendingSend != null) pendingSend.completeExceptionally(error);
        if (pendingReceive != null) pendingReceive.completeExceptionally(error);
        finished.complete(null);
        client.closeConnection(1000, "");
    }

    private final class WireSocket extends Socket {
        @Override public OutputStream getOutputStream() throws IOException {
            return new FilterOutputStream(super.getOutputStream()) {
                @Override public void write(byte[] bytes, int offset, int length) throws IOException {
                    out.write(bytes, offset, length); out.flush();
                    if (length >= 2 && (bytes[offset] & 255) == 0x82) written();
                    if (length >= 2 && (bytes[offset] & 255) == 0x8a) {
                        synchronized (lock) { pongQueued = false; }
                    }
                }
            };
        }
    }
}
