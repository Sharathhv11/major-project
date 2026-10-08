/**
 * Hash Utilities for Message Fraud Detection
 *
 * Provides a pure TypeScript SHA-256 implementation with zero external dependencies.
 * Deterministic and stable across app restarts, devices, and JavaScript engines.
 */

/**
 * Right rotate (circular shift) for 32-bit unsigned integers.
 */
function rightRotate(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

/**
 * Computes standard SHA-256 hexadecimal hash string for any input text.
 * Handles full UTF-8 encoding (including multi-byte characters and emojis).
 */
export function sha256(input: string): string {
  // Convert string to UTF-8 byte array
  const utf8Bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let charcode = input.charCodeAt(i);
    if (charcode < 0x80) {
      utf8Bytes.push(charcode);
    } else if (charcode < 0x800) {
      utf8Bytes.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
    } else if (charcode < 0xd800 || charcode >= 0xe000) {
      utf8Bytes.push(
        0xe0 | (charcode >> 12),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f),
      );
    } else {
      // UTF-16 surrogate pair
      i++;
      charcode =
        0x10000 + (((charcode & 0x3ff) << 10) | (input.charCodeAt(i) & 0x3ff));
      utf8Bytes.push(
        0xf0 | (charcode >> 18),
        0x80 | ((charcode >> 12) & 0x3f),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f),
      );
    }
  }

  const bitLength = utf8Bytes.length * 8;

  // Append '1' bit (0x80 byte)
  utf8Bytes.push(0x80);

  // Pad with 0 bytes until length % 64 === 56
  while (utf8Bytes.length % 64 !== 56) {
    utf8Bytes.push(0);
  }

  // Append 64-bit length (big-endian)
  const highBits = Math.floor(bitLength / 0x100000000);
  const lowBits = bitLength >>> 0;

  for (let shift = 24; shift >= 0; shift -= 8) {
    utf8Bytes.push((highBits >>> shift) & 0xff);
  }
  for (let shift = 24; shift >= 0; shift -= 8) {
    utf8Bytes.push((lowBits >>> shift) & 0xff);
  }

  // Initial SHA-256 hash values
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  // SHA-256 round constants (first 32 bits of fractional parts of cube roots of first 64 primes)
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391050b1, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  // Process 512-bit chunks (64 bytes each)
  for (let chunk = 0; chunk < utf8Bytes.length; chunk += 64) {
    const w: number[] = new Array(64);
    for (let t = 0; t < 16; t++) {
      const idx = chunk + t * 4;
      w[t] =
        (utf8Bytes[idx] << 24) |
        (utf8Bytes[idx + 1] << 16) |
        (utf8Bytes[idx + 2] << 8) |
        utf8Bytes[idx + 3];
    }
    for (let t = 16; t < 64; t++) {
      const s0 =
        rightRotate(w[t - 15], 7) ^
        rightRotate(w[t - 15], 18) ^
        (w[t - 15] >>> 3);
      const s1 =
        rightRotate(w[t - 2], 17) ^
        rightRotate(w[t - 2], 19) ^
        (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }

    let a = hash[0];
    let b = hash[1];
    let c = hash[2];
    let d = hash[3];
    let e = hash[4];
    let f = hash[5];
    let g = hash[6];
    let h = hash[7];

    for (let t = 0; t < 64; t++) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[t] + w[t]) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  // Format into 64-character lowercase hex string
  let hex = '';
  for (let i = 0; i < 8; i++) {
    const val = hash[i] >>> 0;
    hex += val.toString(16).padStart(8, '0');
  }
  return hex;
}

/**
 * Generates a stable unique hash identifier for a given message.
 * Normalizes leading/trailing whitespace and line breaks so identical messages
 * produce identical hashes consistently across calls.
 *
 * @param message The raw message text to hash
 * @returns 64-character hex string SHA-256 hash
 */
export function generateMessageHash(message: string): string {
  if (!message) {
    return sha256('');
  }
  // Standardize: trim whitespace and normalize carriage returns
  const normalized = message.trim().replace(/\r\n/g, '\n');
  return sha256(normalized);
}
