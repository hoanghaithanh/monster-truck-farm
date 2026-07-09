// Pure asset-budget math (ADR 0010 §3, "Component / data design" pure-core
// split). This module knows nothing about three.js/GLTFLoader/the
// AssetRegistry -- callers in render/ hand it plain {key, gzipBytes}
// entries (sizes are declared in the manifest or measured at build time)
// and get back a report they can log/assert against. No runtime enforcement
// is required this sprint (ADR 0010 §5 risk note) -- this exists so later
// passes adding real assets have something to check their totals against.

export interface AssetBudgetEntry {
  key: string;
  /** Approximate gzipped size in bytes, as declared in the asset manifest. */
  gzipBytes: number;
}

export interface AssetBudgetReport {
  totalGzipBytes: number;
  targetBytes: number;
  alarmBytes: number;
  /** True while under the ≤1.5 MB gzipped target (ADR 0010 §3, human-confirmed). */
  withinTarget: boolean;
  /** True while under the 2.0 MB gzipped hard alarm -- the trigger to revisit Draco/KTX2 (ADR 0010 §1/§3). */
  withinAlarm: boolean;
}

/** Total driving-scene asset payload target (ADR 0010 §3). */
export const ASSET_BUDGET_TARGET_GZIP_BYTES = 1_500_000;
/** Hard alarm threshold (ADR 0010 §3) -- breaching this is the signal to add compression or trim assets. */
export const ASSET_BUDGET_ALARM_GZIP_BYTES = 2_000_000;

export function evaluateAssetBudget(entries: AssetBudgetEntry[]): AssetBudgetReport {
  const totalGzipBytes = entries.reduce((sum, entry) => sum + entry.gzipBytes, 0);
  return {
    totalGzipBytes,
    targetBytes: ASSET_BUDGET_TARGET_GZIP_BYTES,
    alarmBytes: ASSET_BUDGET_ALARM_GZIP_BYTES,
    withinTarget: totalGzipBytes <= ASSET_BUDGET_TARGET_GZIP_BYTES,
    withinAlarm: totalGzipBytes <= ASSET_BUDGET_ALARM_GZIP_BYTES,
  };
}
