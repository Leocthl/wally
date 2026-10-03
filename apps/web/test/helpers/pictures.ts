// Test support: tiny hand-built picture headers (not decodable pictures; the photo code reads headers only) and base64.
import { toBase64 } from "@wally/agent/vision";

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const u16 = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

export function jpegBytes(width = 768, height = 1024): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...u16(16), ...ascii("JFIF"), 0, 1, 1, 0, ...u16(1), ...u16(1), 0, 0, 0xff, 0xc0, ...u16(17), 8, ...u16(height), ...u16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
}

export function pngBytes(width = 64, height = 64): Uint8Array {
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), ...ascii("IHDR"), ...be32(width), ...be32(height), 8, 2, 0, 0, 0, 0, 0, 0, 0]);
}

export const gifBytes = (): Uint8Array => Uint8Array.from(ascii("GIF89a\u0001\u0000\u0001\u0000"));

export const jpegBase64 = (width?: number, height?: number): string => toBase64(jpegBytes(width, height));
export { toBase64 };
