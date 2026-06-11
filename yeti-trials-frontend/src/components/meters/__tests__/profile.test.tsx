// Feature: yeti-trials-frontend, Phase 5 profile separation
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { ProfileCard } from '~/components/meters/profile-view';

afterEach(cleanup);

describe('ProfileCard (Requirements 11.1, 11.2, 11.3)', () => {
  it('renders raw reputation and territory power as two distinct labeled values', () => {
    render(
      <ProfileCard
        passportId={`0x${'a1'.repeat(32)}`}
        factionName="Avalanche"
        rawReputation={100n}
        territoryPower={50n}
        acceptedProofCount={3n}
        pendingCount={1}
      />,
    );
    const raw = screen.getByTestId('raw-reputation');
    const power = screen.getByTestId('territory-power');
    expect(raw.textContent).toBe('100');
    expect(power.textContent).toBe('50');
    expect(raw.textContent).not.toBe(power.textContent);
  });

  it('states that balancing never changes raw reputation', () => {
    render(
      <ProfileCard
        passportId={`0x${'a1'.repeat(32)}`}
        factionName="Avalanche"
        rawReputation={0n}
        territoryPower={0n}
        acceptedProofCount={0n}
        pendingCount={0}
      />,
    );
    expect(screen.getByText(/balancing never changes your raw reputation/i)).not.toBeNull();
  });
});
