export const BLE_OTA_SERVICE_UUID = '00008018-0000-1000-8000-00805f9b34fb';
export const BLE_OTA_FIRMWARE_CHARACTERISTIC_UUID = '00008020-0000-1000-8000-00805f9b34fb';
export const BLE_OTA_COMMAND_CHARACTERISTIC_UUID = '00008022-0000-1000-8000-00805f9b34fb';

export const OTA_SECTOR_SIZE = 4096;
export const OTA_COMMAND_FRAME_SIZE = 20;
export const OTA_COMMAND_START_FLASH = 0x0001;
export const OTA_COMMAND_STOP = 0x0002;
export const OTA_COMMAND_ACK = 0x0003;
export const OTA_COMMAND_START_FILESYSTEM = 0x0004;

export const OTA_ACK_OK = 0x0000;
export const OTA_ACK_CRC_ERROR = 0x0001;
export const OTA_ACK_INDEX_ERROR = 0x0002;
export const OTA_ACK_SIGNATURE_ERROR = 0x0003;
export const OTA_ACK_START_ERROR = 0x0005;

const FIRMWARE_PACKET_HEADER_SIZE = 3;
const FIRMWARE_PACKET_CRC_SIZE = 2;

export function crc16(data: Uint8Array): number {
  let crc = 0;

  for (const byte of data) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }

  return crc;
}

export function readUint16LE(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

export function writeUint16LE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
}

export function writeUint32LE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
  data[offset + 2] = (value >> 16) & 0xff;
  data[offset + 3] = (value >> 24) & 0xff;
}

export function buildCommandFrame(commandId: number, totalSize?: number): Uint8Array {
  const frame = new Uint8Array(OTA_COMMAND_FRAME_SIZE);
  writeUint16LE(frame, 0, commandId);
  if (typeof totalSize === 'number') writeUint32LE(frame, 2, totalSize);
  writeUint16LE(frame, 18, crc16(frame.subarray(0, 18)));
  return frame;
}

export function isValidCrcFrame(data: Uint8Array): boolean {
  if (data.byteLength < 4) return false;
  const expected = readUint16LE(data, data.byteLength - 2);
  return crc16(data.subarray(0, data.byteLength - 2)) === expected;
}

export function buildSectorPackets(
  sectorIndex: number,
  sector: Uint8Array,
  packetSize: number,
): Uint8Array[] {
  const payloadSize = packetSize - FIRMWARE_PACKET_HEADER_SIZE;
  const finalPayloadSize = payloadSize - FIRMWARE_PACKET_CRC_SIZE;
  if (finalPayloadSize <= 0) throw new Error(`无效的 BLE 包大小：${packetSize}`);

  const packets: Uint8Array[] = [];
  const sectorCrc = crc16(sector);
  let offset = 0;
  let sequence = 0;

  while (offset < sector.byteLength) {
    const remaining = sector.byteLength - offset;
    const isLast = remaining <= finalPayloadSize;
    let chunkSize = isLast ? remaining : Math.min(payloadSize, remaining);

    if (!isLast && remaining - chunkSize === 0) {
      chunkSize = remaining - finalPayloadSize;
    }

    const packet = new Uint8Array(
      FIRMWARE_PACKET_HEADER_SIZE + chunkSize + (isLast ? FIRMWARE_PACKET_CRC_SIZE : 0),
    );
    writeUint16LE(packet, 0, sectorIndex);
    packet[2] = isLast ? 0xff : sequence++;
    packet.set(sector.subarray(offset, offset + chunkSize), FIRMWARE_PACKET_HEADER_SIZE);
    if (isLast) writeUint16LE(packet, FIRMWARE_PACKET_HEADER_SIZE + chunkSize, sectorCrc);

    packets.push(packet);
    offset += chunkSize;
  }

  return packets;
}

export function bytesToDataView(data: Uint8Array): DataView {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

export function dataViewToBytes(value: DataView): Uint8Array {
  return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}
