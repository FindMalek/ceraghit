const ascii = (bytes: Uint8Array, at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length))

/**
 * Width and height from the header of a WebP file, or null when the bytes are not a well-formed WebP. Reads only the
 * header (VP8, VP8L or VP8X chunk), nothing is decoded, so a hostile file cannot cost memory or time.
 */
export function readWebpSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(4, true) + 8 > bytes.length) return null
  const chunk = ascii(bytes, 12, 4)
  const data = 20
  if (chunk === "VP8 ") {
    if (bytes[data + 3] !== 0x9d || bytes[data + 4] !== 0x01 || bytes[data + 5] !== 0x2a) return null
    return { width: view.getUint16(data + 6, true) & 0x3fff, height: view.getUint16(data + 8, true) & 0x3fff }
  }
  if (chunk === "VP8L") {
    if (bytes[data] !== 0x2f) return null
    const bits = view.getUint32(data + 1, true)
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (chunk === "VP8X") {
    const side = (at: number) => (bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16)) + 1
    return { width: side(data + 4), height: side(data + 7) }
  }
  return null
}
