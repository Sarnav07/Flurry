import type { AttestationResponseVM } from '~/lib/types/viewModels';

/** The ONLY live proof label. Rendered exactly, never abbreviated or altered. */
export const ORACLE_ATTESTED_LABEL = 'Oracle-Attested Demo Proof';

/** The only live provenance tier. */
export const LIVE_PROVENANCE_TIER = 2 as const;

export interface ProvenanceTierView {
  value: number;
  name: string;
  active: boolean;
  comingSoon: boolean;
}

/** Native(0) and Sponsor-Signed(1) are inactive "coming soon"; Oracle-Attested(2) is live. */
export const PROVENANCE_TIERS: ReadonlyArray<ProvenanceTierView> = [
  { value: 0, name: 'Native', active: false, comingSoon: true },
  { value: 1, name: 'Sponsor-Signed', active: false, comingSoon: true },
  { value: 2, name: 'Oracle-Attested', active: true, comingSoon: false },
];

export interface ProvenanceView {
  label: string;
  tier: number;
  /** Always false: an Oracle-Attested proof is never presented as native on-chain proof. */
  isNative: boolean;
}

export function describeProvenance(attestation: AttestationResponseVM): ProvenanceView {
  return { label: ORACLE_ATTESTED_LABEL, tier: attestation.provenanceTier, isNative: false };
}
