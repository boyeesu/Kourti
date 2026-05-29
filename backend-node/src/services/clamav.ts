/**
 * ClamAV scanner using the INSTREAM clamd protocol.
 *
 * No external dependencies: clamd's wire format is tiny — open a TCP
 * socket, write `zINSTREAM\0`, then a sequence of `[u32-be length][bytes]`
 * chunks ending with `[u32-be 0]`. Read back a single line response:
 *   - `stream: OK`              → clean
 *   - `stream: <name> FOUND`    → infected, name is the signature
 *   - any other text            → treated as an error
 *
 * Used at upload time only — buffers are already in memory thanks to
 * multer.memoryStorage(), so we pay no extra disk I/O.
 *
 * If CLAMAV_HOST / CLAMAV_PORT are unset, the scanner is disabled and
 * scanBuffer() returns { ok: true, scanned: false }. This keeps local
 * dev frictionless and lets us roll Garage-side AV out without a chicken-
 * and-egg deploy ordering with the sidecar.
 */
import net from 'node:net';

import { env } from '../config/env.js';

export interface ScanResult {
  ok: boolean;
  /** Signature name reported by clamd when ok=false. */
  virus?: string;
  /** false when the scanner is disabled via missing env vars. */
  scanned: boolean;
}

export function isClamAvConfigured(): boolean {
  return Boolean(env.CLAMAV_HOST && env.CLAMAV_PORT);
}

/**
 * Scan a buffer with clamd's INSTREAM command. Throws on socket /
 * protocol failures; returns {ok:false, virus} on detection.
 *
 * Caller decides what to do when scanned=false (typically: allow the
 * upload but log it so operators notice the sidecar is offline).
 */
export async function scanBuffer(buffer: Buffer): Promise<ScanResult> {
  if (!isClamAvConfigured()) {
    return { ok: true, scanned: false };
  }

  const host = env.CLAMAV_HOST!;
  const port = env.CLAMAV_PORT!;
  const timeoutMs = env.CLAMAV_TIMEOUT_MS;
  // clamd's MaxStreamSize is 25MB by default; the multer cap on file
  // uploads is 26MB. Chunking keeps us safe against partial-read corner
  // cases and matches clamd's `StreamMaxLength` default chunking.
  const CHUNK_SIZE = 64 * 1024;

  return await new Promise<ScanResult>((resolve, reject) => {
    const socket = new net.Socket();
    let response = '';
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn();
    };

    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => settle(() => reject(new Error('clamd timeout'))));
    socket.on('error', (err) => settle(() => reject(err)));
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
    });
    socket.on('end', () => {
      settle(() => {
        const trimmed = response.trim();
        if (/: OK$/.test(trimmed)) {
          resolve({ ok: true, scanned: true });
          return;
        }
        const found = /:\s+(.+?)\s+FOUND$/.exec(trimmed);
        if (found) {
          resolve({ ok: false, virus: found[1], scanned: true });
          return;
        }
        reject(new Error(`clamd unexpected response: ${trimmed.slice(0, 200)}`));
      });
    });

    socket.connect(port, host, () => {
      socket.write('zINSTREAM\0');
      for (let off = 0; off < buffer.length; off += CHUNK_SIZE) {
        const chunk = buffer.subarray(off, Math.min(off + CHUNK_SIZE, buffer.length));
        const lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32BE(chunk.length, 0);
        socket.write(lenBuf);
        socket.write(chunk);
      }
      // Trailing zero-length chunk signals end-of-stream.
      const term = Buffer.alloc(4);
      term.writeUInt32BE(0, 0);
      socket.write(term);
    });
  });
}
