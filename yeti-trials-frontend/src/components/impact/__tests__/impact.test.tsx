// Feature: yeti-trials-frontend, Phase 5 impact
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { ImpactCard } from '~/components/impact/impact-view';
import { containsForbidden } from '~/lib/impact/copy';
import type { ImpactStatusVM } from '~/lib/types/viewModels';

afterEach(cleanup);

const REC = `0x${'c3'.repeat(32)}`;

describe('ImpactCard (Requirements 12.1, 12.2, 12.3)', () => {
  it('renders allocation pending and no reveal while not disbursed', () => {
    const impact: ImpactStatusVM = { escrowId: null, balance: 1000n, disbursed: false, recipients: [REC] };
    render(<ImpactCard impact={impact} winnerName={null} recipient={null} />);
    expect(screen.getByTestId('impact-status').getAttribute('data-disbursed')).toBe('false');
    expect(screen.getByTestId('impact-balance').textContent).toBe('1000');
    expect(screen.queryByTestId('impact-reveal')).toBeNull();
  });

  it('reveals the winning faction and recipient once disbursed', () => {
    const impact: ImpactStatusVM = { escrowId: null, balance: 0n, disbursed: true, recipients: [REC] };
    render(<ImpactCard impact={impact} winnerName="Avalanche" recipient={REC} />);
    expect(screen.getByTestId('impact-status').getAttribute('data-disbursed')).toBe('true');
    expect(screen.getByTestId('impact-reveal')).not.toBeNull();
    expect(screen.getByText(/Avalanche directs the allocation/i)).not.toBeNull();
  });

  it('uses no P2E vocabulary in any visible string', () => {
    const impact: ImpactStatusVM = { escrowId: null, balance: 5n, disbursed: true, recipients: [REC] };
    render(<ImpactCard impact={impact} winnerName="Thaw" recipient={REC} />);
    const text = document.body.textContent ?? '';
    expect(containsForbidden(text)).toBe(false);
  });
});
