import { useConfig } from '~/lib/state/boot';
import type { SponsorMetaVM } from '~/lib/types/viewModels';

/** Display-only sponsor presentation. No control implies scoring/territory
 * influence; sponsors cannot buy, bias, or affect outcomes. */
export function SponsorSurface({ sponsor }: { sponsor: SponsorMetaVM }) {
  if (sponsor.sponsorSlotId === null) {
    return (
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-frost-ice">Sponsor</h1>
        <p data-testid="sponsor-uninitialized" role="status" className="text-sm text-frost-mist">
          No sponsor slot is initialized for this season yet.
        </p>
      </section>
    );
  }

  return (
    <section data-testid="sponsor" className="flex flex-col gap-4">
      <p className="text-xs text-frost-mist">Genesis Frost launch sponsor</p>
      <h1 className="text-3xl font-semibold tracking-tight text-frost-ice">{sponsor.name}</h1>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col rounded border border-frost-line p-3">
          <dt className="text-xs text-frost-mist">Action</dt>
          <dd className="text-sm text-frost-ice">{sponsor.actionLabel || 'Presented by'}</dd>
        </div>
        <div className="flex flex-col rounded border border-frost-line p-3">
          <dt className="text-xs text-frost-mist">Trial</dt>
          <dd className="font-mono text-sm text-frost-ice">{sponsor.trialId.toString()}</dd>
        </div>
      </dl>
      <p className="max-w-[65ch] text-sm text-frost-mist">
        Alpha City is a presentation partner only. The sponsor cannot buy, bias, or affect scoring
        or territory outcomes. Any Alpha City reward is external to the Trials Engine and is not a
        gameplay reward.
      </p>
    </section>
  );
}

export function SponsorView() {
  const { sponsor } = useConfig();
  return <SponsorSurface sponsor={sponsor} />;
}
