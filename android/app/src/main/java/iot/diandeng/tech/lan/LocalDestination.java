package iot.diandeng.tech.lan;

// Literal, private IPv4 on the selected WiFi link. Discovery is an untrusted
// hint, not permission to resolve arbitrary names or connect through a VPN/WAN.
final class LocalDestination {
    static byte[] address(String host) {
        if (host == null || host.length() > 15) throw new IllegalArgumentException();
        String[] parts = host.split("\\.", -1);
        if (parts.length != 4) throw new IllegalArgumentException();
        byte[] result = new byte[4];
        for (int i = 0; i < 4; i++) {
            if (!parts[i].matches("0|[1-9][0-9]{0,2}")) throw new IllegalArgumentException();
            int value = Integer.parseInt(parts[i]);
            if (value > 255) throw new IllegalArgumentException();
            result[i] = (byte) value;
        }
        int a = result[0] & 255, b = result[1] & 255;
        if (!(a == 10 || (a == 172 && b >= 16 && b <= 31) || (a == 192 && b == 168)
            || (a == 169 && b == 254))) throw new IllegalArgumentException();
        return result;
    }

    static boolean onLink(byte[] target, byte[] local, int prefix) {
        if (target.length != 4 || local.length != 4 || prefix < 1 || prefix > 30) return false;
        long to = number(target), from = number(local), mask = (0xffffffffL << (32 - prefix)) & 0xffffffffL;
        long host = to & ~mask;
        return to != from && (to & mask) == (from & mask) && host != 0 && host != (~mask & 0xffffffffL);
    }
    private static long number(byte[] address) {
        long result = 0; for (byte value : address) result = (result << 8) | (value & 255); return result;
    }
}
