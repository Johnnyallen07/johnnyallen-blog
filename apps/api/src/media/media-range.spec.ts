import { parseByteRange } from './media-range';

describe('parseByteRange', () => {
  it('returns null when no range was requested', () => {
    expect(parseByteRange(undefined, 1000)).toBeNull();
  });

  it('parses bounded, open-ended, and suffix ranges', () => {
    expect(parseByteRange('bytes=100-199', 1000)).toEqual({
      start: 100,
      end: 199,
    });
    expect(parseByteRange('bytes=900-', 1000)).toEqual({
      start: 900,
      end: 999,
    });
    expect(parseByteRange('bytes=-100', 1000)).toEqual({
      start: 900,
      end: 999,
    });
  });

  it('clamps an end beyond the object size', () => {
    expect(parseByteRange('bytes=950-2000', 1000)).toEqual({
      start: 950,
      end: 999,
    });
  });

  it('supports continuation ranges beyond 50 MB without a size cap', () => {
    const totalLength = 80 * 1024 * 1024;
    const start = 55 * 1024 * 1024;

    expect(parseByteRange(`bytes=${start}-`, totalLength)).toEqual({
      start,
      end: totalLength - 1,
    });
  });

  it('rejects invalid, multiple, and unsatisfiable ranges', () => {
    expect(() => parseByteRange('items=0-1', 1000)).toThrow(RangeError);
    expect(() => parseByteRange('bytes=0-1,4-5', 1000)).toThrow(RangeError);
    expect(() => parseByteRange('bytes=1000-', 1000)).toThrow(RangeError);
    expect(() => parseByteRange('bytes=50-20', 1000)).toThrow(RangeError);
  });
});
