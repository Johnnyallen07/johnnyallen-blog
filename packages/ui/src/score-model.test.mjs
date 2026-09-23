import test from 'node:test';
import assert from 'node:assert/strict';
import { adjacentPages, resolvePage, touchesStroke, cropStrokes } from './score-model.ts';

const line = { tool: 'line', color: '#dc2626', width: 0.003, points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }] };

test('page jumps align spreads and clamp both ends', () => {
  assert.equal(resolvePage('78', 1, 79, 'double'), 77);
  assert.equal(resolvePage('100', 1, 79, 'double'), 79);
  assert.equal(resolvePage('0', 4, 79, 'single'), 1);
  for (const value of ['', '1.5', 'abc', '-1']) assert.equal(resolvePage(value, 4, 79, 'single'), 4);
});
test('preload prioritizes target, next page and neighbors within document bounds', () => {
  assert.deepEqual(adjacentPages(1, 3), [1, 2, 3]);
  assert.deepEqual(adjacentPages(79, 79), [79, 78, 77]);
});
test('eraser hits the middle of a long line, not only its sampled endpoints', () => {
  assert.equal(touchesStroke({ x: 0.5, y: 0.5 }, line), true);
  assert.equal(touchesStroke({ x: 0.5, y: 0.7 }, line), false);
  assert.equal(touchesStroke({ x: 0.5, y: 0.5 }, { ...line, points: [{ x: 0.5, y: 0.5 }] }), true);
});
test('cropping clips crossing lines, removes outside annotations, preserves editable coordinates', () => {
  const rect = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
  const outside = { ...line, points: [{ x: 0, y: 0.1 }, { x: 1, y: 0.1 }] };
  const result = cropStrokes([line, outside], rect);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].points, [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }]);
  assert.equal(result[0].width, 0.006);
  assert.deepEqual(line.points, [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }]);
});
test('cropping splits a stroke that exits and reenters without connecting it across the border', () => {
  const stroke = { ...line, tool: 'pen', points: [{ x: 0.3, y: 0.4 }, { x: 0.1, y: 0.4 }, { x: 0.1, y: 0.6 }, { x: 0.3, y: 0.6 }] };
  const result = cropStrokes([stroke], { x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
  assert.equal(result.length, 2);
  assert.ok(result.every(item => item.points.every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)));
});
