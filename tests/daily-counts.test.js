import test from 'node:test';
import assert from 'node:assert/strict';
import { last90Days } from '../src/daily-counts.js';

test('chart fills missing UTC dates, including across a leap-day boundary', () => {
  const result = last90Days([
    { date: '2024-02-29', scans: 4 },
    { date: '2024-03-01', scans: 2 }
  ], new Date('2024-03-01T23:59:59Z'));
  assert.equal(result.length, 90);
  assert.deepEqual(result.at(-3), { date: '2024-02-28', scans: 0 });
  assert.deepEqual(result.at(-2), { date: '2024-02-29', scans: 4 });
  assert.deepEqual(result.at(-1), { date: '2024-03-01', scans: 2 });
});
