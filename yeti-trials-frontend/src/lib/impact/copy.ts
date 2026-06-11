/**
 * Impact-allocation copy. The single source of the impact view's visible text,
 * so the No-P2E vocabulary gate (Property 9) tests the exact strings the UI
 * renders. None of these may contain a P2E/finance term.
 */
export const P2E_FORBIDDEN = ['yield', 'profit', 'return', 'apr', 'payout', 'earn'] as const;

export function containsForbidden(text: string): boolean {
  const t = text.toLowerCase();
  return P2E_FORBIDDEN.some((w) => t.includes(w));
}

export interface ImpactCopyInput {
  disbursed: boolean;
  winnerName: string | null;
  recipient: string | null;
}

/** Every user-visible impact string, allocation-language only. */
export function impactStrings(input: ImpactCopyInput): string[] {
  const strings = [
    'Impact allocation',
    'Escrow balance (MIST)',
    'Verified recipients',
    "Funds are an impact allocation directed once to the winning faction's verified recipient. Players never collect a token as a gameplay reward.",
    input.disbursed
      ? 'Allocation directed to the winning faction.'
      : 'Allocation pending. No recipient has received funds.',
  ];
  if (input.winnerName !== null) strings.push(`${input.winnerName} directs the allocation`);
  if (input.recipient !== null) strings.push(`Verified recipient: ${input.recipient}`);
  return strings;
}
