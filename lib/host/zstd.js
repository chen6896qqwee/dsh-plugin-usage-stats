/**
 * zstd.js — concatenated-frame zstd decompression.
 *
 * DSH appends to `session.v4.jsonl.zstd` one zstd frame per append. Node 26's
 * `zlib.zstdDecompressSync` decodes every concatenated frame, but the Node
 * bundled with DSH (24.21) stops after the first one — and both the sync and
 * streaming APIs behave that way there. So we walk the frame/block headers to
 * find each frame's exact end and decompress the frames one by one.
 *
 * Frame format (RFC 8878): magic, frame header descriptor, optional window
 * descriptor, optional dictionary id, optional content size, then blocks
 * (`last_block`/`type`/`size` packed into a 24-bit little-endian header) and an
 * optional 4-byte checksum.
 */

import zlib from 'node:zlib'

const ZSTD_MAGIC = 0xfd2fb528
const SKIPPABLE_MASK = 0xfffffff0
const SKIPPABLE_MAGIC = 0x184d2a50

const DICT_ID_BYTES = [0, 1, 2, 4]

function need(bytes, offset, length) {
  if (offset + length > bytes.length) throw new Error('zstd: truncated frame')
}

/** Return the end offset (exclusive) of the frame starting at `start`. */
function frameEnd(bytes, start) {
  let offset = start
  need(bytes, offset, 4)
  const magic = bytes.readUInt32LE(offset)
  if (magic !== ZSTD_MAGIC) throw new Error('zstd: bad magic at ' + offset)
  offset += 4
  need(bytes, offset, 1)
  const descriptor = bytes[offset]
  offset += 1
  const fcsFlag = descriptor >> 6
  const singleSegment = (descriptor >> 5) & 1
  const hasChecksum = (descriptor >> 2) & 1
  const dictFlag = descriptor & 3
  if (!singleSegment) offset += 1
  offset += DICT_ID_BYTES[dictFlag]
  const fcsBytes = fcsFlag === 0 ? (singleSegment ? 1 : 0) : fcsFlag === 1 ? 2 : fcsFlag === 2 ? 4 : 8
  offset += fcsBytes
  for (;;) {
    need(bytes, offset, 3)
    const header = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
    offset += 3
    const lastBlock = header & 1
    const blockType = (header >> 1) & 3
    const blockSize = header >>> 3
    if (blockType === 0) offset += blockSize
    else if (blockType === 1) offset += 1
    else if (blockType === 2) offset += blockSize
    else throw new Error('zstd: reserved block type')
    if (lastBlock) break
    need(bytes, offset, 0)
  }
  if (hasChecksum) offset += 4
  if (offset > bytes.length) throw new Error('zstd: frame overruns input')
  return offset
}

/** Split a concatenated zstd buffer into individual frames. */
export function splitFrames(bytes) {
  const frames = []
  let offset = 0
  while (offset < bytes.length) {
    need(bytes, offset, 4)
    const magic = bytes.readUInt32LE(offset)
    if ((magic & SKIPPABLE_MASK) === SKIPPABLE_MAGIC) {
      need(bytes, offset, 8)
      const size = bytes.readUInt32LE(offset + 4)
      offset += 8 + size
      continue
    }
    const end = frameEnd(bytes, offset)
    frames.push(bytes.subarray(offset, end))
    offset = end
  }
  return frames
}

/**
 * Decompress a (possibly multi-frame) zstd buffer.
 * @param {Buffer} bytes
 * @returns {string} UTF-8 payload
 */
export function decompressZstd(bytes) {
  let frames
  try {
    frames = splitFrames(bytes)
  } catch (error) {
    // Not walkable (or a single frame we mis-parsed): hand the whole buffer to
    // zlib, which handles the single-frame case everywhere.
    return zlib.zstdDecompressSync(bytes).toString('utf8')
  }
  if (frames.length <= 1) return zlib.zstdDecompressSync(bytes).toString('utf8')
  const parts = []
  for (const frame of frames) parts.push(zlib.zstdDecompressSync(frame))
  return Buffer.concat(parts).toString('utf8')
}

export default decompressZstd
