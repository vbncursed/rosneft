import type { SnapshotMeta } from "./store-policy";

/** [4-byte meta length][meta JSON][body]. */
export function encodeSnapshot(meta: SnapshotMeta, body: Buffer): Buffer {
  const json = Buffer.from(JSON.stringify(meta));
  const head = Buffer.alloc(4);
  head.writeUInt32BE(json.length);
  return Buffer.concat([head, json, body]);
}

/** Throws on a file too short for its own header or with bad meta JSON; null when the declared meta overruns the file. */
export function decodeSnapshot(data: Buffer): { meta: SnapshotMeta; body: Buffer } | null {
  const metaEnd = 4 + data.readUInt32BE(0);
  if (metaEnd > data.length) return null;
  return {
    meta: JSON.parse(data.subarray(4, metaEnd).toString("utf8")) as SnapshotMeta,
    body: data.subarray(metaEnd),
  };
}
