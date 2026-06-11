/** Every trust boundary in plain language (Requirement 15). Reachable from the
 * primary navigation via /trust. */
const BOUNDARIES: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: 'The demo oracle is centralized V1 infrastructure',
    body: 'Attestations are produced by a single demo oracle controlled by a single operator key. It is centralized V1 infrastructure, not a decentralized network.',
  },
  {
    title: 'An Oracle-Attested proof is not a native on-chain fact',
    body: "An Oracle-Attested Demo Proof is the oracle's signed statement about off-chain behavior. It is not a native on-chain fact and is never presented as one.",
  },
  {
    title: 'zkLogin is onboarding, not identity',
    body: 'zkLogin is onboarding convenience only. It is not personhood verification and not Sybil resistance. Passport uniqueness is enforced per Sui address per season only.',
  },
  {
    title: 'Cleanup is caller-driven',
    body: 'Nullifier cleanup is caller-driven and not automatic. Stale state is pruned only when an operator submits a cleanup batch.',
  },
  {
    title: 'Sponsors cannot affect outcomes',
    body: 'The launch sponsor is a presentation frame only. Sponsors cannot buy, bias, or affect scoring or territory outcomes.',
  },
  {
    title: 'No financial returns',
    body: 'The system provides no yield, no profit, and no investment return. Players never earn a token as a gameplay reward.',
  },
];

export function TrustSurface() {
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-frost-ice">How this works</h1>
        <p className="max-w-[65ch] text-frost-mist">
          Plain-language trust boundaries. Nothing in the experience claims more than the backend
          actually guarantees.
        </p>
      </header>
      <ul className="flex flex-col divide-y divide-frost-line">
        {BOUNDARIES.map((b) => (
          <li key={b.title} className="flex flex-col gap-1 py-4">
            <h2 className="text-base font-semibold text-frost-ice">{b.title}</h2>
            <p className="max-w-[70ch] text-sm text-frost-mist">{b.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
