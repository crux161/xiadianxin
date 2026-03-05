export const KYU2_DC_MAGIC = "KYU2";
export const KYU2_DC_VERSION = 1;

const PACKET_TYPE_CHUNK = 2;
const PACKET_TYPE_COMPLETE = 3;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function writeU32(view: DataView, offset: number, value: number): number {
  view.setUint32(offset, value >>> 0, true);
  return offset + 4;
}

function readU32(view: DataView, offset: number): [number, number] {
  return [view.getUint32(offset, true), offset + 4];
}

function writeU16(view: DataView, offset: number, value: number): number {
  view.setUint16(offset, value & 0xffff, true);
  return offset + 2;
}

function readU16(view: DataView, offset: number): [number, number] {
  return [view.getUint16(offset, true), offset + 2];
}

function writeU64AsTwoU32(view: DataView, offset: number, value: number): number {
  const safe = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  const low = safe >>> 0;
  const high = Math.floor(safe / 0x100000000) >>> 0;
  offset = writeU32(view, offset, low);
  offset = writeU32(view, offset, high);
  return offset;
}

function readU64AsTwoU32(view: DataView, offset: number): [number, number] {
  const [low, o1] = readU32(view, offset);
  const [high, o2] = readU32(view, o1);
  return [high * 0x100000000 + low, o2];
}

export type Kyu2BinaryPacket =
  | {
      type: "chunk";
      transferId: string;
      chunkIndex: number;
      totalChunks: number;
      payload: Uint8Array;
    }
  | {
      type: "complete";
      transferId: string;
      totalBytes: number;
      sha256?: string;
    };

export function encodeKyu2ChunkPacket(opts: {
  transferId: string;
  chunkIndex: number;
  totalChunks: number;
  payload: Uint8Array;
}): Uint8Array {
  const transferIdBytes = textEncoder.encode(opts.transferId);
  const payload = opts.payload;
  const packet = new Uint8Array(
    4 + // magic
      1 + // version
      1 + // type
      2 + // transfer id len
      transferIdBytes.length +
      4 + // chunk index
      4 + // total chunks
      4 + // payload len
      payload.length,
  );
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  let offset = 0;
  packet.set(textEncoder.encode(KYU2_DC_MAGIC), offset);
  offset += 4;
  packet[offset++] = KYU2_DC_VERSION;
  packet[offset++] = PACKET_TYPE_CHUNK;
  offset = writeU16(view, offset, transferIdBytes.length);
  packet.set(transferIdBytes, offset);
  offset += transferIdBytes.length;
  offset = writeU32(view, offset, opts.chunkIndex);
  offset = writeU32(view, offset, opts.totalChunks);
  offset = writeU32(view, offset, payload.length);
  packet.set(payload, offset);
  return packet;
}

export function encodeKyu2CompletePacket(opts: {
  transferId: string;
  totalBytes: number;
  sha256?: string;
}): Uint8Array {
  const transferIdBytes = textEncoder.encode(opts.transferId);
  const shaBytes = textEncoder.encode(opts.sha256 ?? "");
  const packet = new Uint8Array(
    4 + // magic
      1 + // version
      1 + // type
      2 + // transfer id len
      transferIdBytes.length +
      8 + // total bytes
      2 + // sha len
      shaBytes.length,
  );
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  let offset = 0;
  packet.set(textEncoder.encode(KYU2_DC_MAGIC), offset);
  offset += 4;
  packet[offset++] = KYU2_DC_VERSION;
  packet[offset++] = PACKET_TYPE_COMPLETE;
  offset = writeU16(view, offset, transferIdBytes.length);
  packet.set(transferIdBytes, offset);
  offset += transferIdBytes.length;
  offset = writeU64AsTwoU32(view, offset, opts.totalBytes);
  offset = writeU16(view, offset, shaBytes.length);
  packet.set(shaBytes, offset);
  return packet;
}

export function decodeKyu2Packet(payload: Uint8Array): Kyu2BinaryPacket | null {
  if (payload.byteLength < 4 + 1 + 1 + 2) return null;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let offset = 0;

  const magic = textDecoder.decode(payload.subarray(offset, offset + 4));
  offset += 4;
  if (magic !== KYU2_DC_MAGIC) return null;

  const version = payload[offset++];
  if (version !== KYU2_DC_VERSION) return null;

  const packetType = payload[offset++];
  let transferIdLen = 0;
  [transferIdLen, offset] = readU16(view, offset);
  if (offset + transferIdLen > payload.byteLength) return null;
  const transferId = textDecoder.decode(payload.subarray(offset, offset + transferIdLen));
  offset += transferIdLen;

  if (packetType === PACKET_TYPE_CHUNK) {
    if (offset + 12 > payload.byteLength) return null;
    let chunkIndex = 0;
    let totalChunks = 0;
    let chunkLen = 0;
    [chunkIndex, offset] = readU32(view, offset);
    [totalChunks, offset] = readU32(view, offset);
    [chunkLen, offset] = readU32(view, offset);
    if (offset + chunkLen > payload.byteLength) return null;
    return {
      type: "chunk",
      transferId,
      chunkIndex,
      totalChunks,
      payload: payload.subarray(offset, offset + chunkLen),
    };
  }

  if (packetType === PACKET_TYPE_COMPLETE) {
    if (offset + 10 > payload.byteLength) return null;
    let totalBytes = 0;
    let shaLen = 0;
    [totalBytes, offset] = readU64AsTwoU32(view, offset);
    [shaLen, offset] = readU16(view, offset);
    if (offset + shaLen > payload.byteLength) return null;
    const sha256 =
      shaLen > 0
        ? textDecoder.decode(payload.subarray(offset, offset + shaLen))
        : undefined;
    return {
      type: "complete",
      transferId,
      totalBytes,
      sha256,
    };
  }

  return null;
}
