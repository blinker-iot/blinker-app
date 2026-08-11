import {
  OTA_COMMAND_START_FLASH,
  buildCommandFrame,
  buildSectorPackets,
  crc16,
  isValidCrcFrame,
  readUint16LE,
} from './ota-protocol';

describe('OTA protocol helpers', () => {
  it('calculates CRC-16/XMODEM', () => {
    expect(crc16(new TextEncoder().encode('123456789'))).toBe(0x31c3);
  });

  it('builds a valid 20-byte start command', () => {
    const frame = buildCommandFrame(OTA_COMMAND_START_FLASH, 0x12345678);

    expect(frame.byteLength).toBe(20);
    expect(readUint16LE(frame, 0)).toBe(OTA_COMMAND_START_FLASH);
    expect(Array.from(frame.slice(2, 6))).toEqual([0x78, 0x56, 0x34, 0x12]);
    expect(isValidCrcFrame(frame)).toBe(true);
  });

  it('adds the sector CRC only to the final packet', () => {
    const sector = Uint8Array.from({ length: 40 }, (_, index) => index);
    const packets = buildSectorPackets(7, sector, 20);
    const finalPacket = packets.at(-1)!;

    expect(packets.length).toBe(3);
    expect(packets[0][2]).toBe(0);
    expect(packets[1][2]).toBe(1);
    expect(finalPacket[2]).toBe(0xff);
    expect(readUint16LE(finalPacket, finalPacket.length - 2)).toBe(crc16(sector));
  });
});
