export interface ByteRange {
  start: number;
  end: number;
}

/** Parse one RFC 7233 byte range. Multiple ranges are intentionally rejected. */
export function parseByteRange(
  header: string | undefined,
  totalLength: number,
): ByteRange | null {
  if (!header) return null;
  if (!Number.isSafeInteger(totalLength) || totalLength <= 0) {
    throw new RangeError('Invalid resource length');
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || (!match[1] && !match[2])) {
    throw new RangeError('Unsupported byte range');
  }

  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      throw new RangeError('Invalid suffix byte range');
    }
    start = Math.max(0, totalLength - suffixLength);
    end = totalLength - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : totalLength - 1;
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= totalLength ||
    end < start
  ) {
    throw new RangeError('Unsatisfiable byte range');
  }

  return { start, end: Math.min(end, totalLength - 1) };
}
