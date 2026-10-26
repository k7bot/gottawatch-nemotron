// deviceId: ≥ 128 bits from a CSPRNG, base64url (tv-app §3.1; contract DeviceId = 22–64 chars).
export function bytesToBase64Url(bytes: Uint8Array): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += abc[(n >> 18) & 63]! + abc[(n >> 12) & 63]! + abc[(n >> 6) & 63]! + abc[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += abc[(n >> 18) & 63]! + abc[(n >> 12) & 63]!;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += abc[(n >> 18) & 63]! + abc[(n >> 12) & 63]! + abc[(n >> 6) & 63]!;
  }
  return out;
}
export const newDeviceId = (randomBytes: (n: number) => Uint8Array) => bytesToBase64Url(randomBytes(16)); // 22 chars
