/// `TerritoryMap`: finalized territory ownership for a season plus the
/// game-balanced capture rule.
///
/// This module is the on-chain expression of the second honesty invariant —
/// reputation is raw, territory is game-balanced. Finalization reads each
/// shard's `territory_power_total` (the BALANCED channel) and NEVER touches any
/// `YetiPassport.raw_reputation` or `ScoreShard.raw_score_total`. The
/// `underdog_multiplier` is applied ONLY to the capture comparison and is never
/// written back into any shard or passport. (Requirements 8.3, 8.4, 9.1–9.4.)
///
/// SHARDS PARAMETER SHAPE (design note): Move 2024 forbids `vector<&ScoreShard>`
/// (references cannot be stored in a vector), and the shared `ScoreShard`
/// objects cannot be consumed by value. The simplest correct approach that
/// supports an ARBITRARY number of shards is a small hot-potato accumulator,
/// `PowerTally`: the caller opens a tally with `begin_power_tally`, folds each
/// shard in with `add_shard_power` (which reads `territory_power_total` by
/// reference), then hands the tally to `finalize_territory`. `PowerTally` has
/// NO abilities, so it cannot be dropped or stored — it MUST be consumed by
/// `finalize_territory`, making "summed across the supplied shards" structurally
/// enforced rather than a convention.
module yeti_trials::territory;

use yeti_trials::constants;
use yeti_trials::events;
use yeti_trials::season::{Self, Season};
use yeti_trials::shard::{Self, ScoreShard};

/// The index in `owners` of the single contested central territory that
/// finalization re-assigns to the capture winner. The other three slots remain
/// each faction's home territory (assigned at init). `winning_faction` reads
/// this slot.
const CONTESTED_TERRITORY: u64 = 0;

/// Number of factions / starting territories (Glaciers 0, Avalanche 1,
/// Blizzard 2, Thaw 3).
const FACTION_COUNT: u64 = 4;

/// Finalized territory ownership for a season. Shared object.
public struct TerritoryMap has key {
    id: UID,
    season_id: u64,
    /// Faction id owning each territory. Length `FACTION_COUNT`; index
    /// `CONTESTED_TERRITORY` is re-assigned to the capture winner on finalize.
    owners: vector<u8>,
    /// Per-faction aggregated (raw, un-multiplied) territory power recorded at
    /// finalization. Index = faction id.
    finalized_power: vector<u64>,
    underdog_multiplier: u64,
    finalized: bool,
}

/// A per-faction territory-power accumulator. HOT POTATO — no abilities, so it
/// must be created by `begin_power_tally` and consumed by `finalize_territory`.
public struct PowerTally {
    season_id: u64,
    faction_power: vector<u64>,
}

/// Create and SHARE a `TerritoryMap` with each of the four factions holding one
/// starting territory (`owners = [0, 1, 2, 3]`), zeroed `finalized_power`, and
/// `finalized = false`. (Requirement 9.4.)
public fun new_territory_map(season_id: u64, underdog_multiplier: u64, ctx: &mut TxContext) {
    transfer::share_object(TerritoryMap {
        id: object::new(ctx),
        owners: vector[0u8, 1u8, 2u8, 3u8],
        finalized_power: vector[0u64, 0u64, 0u64, 0u64],
        season_id,
        underdog_multiplier,
        finalized: false,
    });
}

/// Open a per-faction power tally for `season`. Zeroed; folded with
/// `add_shard_power` and consumed by `finalize_territory`.
public fun begin_power_tally(season: &Season): PowerTally {
    PowerTally {
        season_id: season::season_id(season),
        faction_power: vector[0u64, 0u64, 0u64, 0u64],
    }
}

/// Fold one shard's `territory_power_total` (the BALANCED channel) into the
/// tally under that shard's faction. Reads the shard by reference — raw
/// reputation and `raw_score_total` are never read here and never written
/// anywhere. (Requirements 8.3, 9.2.)
public fun add_shard_power(tally: &mut PowerTally, shard: &ScoreShard) {
    let f = (shard::faction_id(shard) as u64);
    let current = *vector::borrow(&tally.faction_power, f);
    *vector::borrow_mut(&mut tally.faction_power, f) = current + shard::territory_power_total(shard);
}

/// Finalize the contested territory from the folded shard power.
///
/// Preconditions: the Season must be finalized (closed via `close_season`),
/// else `E_SEASON_NOT_FINALIZED` (Requirement 9.1); the map must not already be
/// finalized, else `E_TERRITORY_ALREADY_FINALIZED` (Requirement 9.3).
///
/// Capture rule (Requirement 9.2, 8.4): the **underdog** is the faction with
/// the strictly lowest summed territory power (ties broken by smallest faction
/// id). Its power — and only its power — is multiplied by `underdog_multiplier`
/// to form the ADJUSTED comparison value; every other faction's adjusted value
/// equals its raw summed power. The contested territory is assigned to the
/// faction with the highest adjusted power (ties broken by smallest faction
/// id). The multiplier is applied ONLY to this comparison; it is never written
/// into `finalized_power`, any shard, or any passport — `finalized_power`
/// records the RAW summed power.
public fun finalize_territory(season: &Season, map: &mut TerritoryMap, tally: PowerTally) {
    assert!(season::is_finalized(season), constants::e_season_not_finalized());
    assert!(!map.finalized, constants::e_territory_already_finalized());

    let PowerTally { season_id: _, faction_power } = tally;

    let winner = compute_winner(&faction_power, map.underdog_multiplier);

    // Re-assign the contested territory; record RAW power (no multiplier).
    *vector::borrow_mut(&mut map.owners, CONTESTED_TERRITORY) = winner;
    map.finalized_power = faction_power;
    map.finalized = true;

    events::emit_territory_finalized(map.season_id, map.owners, map.finalized_power);
}

/// Pure capture rule: pick the underdog (argmin raw power, ties → smallest id),
/// multiply ONLY its power by `multiplier`, then return argmax of the adjusted
/// powers (ties → smallest id). Reads nothing but the supplied summed powers.
fun compute_winner(faction_power: &vector<u64>, multiplier: u64): u8 {
    // Underdog = faction with the strictly lowest raw power (ties → smallest id).
    let mut underdog: u64 = 0;
    let mut min_power = *vector::borrow(faction_power, 0);
    let mut i = 1;
    while (i < FACTION_COUNT) {
        let p = *vector::borrow(faction_power, i);
        if (p < min_power) {
            min_power = p;
            underdog = i;
        };
        i = i + 1;
    };

    // Winner = argmax of the adjusted powers (underdog's power scaled), ties →
    // smallest id (strict `>` keeps the earliest maximum).
    let mut winner: u64 = 0;
    let mut best = adjusted_power(faction_power, 0, underdog, multiplier);
    let mut j = 1;
    while (j < FACTION_COUNT) {
        let adj = adjusted_power(faction_power, j, underdog, multiplier);
        if (adj > best) {
            best = adj;
            winner = j;
        };
        j = j + 1;
    };
    (winner as u8)
}

/// Adjusted comparison value for faction `idx`: raw power, scaled by
/// `multiplier` iff `idx` is the underdog. Used only for the capture comparison.
fun adjusted_power(faction_power: &vector<u64>, idx: u64, underdog: u64, multiplier: u64): u64 {
    let raw = *vector::borrow(faction_power, idx);
    if (idx == underdog) { raw * multiplier } else { raw }
}

// ===========================================================================
// Read accessors (public — stable API for `impact::disburse`, scripts, tests).
// ===========================================================================

public fun season_id(map: &TerritoryMap): u64 { map.season_id }

public fun owners(map: &TerritoryMap): vector<u8> { map.owners }

public fun finalized_power(map: &TerritoryMap): vector<u64> { map.finalized_power }

public fun underdog_multiplier(map: &TerritoryMap): u64 { map.underdog_multiplier }

public fun is_finalized(map: &TerritoryMap): bool { map.finalized }

/// The faction that captured the contested territory. Meaningful after
/// `finalize_territory`; before finalize it is the contested slot's starting
/// owner. `impact::disburse` reads this only after asserting `is_finalized`.
public fun winning_faction(map: &TerritoryMap): u8 {
    *vector::borrow(&map.owners, CONTESTED_TERRITORY)
}

// ===========================================================================
// Test-only constructors / destructors.
// ===========================================================================

#[test_only]
/// Build an (unfinalized) `TerritoryMap` in-place (NOT shared) for unit tests.
public fun new_territory_map_for_testing(
    season_id: u64,
    underdog_multiplier: u64,
    ctx: &mut TxContext,
): TerritoryMap {
    TerritoryMap {
        id: object::new(ctx),
        owners: vector[0u8, 1u8, 2u8, 3u8],
        finalized_power: vector[0u64, 0u64, 0u64, 0u64],
        season_id,
        underdog_multiplier,
        finalized: false,
    }
}

#[test_only]
/// Build a FINALIZED `TerritoryMap` whose contested territory is owned by
/// `winner`, for isolating downstream tests (e.g. impact disbursement).
public fun new_finalized_map_for_testing(
    season_id: u64,
    winner: u8,
    ctx: &mut TxContext,
): TerritoryMap {
    let mut owners = vector[0u8, 1u8, 2u8, 3u8];
    *vector::borrow_mut(&mut owners, CONTESTED_TERRITORY) = winner;
    TerritoryMap {
        id: object::new(ctx),
        owners,
        finalized_power: vector[0u64, 0u64, 0u64, 0u64],
        season_id,
        underdog_multiplier: 1,
        finalized: true,
    }
}

#[test_only]
/// Delete a test `TerritoryMap`.
public fun destroy_for_testing(map: TerritoryMap) {
    let TerritoryMap {
        id,
        owners: _,
        finalized_power: _,
        season_id: _,
        underdog_multiplier: _,
        finalized: _,
    } = map;
    object::delete(id);
}
