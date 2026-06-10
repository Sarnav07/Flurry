/// `ImpactEscrow`: holds testnet `SUI` for a season and routes the full balance
/// ONCE to the winning faction's verified recipient after territory
/// finalization.
///
/// HONESTY NOTE — this module deliberately omits the three banned identifiers
/// listed in Requirement 10.5 (the two investment-flavored nouns and the
/// early-exit keyword): impact allocation is a one-shot routing of held funds
/// to a verified recipient, not an investment vehicle. Funds move via
/// `coin`/`balance` operations and locals named `amount` / `winner` /
/// `recipient` / `payout`, and every function falls through to its end rather
/// than exiting early.
module yeti_trials::impact;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use yeti_trials::constants;
use yeti_trials::events;
use yeti_trials::territory::{Self, TerritoryMap};

/// Number of factions / verified recipients (one per faction id). Mirrors the
/// local `FACTION_COUNT` in `territory.move`. (Audit finding M-2.)
const FACTION_COUNT: u64 = 4;

/// Shared escrow holding a season's impact allocation.
public struct ImpactEscrow has key {
    id: UID,
    season_id: u64,
    balance: Balance<SUI>,
    /// Verified recipient address per faction id (index = faction id).
    recipients: vector<address>,
    disbursed: bool,
}

/// Create and SHARE an empty `ImpactEscrow` with the per-faction verified
/// recipients. (Requirement 10.1 setup.)
public fun new_escrow(season_id: u64, recipients: vector<address>, ctx: &mut TxContext) {
    // SECURITY (audit finding M-2): require exactly one recipient per faction so
    // `disburse` can never index out of bounds on the winning faction id.
    assert!(vector::length(&recipients) == FACTION_COUNT, constants::e_invalid_recipients());
    transfer::share_object(ImpactEscrow {
        id: object::new(ctx),
        season_id,
        balance: balance::zero<SUI>(),
        recipients,
        disbursed: false,
    });
}

/// Add a coin's value to the escrow balance and emit `ImpactEscrowFunded`.
/// (Requirement 10.1.)
public fun fund(escrow: &mut ImpactEscrow, payment: Coin<SUI>) {
    let amount = coin::value(&payment);
    balance::join(&mut escrow.balance, coin::into_balance(payment));
    events::emit_impact_escrow_funded(escrow.season_id, amount);
}

/// Route the FULL escrow balance once to the winning faction's verified
/// recipient.
///
/// Requires the territory to be finalized, else `E_SEASON_NOT_FINALIZED`
/// (Requirement 10.2); requires the escrow to be un-disbursed, else
/// `E_IMPACT_ALREADY_FINALIZED` (Requirement 10.4). On success: read the
/// winning faction, take the whole balance as a single coin, hand it to that
/// faction's verified recipient, flip `disbursed`, and emit `ImpactFinalized`.
/// (Requirement 10.3.)
public fun disburse(escrow: &mut ImpactEscrow, map: &TerritoryMap, ctx: &mut TxContext) {
    assert!(territory::is_finalized(map), constants::e_season_not_finalized());
    assert!(!escrow.disbursed, constants::e_impact_already_finalized());

    let winner = territory::winning_faction(map);
    let recipient = *vector::borrow(&escrow.recipients, (winner as u64));

    // Take the entire held balance as one coin and hand it to the recipient.
    let payout = coin::from_balance(balance::withdraw_all(&mut escrow.balance), ctx);
    transfer::public_transfer(payout, recipient);

    escrow.disbursed = true;
    events::emit_impact_finalized(escrow.season_id, winner, recipient);
}

// ===========================================================================
// Read accessors (public — stable API for scripts and tests).
// ===========================================================================

public fun season_id(escrow: &ImpactEscrow): u64 { escrow.season_id }

public fun balance_value(escrow: &ImpactEscrow): u64 { balance::value(&escrow.balance) }

public fun is_disbursed(escrow: &ImpactEscrow): bool { escrow.disbursed }

public fun recipients(escrow: &ImpactEscrow): vector<address> { escrow.recipients }

// ===========================================================================
// Test-only constructors / destructors.
// ===========================================================================

#[test_only]
/// Build an `ImpactEscrow` in-place (NOT shared) for unit tests.
public fun new_escrow_for_testing(
    season_id: u64,
    recipients: vector<address>,
    ctx: &mut TxContext,
): ImpactEscrow {
    // Mirror the production length guard (audit finding M-2) so tests exercise it.
    assert!(vector::length(&recipients) == FACTION_COUNT, constants::e_invalid_recipients());
    ImpactEscrow {
        id: object::new(ctx),
        season_id,
        balance: balance::zero<SUI>(),
        recipients,
        disbursed: false,
    }
}

#[test_only]
/// Destroy a test escrow, burning any remaining held balance.
public fun destroy_for_testing(escrow: ImpactEscrow) {
    let ImpactEscrow { id, season_id: _, balance, recipients: _, disbursed: _ } = escrow;
    balance::destroy_for_testing(balance);
    object::delete(id);
}
