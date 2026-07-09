// Pure decision logic for ADR 0010 §4.3's bounded truck-load gate and §7's
// fallback rule. Kept in core/ per ADR 0001 §4 -- these are plain decisions
// over plain data, even though the thing being decided about (a glTF load)
// is inherently async/impure and lives in render/.

/** The outcome of one tracked asset load, as seen by a decision that must react to it. */
export type AssetLoadOutcome = 'pending' | 'ready' | 'failed';

/**
 * Should the renderer show the primitive fallback for this asset right now?
 * Per ADR 0010 §4/§7, "ready" is the only outcome that shows the real
 * model -- still pending or failed both mean "stay primitive," which is the
 * default/safe path, not a special case.
 */
export function shouldUsePrimitiveFallback(outcome: AssetLoadOutcome): boolean {
  return outcome !== 'ready';
}

/**
 * The bounded truck-load gate (ADR 0010 §4.3): given how long the gate has
 * been waiting and whether every required asset has settled (ready or
 * failed -- pending does not count as settled), should driving proceed now?
 * Proceeds either once everything required has settled, or once the
 * timeout has elapsed, whichever comes first -- so a slow/failed load can
 * never stall the transition into DRIVING beyond `timeoutMs`.
 */
export function truckGateShouldProceed(elapsedMs: number, timeoutMs: number, allRequiredSettled: boolean): boolean {
  return allRequiredSettled || elapsedMs >= timeoutMs;
}
