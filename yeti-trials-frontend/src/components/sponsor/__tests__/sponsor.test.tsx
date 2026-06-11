// Feature: yeti-trials-frontend, Phase 5 sponsor
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { SponsorSurface } from '~/components/sponsor/sponsor-surface';
import type { SponsorMetaVM } from '~/lib/types/viewModels';

afterEach(cleanup);

describe('SponsorSurface (Requirements 13.1, 13.2, 13.4)', () => {
  it('renders sponsor metadata from config, display-only with no scoring control', () => {
    const sponsor: SponsorMetaVM = {
      sponsorSlotId: `0x${'b2'.repeat(32)}`,
      name: 'Alpha City',
      trialId: 1n,
      actionLabel: 'Presented by',
      status: 0,
    };
    render(<SponsorSurface sponsor={sponsor} />);
    expect(screen.getByText('Alpha City')).not.toBeNull();
    expect(screen.getByText(/cannot buy, bias, or affect scoring/i)).not.toBeNull();
    // No interactive control that could imply influence on outcomes.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('renders an uninitialized state when sponsorSlotId is null', () => {
    const sponsor: SponsorMetaVM = {
      sponsorSlotId: null,
      name: '',
      trialId: 0n,
      actionLabel: '',
      status: 0,
    };
    render(<SponsorSurface sponsor={sponsor} />);
    expect(screen.getByTestId('sponsor-uninitialized')).not.toBeNull();
    expect(screen.queryByTestId('sponsor')).toBeNull();
  });
});
