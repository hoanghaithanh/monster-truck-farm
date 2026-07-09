import { describe, expect, it } from 'vitest';
import {
  ASSET_BUDGET_ALARM_GZIP_BYTES,
  ASSET_BUDGET_TARGET_GZIP_BYTES,
  evaluateAssetBudget,
} from './budget';

describe('evaluateAssetBudget (ADR 0010 §3)', () => {
  it('sums entry sizes and reports within-target/within-alarm when comfortably under budget', () => {
    const report = evaluateAssetBudget([
      { key: 'truck-body-0', gzipBytes: 40_000 },
      { key: 'truck-wheels-0', gzipBytes: 30_000 },
    ]);
    expect(report.totalGzipBytes).toBe(70_000);
    expect(report.targetBytes).toBe(ASSET_BUDGET_TARGET_GZIP_BYTES);
    expect(report.alarmBytes).toBe(ASSET_BUDGET_ALARM_GZIP_BYTES);
    expect(report.withinTarget).toBe(true);
    expect(report.withinAlarm).toBe(true);
  });

  it('reports withinTarget=false but withinAlarm=true between the two thresholds', () => {
    const report = evaluateAssetBudget([{ key: 'heavy', gzipBytes: 1_700_000 }]);
    expect(report.withinTarget).toBe(false);
    expect(report.withinAlarm).toBe(true);
  });

  it('reports withinAlarm=false once the hard alarm is breached', () => {
    const report = evaluateAssetBudget([{ key: 'too-heavy', gzipBytes: 2_500_000 }]);
    expect(report.withinTarget).toBe(false);
    expect(report.withinAlarm).toBe(false);
  });

  it('treats an empty asset set as trivially within budget (all-primitive fallback, ADR 0010 §7)', () => {
    const report = evaluateAssetBudget([]);
    expect(report.totalGzipBytes).toBe(0);
    expect(report.withinTarget).toBe(true);
    expect(report.withinAlarm).toBe(true);
  });

  it('treats exactly-at-threshold sizes as within budget (inclusive bounds)', () => {
    const atTarget = evaluateAssetBudget([{ key: 'k', gzipBytes: ASSET_BUDGET_TARGET_GZIP_BYTES }]);
    expect(atTarget.withinTarget).toBe(true);
    const atAlarm = evaluateAssetBudget([{ key: 'k', gzipBytes: ASSET_BUDGET_ALARM_GZIP_BYTES }]);
    expect(atAlarm.withinAlarm).toBe(true);
  });
});
