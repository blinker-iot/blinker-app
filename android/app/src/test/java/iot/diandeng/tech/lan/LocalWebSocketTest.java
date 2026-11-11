package iot.diandeng.tech.lan;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.net.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import org.java_websocket.enums.Role;
import org.java_websocket.exceptions.InvalidDataException;

public class LocalWebSocketTest {
    @Test public void destinationNeverResolvesDnsOrAcceptsPublicLoopbackBroadcastOrOwnAddress() {
        byte[] local = LocalDestination.address("192.168.4.12");
        assertTrue(LocalDestination.onLink(LocalDestination.address("192.168.4.13"), local, 24));
        for (String host : new String[]{"localhost", "192.168.04.13", "0xc0a8040d", "127.0.0.1", "8.8.8.8",
            "192.168.4.256", "192.168.4.1/", "192.168.4.1:8920", "::1", "224.0.0.1", "100.64.0.1", ""}) {
            try { LocalDestination.address(host); fail(host); } catch (IllegalArgumentException expected) { }
        }
        for (String host : new String[]{"192.168.5.13", "192.168.4.12", "192.168.4.0", "192.168.4.255"})
            assertFalse(host, LocalDestination.onLink(LocalDestination.address(host), local, 24));
        assertFalse(LocalDestination.onLink(local, new byte[16], 64));
    }

    @Test public void draftKeepsBoundedConfigurationAcrossLibraryCopiesAndSplitLengthHeaders() throws Exception {
        LocalWebSocketDraft draft = (LocalWebSocketDraft) new LocalWebSocketDraft().copyInstance();
        draft.setParseMode(Role.CLIENT);
        assertEquals(0, draft.translateFrame(ByteBuffer.wrap(new byte[]{(byte) 0x82, 126})).size());
        try { draft.translateFrame(ByteBuffer.wrap(new byte[]{1, (byte) 165})); fail("declared 421 must reject without payload"); }
        catch (InvalidDataException expected) { }
        try { draft.translateHandshake(ByteBuffer.wrap(new byte[1024])); fail("HTTP header is capped"); }
        catch (InvalidDataException expected) { }
    }

    private interface Peer { void run(Socket socket) throws Exception; }
    private static final class Fixture implements AutoCloseable {
        final ServerSocket listener = new ServerSocket(0, 1, InetAddress.getLoopbackAddress());
        final ScheduledThreadPoolExecutor clock = new ScheduledThreadPoolExecutor(1);
        final ExecutorService reader = Executors.newSingleThreadExecutor();
        final Future<?> work;
        final LocalWebSocketSession client;
        volatile Socket accepted;
        Fixture(Peer peer) throws Exception {
            clock.setRemoveOnCancelPolicy(true);
            work = reader.submit(() -> {
                try (Socket socket = listener.accept()) {
                    accepted = socket; socket.setSoTimeout(5000); peer.run(socket);
                } catch (Exception error) { throw new CompletionException(error); }
            });
            client = new LocalWebSocketSession("127.0.0.1", listener.getLocalPort(), socket -> {
                assertFalse("network binder runs before connect", socket.isConnected());
            }, clock);
            client.connect();
        }
        @Override public void close() throws Exception {
            client.close(); if (accepted != null) accepted.close(); listener.close();
            reader.shutdownNow(); clock.shutdownNow();
            assertTrue(reader.awaitTermination(3, TimeUnit.SECONDS));
        }
    }
    private static String request(Socket socket) throws Exception {
        ByteArrayOutputStream header = new ByteArrayOutputStream();
        String value = "";
        while (!value.endsWith("\r\n\r\n") && header.size() < 1024) {
            int b = socket.getInputStream().read(); if (b < 0) throw new EOFException();
            header.write(b); value = header.toString(StandardCharsets.US_ASCII);
        }
        assertTrue(value.startsWith("GET /bbp2 HTTP/1.1\r\n"));
        assertFalse(value.toLowerCase(Locale.ROOT).contains("authorization:"));
        return value;
    }
    private static void upgrade(Socket socket) throws Exception {
        String key = Arrays.stream(request(socket).split("\r\n")).filter(line -> line.toLowerCase(Locale.ROOT)
            .startsWith("sec-websocket-key:")).findFirst().get().split(":", 2)[1].trim();
        String accept = Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-1")
            .digest((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").getBytes(StandardCharsets.US_ASCII)));
        socket.getOutputStream().write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n"
            + "Connection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
    }
    private static byte[] frame(int opcode, int length) {
        ByteBuffer result = ByteBuffer.allocate((length < 126 ? 2 : 4) + length);
        result.put((byte) opcode);
        if (length < 126) result.put((byte) length); else result.put((byte) 126).putShort((short) length);
        while (result.hasRemaining()) result.put((byte) 7);
        return result.array();
    }

    @Test public void actualSocketHandlesBinaryReadsWritesAndClosesPendingReceive() throws Exception {
        try (Fixture h = new Fixture(socket -> {
            upgrade(socket); socket.getOutputStream().write(frame(0x82, 420));
            DataInputStream input = new DataInputStream(socket.getInputStream());
            assertEquals(0x82, input.readUnsignedByte()); assertEquals(0x83, input.readUnsignedByte());
            byte[] mask = input.readNBytes(4), payload = input.readNBytes(3);
            assertArrayEquals(new byte[]{1, 2, 3}, new byte[]{(byte)(payload[0] ^ mask[0]),
                (byte)(payload[1] ^ mask[1]), (byte)(payload[2] ^ mask[2])});
            socket.getOutputStream().write(frame(0x82, 2));
            assertEquals(-1, input.read());
        })) {
            h.client.opened.get(3, TimeUnit.SECONDS);
            assertEquals(420, h.client.receive().get(3, TimeUnit.SECONDS).length);
            h.client.send(new byte[]{1, 2, 3}).get(3, TimeUnit.SECONDS);
            assertEquals(2, h.client.receive().get(3, TimeUnit.SECONDS).length);
            CompletableFuture<byte[]> pending = h.client.receive(); h.client.close();
            assertTrue(pending.isCompletedExceptionally());
            h.work.get(3, TimeUnit.SECONDS);
            assertEquals(0, h.clock.getQueue().size());
        }
    }

    @Test public void actualSocketRejectsRedirectWithoutFollowingIt() throws Exception {
        try (Fixture h = new Fixture(socket -> {
            request(socket);
            socket.getOutputStream().write("HTTP/1.1 302 Found\r\nLocation: http://8.8.8.8/\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
        })) {
            try { h.client.opened.get(3, TimeUnit.SECONDS); fail(); } catch (ExecutionException expected) { }
            h.client.finished.get(3, TimeUnit.SECONDS); h.work.get(3, TimeUnit.SECONDS);
        }
    }

    @Test public void malformedPeerCannotAllocateOversizeTextMaskedOrUnboundedFragmentMessages() throws Exception {
        List<byte[]> attacks = new ArrayList<>();
        attacks.add(new byte[]{(byte)0x82, 126, 1, (byte)165}); // 421, no body needed to reject.
        attacks.add(new byte[]{(byte)0x82, 127, 0, 0, 0, 1, 0, 0, 0, 0});
        attacks.add(frame(0x81, 1));
        attacks.add(new byte[]{(byte)0x82, (byte)0x81, 1, 2, 3, 4, 0});
        ByteArrayOutputStream fragments = new ByteArrayOutputStream();
        fragments.write(frame(0x02, 0)); for (int i = 0; i < 16; i++) fragments.write(frame(0x00, 0));
        attacks.add(fragments.toByteArray());
        fragments.reset(); fragments.write(frame(0x02, 211)); fragments.write(frame(0x80, 211));
        attacks.add(fragments.toByteArray());
        for (byte[] attack : attacks) {
            try (Fixture h = new Fixture(socket -> { upgrade(socket); socket.getOutputStream().write(attack);
                // A Close response may be sent before disconnect; consume it.
                while (socket.getInputStream().read() != -1) { }
            })) {
                try { h.client.finished.get(3, TimeUnit.SECONDS); }
                catch (TimeoutException error) { throw new AssertionError("Attack not retired: "
                    + Arrays.toString(Arrays.copyOf(attack, Math.min(attack.length, 12))), error); }
                assertTrue(h.client.receive().isCompletedExceptionally());
            }
        }
    }

    @Test public void abortPendingHandshakeDoesNotWaitForPeerOrLeakReader() throws Exception {
        CountDownLatch received = new CountDownLatch(1);
        try (Fixture h = new Fixture(socket -> { request(socket); received.countDown();
            assertEquals(-1, socket.getInputStream().read()); })) {
            assertTrue(received.await(3, TimeUnit.SECONDS)); h.client.close();
            assertTrue(h.client.opened.isCompletedExceptionally()); h.work.get(3, TimeUnit.SECONDS);
        }
    }

    @Test public void fragmentsReassembleAndPartialNextRecordExpiresWithoutKillingIdleSessions() throws Exception {
        try (Fixture h = new Fixture(socket -> {
            upgrade(socket);
            socket.getOutputStream().write(frame(0x02, 210));
            socket.getOutputStream().write(frame(0x89, 0)); // Ping cannot replace the message deadline.
            socket.getOutputStream().write(frame(0x80, 210));
            socket.getOutputStream().write(0x82); // Incomplete next header, then a silent peer.
            while (socket.getInputStream().read() != -1) { }
        })) {
            h.client.opened.get(3, TimeUnit.SECONDS);
            assertEquals(420, h.client.receive().get(2, TimeUnit.SECONDS).length);
            h.client.finished.get(5, TimeUnit.SECONDS);
            assertTrue(h.client.receive().isCompletedExceptionally());
            h.work.get(3, TimeUnit.SECONDS);
        }
    }

    @Test public void stalledConsumerHasOneMailboxAndABoundedReaderWait() throws Exception {
        try (Fixture h = new Fixture(socket -> {
            upgrade(socket);
            socket.getOutputStream().write(frame(0x82, 420));
            socket.getOutputStream().write(frame(0x82, 420));
            while (socket.getInputStream().read() != -1) { }
        })) {
            h.client.opened.get(3, TimeUnit.SECONDS);
            h.client.finished.get(5, TimeUnit.SECONDS); // Deliberately never drain the mailbox.
            assertTrue(h.client.receive().isCompletedExceptionally());
            h.work.get(3, TimeUnit.SECONDS);
        }
    }
}
