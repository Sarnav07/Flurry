/// The non-transferable `YetiPassport` and its single atomic creation flow.
///
/// Passport creation and faction selection are unified into one operation:
/// `create_passport_with_faction`. There is no separate join step and no
/// faction setter — the faction is chosen once, at creation, and is immutable
/// for the season (whitepaper §5). The passport has the `key` ability ONLY
/// (no `store`), so it cannot be transferred after being delivered to its
/// creator. (Requirement 1.1–1.7.)
module yeti_trials::passport;

use sui::clock::{Self, Clock};
use yeti_trials::constants;
use yeti_trials::events;
use yeti_trials::season::{Self, Season};

/// Passport status: active.
const STATUS_ACTIVE: u8 = 0;

/// A player's per-season in-game identity. `key` only — deliberately NO
/// `store`, making it non-transferable. (Requirement 1.3.)
public struct YetiPassport has key {
    id: UID,
    owner: address,
    created_ms: u64,
    season_id: u64,
    faction_id: u8,
    raw_reputation: u64,
    accepted_proof_count: u64,
    status: u8,
}

/// Atomically create a non-transferable passport with the selected faction,
/// register the sender for the season, and emit `PassportCreated`.
///
/// Active-season precondition (Requirement 1.2): the Season MUST be active at
/// creation time. Aborts `E_SEASON_INACTIVE` when the Clock time is before
/// `start_ms` or at/after `end_ms` (i.e. `now < start_ms` or `now >= end_ms`),
/// so no passports are created for a not-yet-started or already-ended/finalized
/// season. This is checked first, before faction validation and uniqueness.
///
/// Aborts `E_INVALID_FACTION` if `faction_id` is outside 0..=3 OR not in the
/// season's allowed set; aborts `E_DUPLICATE_PASSPORT` if the sender already
/// holds a passport this season. On success the passport is owned by the
/// sender with `raw_reputation` and `accepted_proof_count` initialized to 0.
/// (Requirements 1.1, 1.2, 1.4, 1.5, 1.6.)
public fun create_passport_with_faction(
    season: &mut Season,
    faction_id: u8,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let sender = ctx.sender();

    // Active-season precondition (Requirement 1.2): abort when now < start_ms
    // or now >= end_ms. Checked before faction validation and uniqueness.
    assert!(season::is_active(season, clock), constants::e_season_inactive());

    // Faction must be in range 0..=3 AND in the season's allowed set.
    assert!(
        faction_id <= constants::thaw() && season::is_faction_allowed(season, faction_id),
        constants::e_invalid_faction(),
    );

    // One passport per address per season.
    assert!(!season::is_registered(season, sender), constants::e_duplicate_passport());
    season::register(season, sender);

    let sid = season::season_id(season);
    let passport = YetiPassport {
        id: object::new(ctx),
        owner: sender,
        created_ms: clock::timestamp_ms(clock),
        season_id: sid,
        faction_id,
        raw_reputation: 0,
        accepted_proof_count: 0,
        status: STATUS_ACTIVE,
    };

    events::emit_passport_created(sid, faction_id, object::id(&passport), sender);

    // `transfer` (not `public_transfer`) — the passport lacks `store`. The
    // sender becomes the owner; the object can never be transferred onward.
    transfer::transfer(passport, sender);
}

// ===========================================================================
// Read accessors (public — stable API for sibling modules and scripts).
// ===========================================================================

public fun owner(passport: &YetiPassport): address { passport.owner }

public fun created_ms(passport: &YetiPassport): u64 { passport.created_ms }

public fun season_id(passport: &YetiPassport): u64 { passport.season_id }

public fun faction_id(passport: &YetiPassport): u8 { passport.faction_id }

public fun raw_reputation(passport: &YetiPassport): u64 { passport.raw_reputation }

public fun accepted_proof_count(passport: &YetiPassport): u64 { passport.accepted_proof_count }

public fun status(passport: &YetiPassport): u8 { passport.status }

// ===========================================================================
// Package-visible mutators — used by `proof::submit_proof` on a successful
// accept. Two DISTINCT updates per the corrected decision (Requirement 7.1):
// raw reputation increases by the signed score, and the accepted-proof count
// increments by exactly 1. These are deliberately separate functions so the
// two channels cannot be accidentally conflated.
// ===========================================================================

/// Add the signed `score` to the passport's raw reputation. (Requirement 7.1.)
public(package) fun add_reputation(passport: &mut YetiPassport, score: u64) {
    passport.raw_reputation = passport.raw_reputation + score;
}

/// Increment the accepted-proof count by exactly 1. (Requirement 7.1.)
public(package) fun increment_accepted_proof_count(passport: &mut YetiPassport) {
    passport.accepted_proof_count = passport.accepted_proof_count + 1;
}

// ===========================================================================
// Test-only constructors / destructors.
// ===========================================================================

#[test_only]
/// Build a `YetiPassport` directly (bypassing season/active checks) so proof
/// tests can control the owner and faction. The object id is assigned by
/// `object::new`; created as the first object in a fresh `test_scenario`
/// transaction it is deterministic across runs (see `proof_submit_tests`).
public fun new_passport_for_testing(
    owner: address,
    season_id: u64,
    faction_id: u8,
    ctx: &mut TxContext,
): YetiPassport {
    YetiPassport {
        id: object::new(ctx),
        owner,
        created_ms: 0,
        season_id,
        faction_id,
        raw_reputation: 0,
        accepted_proof_count: 0,
        status: STATUS_ACTIVE,
    }
}

#[test_only]
/// Destroy a test passport (it has no `store`, so tests cannot drop it via a
/// public transfer; this deletes the UID).
public fun destroy_for_testing(passport: YetiPassport) {
    let YetiPassport {
        id,
        owner: _,
        created_ms: _,
        season_id: _,
        faction_id: _,
        raw_reputation: _,
        accepted_proof_count: _,
        status: _,
    } = passport;
    object::delete(id);
}
