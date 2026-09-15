// Minimal ZIP reader (central directory + stored/deflate entries), enough for GTFS feeds.
// Avoids a dependency on an external unzip binary in CI.
import { inflateRawSync } from "node:zlib";

export type ZipEntry = { name: string; compressedSize: number; uncompressedSize: number; method: number; localHeaderOffset: number };

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export function listZipEntries(buffer: Buffer): ZipEntry[] {
  // Scan backwards for the end-of-central-directory record (comment may follow it).
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Archive ZIP invalide : répertoire central introuvable.");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) throw new Error("Archive ZIP invalide : entrée centrale corrompue.");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    entries.push({ name, compressedSize, uncompressedSize, method, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function readZipEntry(buffer: Buffer, entry: ZipEntry): Buffer {
  const base = entry.localHeaderOffset;
  if (buffer.readUInt32LE(base) !== LOCAL_SIGNATURE) throw new Error(`Archive ZIP invalide : en-tête local manquant pour ${entry.name}.`);
  const nameLength = buffer.readUInt16LE(base + 26);
  const extraLength = buffer.readUInt16LE(base + 28);
  const start = base + 30 + nameLength + extraLength;
  const data = buffer.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) return inflateRawSync(data);
  throw new Error(`Méthode de compression ZIP non gérée (${entry.method}) pour ${entry.name}.`);
}

export function readZipText(buffer: Buffer, name: string): string {
  const entry = listZipEntries(buffer).find((e) => e.name === name);
  if (!entry) throw new Error(`Fichier ${name} absent de l'archive GTFS.`);
  return readZipEntry(buffer, entry).toString("utf8");
}
