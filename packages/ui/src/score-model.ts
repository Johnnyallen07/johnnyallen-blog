export type Point = { x: number; y: number };
export type Stroke = {
  tool: "pen" | "line";
  color: string;
  width: number;
  points: Point[];
};
export type PageAnnotations = { page: string; strokes: Stroke[] };
export type ScoreDocument = {
  title: string;
  fileUrl: string;
  fileType?: string;
  pages?: { key: string; url: string }[] | null;
  annotations?: PageAnnotations[] | null;
};
export type ReadingLayout = "single" | "double" | "continuous";

export function resolvePage(
  value: string | number,
  current: number,
  total: number,
  layout: ReadingLayout,
) {
  const text = String(value).trim();
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)) || total < 1)
    return current;
  const page = Math.min(total, Math.max(1, Number(text)));
  return layout === "double" ? page - (page % 2 === 0 ? 1 : 0) : page;
}

export function adjacentPages(page: number, total: number) {
  return [page, page + 1, page - 1, page + 2, page - 2, page + 3].filter(
    (p) => p > 0 && p <= total,
  );
}

// Erase annotations only; never paint over or modify the original score.
export function touchesStroke(point: Point, stroke: Stroke, radius = 0.015) {
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  if (stroke.points.length === 1)
    return distance(point, stroke.points[0]!) <= radius + stroke.width / 2;
  return stroke.points.some((b, i) => {
    const a = stroke.points[i - 1];
    if (!a) return false;
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const t = length
      ? Math.max(
          0,
          Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length),
        )
      : 0;
    return (
      distance(point, { x: a.x + t * dx, y: a.y + t * dy }) <=
      radius + stroke.width / 2
    );
  });
}

/** Clip annotations to a crop rectangle, preserving editable strokes in the new coordinates. */
export function cropStrokes(
  strokes: Stroke[],
  rect: { x: number; y: number; width: number; height: number },
): Stroke[] {
  if (rect.width <= 0 || rect.height <= 0) return strokes;
  const inside = (p: Point) =>
    p.x >= rect.x &&
    p.x <= rect.x + rect.width &&
    p.y >= rect.y &&
    p.y <= rect.y + rect.height;
  const normalize = (p: Point): Point => ({
    x: Math.max(0, Math.min(1, (p.x - rect.x) / rect.width)),
    y: Math.max(0, Math.min(1, (p.y - rect.y) / rect.height)),
  });
  return strokes.flatMap((stroke) => {
    const style = {
      ...stroke,
      width: Math.min(0.1, stroke.width / rect.width),
    };
    if (stroke.points.length === 1)
      return inside(stroke.points[0]!)
        ? [{ ...style, points: [normalize(stroke.points[0]!)] }]
        : [];
    const segments: Stroke[] = [];
    let points: Point[] = [];
    for (let i = 1; i < stroke.points.length; i++) {
      const a = stroke.points[i - 1]!,
        b = stroke.points[i]!;
      const dx = b.x - a.x,
        dy = b.y - a.y;
      let enter = 0,
        exit = 1,
        valid = true;
      for (const [p, q] of [
        [-dx, a.x - rect.x],
        [dx, rect.x + rect.width - a.x],
        [-dy, a.y - rect.y],
        [dy, rect.y + rect.height - a.y],
      ] as [number, number][]) {
        if (p === 0) {
          if (q < 0) valid = false;
          continue;
        }
        const t = q / p;
        if (p < 0) enter = Math.max(enter, t);
        else exit = Math.min(exit, t);
      }
      if (!valid || enter > exit) {
        if (points.length) segments.push({ ...style, points });
        points = [];
        continue;
      }
      const from = normalize({ x: a.x + enter * dx, y: a.y + enter * dy });
      const to = normalize({ x: a.x + exit * dx, y: a.y + exit * dy });
      const last = points[points.length - 1];
      if (
        last &&
        (Math.abs(last.x - from.x) > 0.000001 ||
          Math.abs(last.y - from.y) > 0.000001)
      ) {
        segments.push({ ...style, points });
        points = [];
      }
      if (!points.length) points.push(from);
      points.push(to);
    }
    if (points.length) segments.push({ ...style, points });
    return segments;
  });
}
