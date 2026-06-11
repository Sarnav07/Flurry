/**
 * Optimistic overlay reconciler (Requirement 22), modeled as a pure reducer so
 * it can be property-tested over arbitrary event/timeout interleavings.
 *
 * Invariants:
 *  - A confirming event replaces the optimistic value with the on-chain value
 *    (on-chain ALWAYS wins) and clears the overlay.
 *  - An overlay not confirmed by its deadline rolls back via melt-away.
 *  - Eventually consistent: no overlay can remain pending forever.
 */
export interface Overlay {
  id: string;
  optimistic: bigint;
  deadlineMs: bigint;
}

export interface ReconcileState {
  overlays: ReadonlyArray<Overlay>;
  /** Confirmed on-chain values by id (authoritative). */
  confirmed: Readonly<Record<string, bigint>>;
  /** Ids rolled back via melt-away. */
  melted: ReadonlyArray<string>;
}

export type ReconcileAction =
  | { type: 'overlay'; overlay: Overlay }
  | { type: 'confirm'; id: string; value: bigint }
  | { type: 'tick'; nowMs: bigint };

export const initialReconcileState: ReconcileState = { overlays: [], confirmed: {}, melted: [] };

export function reconcile(state: ReconcileState, action: ReconcileAction): ReconcileState {
  switch (action.type) {
    case 'overlay':
      return { ...state, overlays: [...state.overlays.filter((o) => o.id !== action.overlay.id), action.overlay] };
    case 'confirm':
      // On-chain wins: record the confirmed value, drop any overlay for this id.
      return {
        ...state,
        confirmed: { ...state.confirmed, [action.id]: action.value },
        overlays: state.overlays.filter((o) => o.id !== action.id),
        melted: state.melted.filter((m) => m !== action.id),
      };
    case 'tick': {
      const expired = state.overlays.filter((o) => o.deadlineMs <= action.nowMs);
      if (expired.length === 0) return state;
      const expiredIds = new Set(expired.map((o) => o.id));
      return {
        ...state,
        overlays: state.overlays.filter((o) => !expiredIds.has(o.id)),
        melted: [...state.melted, ...expired.map((o) => o.id)],
      };
    }
  }
}
