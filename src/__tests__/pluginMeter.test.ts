import { describe, expect, it } from 'vitest';

import {
  cpuStats,
  createCpuRecord,
  PLUGIN_CPU_BUDGET_AVG_MS,
  recordCpu,
  resetCpu,
  roundCpuMs,
} from '../plugins/meter';

describe('the cpu record', () => {
  it('totals renders per plugin and forgets them on reset', () => {
    const record = createCpuRecord();
    recordCpu(record, 'a', 2);
    recordCpu(record, 'a', 4);
    recordCpu(record, 'b', 1);
    expect(cpuStats(record).map((entry) => [entry.id, entry.renders, entry.avgMs, entry.maxMs])).toEqual([
      ['a', 2, 3, 4],
      ['b', 1, 1, 1],
    ]);
    resetCpu(record);
    expect(cpuStats(record)).toEqual([]);
  });

  it('drops a cost that is not a measurement, and files a backwards clock as zero', () => {
    const record = createCpuRecord();
    recordCpu(record, 'a', Number.NaN);
    recordCpu(record, 'a', Number.POSITIVE_INFINITY);
    recordCpu(record, 'a', -5);
    expect(cpuStats(record)).toEqual([
      { id: 'a', renders: 1, avgMs: 0, maxMs: 0, overBudget: false },
    ]);
  });

  it('flags an average past the budget, busiest first', () => {
    expect(PLUGIN_CPU_BUDGET_AVG_MS).toBeGreaterThan(0);
    const record = createCpuRecord();
    recordCpu(record, 'cheap', 1);
    recordCpu(record, 'hog', PLUGIN_CPU_BUDGET_AVG_MS + 4);
    recordCpu(record, 'hog', PLUGIN_CPU_BUDGET_AVG_MS + 4);
    const [first, second] = cpuStats(record);
    expect(first!.id).toBe('hog');
    expect(first!.overBudget).toBe(true);
    expect(second!.id).toBe('cheap');
    expect(second!.overBudget).toBe(false);
  });

  it('rounds to one decimal for the row', () => {
    expect(roundCpuMs(0.42312)).toBe(0.4);
    expect(roundCpuMs(16)).toBe(16);
  });
});
