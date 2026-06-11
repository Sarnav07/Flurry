import { FAILURE_STATUSES, type ProofStatus } from '~/lib/state/pending';

/** Visual treatment families. Reused unchanged by the Phase 7 cinematic layer. */
export type Treatment = 'frost' | 'solid' | 'melt' | 'ceremony';

/**
 * Proof treatment gate. Failure statuses route ONLY to melt-away. `solid`
 * (confirmed) is reachable only when a ProofAccepted has been observed; without
 * it, a proof stays provisional `frost` even if locally marked accepted. A
 * pending/submitting proof is never solidified.
 */
export function proofTreatment(status: ProofStatus, proofAccepted: boolean): Treatment {
  if (FAILURE_STATUSES.has(status)) return 'melt';
  if (status === 'accepted' && proofAccepted) return 'solid';
  return 'frost';
}

/**
 * Ceremony gate (impact finalization / territory finalized). The warm
 * golden-hour ceremonial treatment is reachable ONLY with its confirming event
 * (ImpactFinalized / impact.disbursed / TerritoryFinalized); otherwise frost.
 */
export function ceremonyTreatment(confirmingEvent: boolean): Treatment {
  return confirmingEvent ? 'ceremony' : 'frost';
}
