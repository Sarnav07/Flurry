/// Phase 2 signature-verification core — the canonical Move side of the
/// byte-identical TS↔Move signing path (Requirements 4.3, 4.5, 4.6).
///
/// SCOPE: this module currently contains ONLY the cryptographic conformance
/// core needed to prove byte-identity with `shared/src/bcs.ts`,
/// `shared/src/message.ts`, and `shared/src/nullifier.ts`:
///   * the 15-field `ProofPayload` struct (exact order), reconstructed from
///     typed arguments, serialized with `bcs::to_bytes`, domain-prefixed, and
///     verified with `sui::ed25519::ed25519_verify`;
///   * the pure `compute_nullifier` (BCS preimage struct + blake2b256) and
///     `compute_shard_bucket` helpers used for parity testing.
///
/// The full `submit_proof` acceptance pipeline and the `NullifierStore` are
/// implemented below (Phase 3). The Phase-2 conformance core above
/// (`build_payload`, `signed_message_bytes`, `verify_signature`,
/// `verify_payload_signature`, `assert_valid_signature`, `compute_nullifier`,
/// `compute_shard_bucket`) is unchanged and remains the canonical, frozen
/// signing/bucket/nullifier source of truth that Phase 3 reuses.
module yeti_trials::proof;

use std::bcs;
use sui::clock::{Self, Clock};
use sui::ed25519;
use sui::hash;
use sui::table::{Self, Table};
use yeti_trials::constants;
use yeti_trials::events;
use yeti_trials::passport::{Self, YetiPassport};
use yeti_trials::registry::{Self, OracleSignerRegistry};
use yeti_trials::season::{Self, Season};
use yeti_trials::shard::{Self, ScoreShard};

/// The signed payload, 15 fields in the exact order of `shared/src/bcs.ts` and
/// the Message Format table (Requirement 4.1). BCS serialization is positional,
/// so this order is the contract; it must never diverge from the TS struct.
public struct ProofPayload has copy, drop {
    network: vector<u8>,
    package_id: address,
    season_id: u64,
    trial_id: u64,
    faction_id: u8,
    passport_id: address,
    wallet: address,
    proof_source: vector<u8>,
    provenance_tier: u8,
    score: u64,
    territory_power: u64,
    issued_ms: u64,
    expiry_ms: u64,
    nonce: u64,
    nullifier: vector<u8>,
}

/// The nullifier preimage, 6 fields in the exact order of the design's
/// Nullifier Section and `shared/src/nullifier.ts` (Requirement 5.1).
public struct NullifierPreimage has copy, drop {
    season_id: u64,
    trial_id: u64,
    faction_id: u8,
    passport_id: address,
    wallet: address,
    nonce: u64,
}

// ===========================================================================
// Payload reconstruction + signed-message bytes
// ===========================================================================

/// Build a `ProofPayload` from typed fields. `submit_proof` (Phase 3) will call
/// this with its entry-function arguments so the bytes that are verified are
/// exactly the bytes the logic acts on (no "sign one thing, act on another").
public fun build_payload(
    network: vector<u8>,
    package_id: address,
    season_id: u64,
    trial_id: u64,
    faction_id: u8,
    passport_id: address,
    wallet: address,
    proof_source: vector<u8>,
    provenance_tier: u8,
    score: u64,
    territory_power: u64,
    issued_ms: u64,
    expiry_ms: u64,
    nonce: u64,
    nullifier: vector<u8>,
): ProofPayload {
    ProofPayload {
        network,
        package_id,
        season_id,
        trial_id,
        faction_id,
        passport_id,
        wallet,
        proof_source,
        provenance_tier,
        score,
        territory_power,
        issued_ms,
        expiry_ms,
        nonce,
        nullifier,
    }
}

/// The exact `Signed_Message` bytes: `DOMAIN || bcs::to_bytes(&payload)`. The
/// domain is prepended as RAW bytes, never as a BCS field (Requirement 4.2).
public fun signed_message_bytes(payload: &ProofPayload): vector<u8> {
    let mut msg = constants::domain();
    let body = bcs::to_bytes(payload);
    vector::append(&mut msg, body);
    msg
}

// ===========================================================================
// Signature verification (Requirements 4.3, 4.5, 4.6)
// ===========================================================================

/// Reconstruct the payload from typed arguments, build the `Signed_Message`,
/// and verify the raw 64-byte Ed25519 `sig` against `pk`. Returns the verify
/// result as a bool. The runtime does NOT hash — the contract controls the
/// message bytes entirely.
///
/// ARCHITECTURAL NOTE — this is the PURE, STATELESS verifier used by the
/// Phase-2 cryptographic conformance / dev-inspect harness (the live localnet
/// gate calls this via a PTB `moveCall`, the hermetic `sui move test` corpus
/// calls `verify_payload_signature`). It returns a bool and performs NO
/// acceptance side effects.
///
/// The Phase-3 `submit_proof` acceptance path MUST NOT branch on this bool.
/// It MUST instead call the ABORTING `assert_valid_signature`
/// (`E_INVALID_SIGNATURE`) so that a forgotten or mishandled `if` can never let
/// an unverified proof silently pass — a dropped bool check fails open, an
/// omitted assert cannot. Keep this function `public` and bool-returning: the
/// live dev-inspect conformance gate depends on that exact shape; do not route
/// acceptance through it.
public fun verify_signature(
    network: vector<u8>,
    package_id: address,
    season_id: u64,
    trial_id: u64,
    faction_id: u8,
    passport_id: address,
    wallet: address,
    proof_source: vector<u8>,
    provenance_tier: u8,
    score: u64,
    territory_power: u64,
    issued_ms: u64,
    expiry_ms: u64,
    nonce: u64,
    nullifier: vector<u8>,
    sig: vector<u8>,
    pk: vector<u8>,
): bool {
    let payload = build_payload(
        network,
        package_id,
        season_id,
        trial_id,
        faction_id,
        passport_id,
        wallet,
        proof_source,
        provenance_tier,
        score,
        territory_power,
        issued_ms,
        expiry_ms,
        nonce,
        nullifier,
    );
    let msg = signed_message_bytes(&payload);
    ed25519::ed25519_verify(&sig, &pk, &msg)
}

/// Verify a signature over an already-reconstructed payload. Convenience for
/// callers that already hold a `ProofPayload`.
public fun verify_payload_signature(
    payload: &ProofPayload,
    sig: &vector<u8>,
    pk: &vector<u8>,
): bool {
    let msg = signed_message_bytes(payload);
    ed25519::ed25519_verify(sig, pk, &msg)
}

/// Assert that the signature verifies; aborts `E_INVALID_SIGNATURE` otherwise
/// (Requirement 4.5). Phase 3 `submit_proof` uses this abort path.
public fun assert_valid_signature(
    payload: &ProofPayload,
    sig: &vector<u8>,
    pk: &vector<u8>,
) {
    assert!(verify_payload_signature(payload, sig, pk), constants::e_invalid_signature());
}

// ===========================================================================
// Pure conformance helpers (nullifier + shard bucket)
// ===========================================================================

/// Compute the 32-byte nullifier: `blake2b256(bcs::to_bytes(&NullifierPreimage))`
/// over the ordered preimage struct, identical to `shared/src/nullifier.ts`
/// (Requirements 5.1, 5.4). Pure helper — not wired into any acceptance flow.
public fun compute_nullifier(
    season_id: u64,
    trial_id: u64,
    faction_id: u8,
    passport_id: address,
    wallet: address,
    nonce: u64,
): vector<u8> {
    let preimage = NullifierPreimage {
        season_id,
        trial_id,
        faction_id,
        passport_id,
        wallet,
        nonce,
    };
    hash::blake2b256(&bcs::to_bytes(&preimage))
}

/// Compute the deterministic shard bucket:
/// `u64_from_le(nullifier[0..8]) % shard_count` (Requirements 6.1, 6.4).
/// Identical to `shared/src/nullifier.ts` `shardBucket`. Pure helper. Takes the
/// nullifier by reference so callers can reuse it (e.g. also embed it in a
/// `ProofPayload`).
public fun compute_shard_bucket(nullifier: &vector<u8>, shard_count: u64): u64 {
    let mut acc: u64 = 0;
    let mut i = 0;
    while (i < 8) {
        let byte = (*vector::borrow(nullifier, i) as u64);
        acc = acc + (byte << ((i as u8) * 8));
        i = i + 1;
    };
    acc % shard_count
}

// ===========================================================================
// NullifierStore + acceptance pipeline (Phase 3)
// ===========================================================================

/// Shared store of accepted nullifier digests. Key = the 32-byte blake2b256
/// digest; value = the attestation `issued_ms`. ONLY the digest is persisted —
/// never the signature (Requirement 5.2). Replay protection rests on a
/// membership check against this table (Requirement 5.3).
public struct NullifierStore has key {
    id: UID,
    nullifiers: Table<vector<u8>, u64>,
}

/// Create and share an empty `NullifierStore`. Called once at init/deploy time
/// (Phase 5 wires this into the publish/init scripts). (Requirements 5.1, 5.2.)
public fun new_nullifier_store(ctx: &mut TxContext) {
    transfer::share_object(NullifierStore {
        id: object::new(ctx),
        nullifiers: table::new(ctx),
    });
}

/// Whether `nullifier` has already been accepted. (Requirement 5.3.)
public fun nullifier_contains(store: &NullifierStore, nullifier: &vector<u8>): bool {
    table::contains(&store.nullifiers, *nullifier)
}

/// Number of stored nullifier digests (for tests / cleanup accounting).
public fun nullifier_count(store: &NullifierStore): u64 {
    table::length(&store.nullifiers)
}

/// Insert an accepted nullifier digest (value = `issued_ms`). Package-visible:
/// only `submit_proof` (and Phase-4 cleanup) mutate the store. (Requirement
/// 5.2.)
public(package) fun insert_nullifier(
    store: &mut NullifierStore,
    nullifier: vector<u8>,
    issued_ms: u64,
) {
    table::add(&mut store.nullifiers, nullifier, issued_ms);
}

/// The full proof-acceptance pipeline (Requirement 7). Reconstructs the signed
/// `ProofPayload` from the typed entry-function arguments, verifies the
/// signature over those exact bytes, then runs the ordered context checks —
/// each with its own specific abort code — before applying the dual passport
/// update and the dual-channel shard update.
///
/// Checks run in EXACTLY this order (design Critical Path / Requirement 7):
///   1.  signer authorized in the registry           -> E_INVALID_SIGNER
///   2.  signature verifies (aborting wrapper)        -> E_INVALID_SIGNATURE
///   3.  season active at `clock` time                -> E_SEASON_INACTIVE
///   4.  attestation not expired (`now <= expiry_ms`) -> E_EXPIRED
///   5.  payload season_id == season.season_id        -> E_WRONG_SEASON
///   6.  payload network == season.network            -> E_WRONG_NETWORK
///   7.  payload package_id == season.expected_pkg    -> E_WRONG_PACKAGE
///   8.  payload trial_id == season.trial_id          -> E_WRONG_TRIAL
///   9.  payload faction_id == passport.faction_id    -> E_WRONG_FACTION
///   10. payload passport_id == object::id(passport)  -> E_WRONG_PASSPORT
///   11. payload wallet == passport.owner == sender   -> E_WRONG_WALLET
///   12. supplied shard triple == computed bucket     -> E_SCORE_SHARD_MISMATCH
///   13. nullifier unused                             -> E_REUSED_NULLIFIER
///
/// On success (Requirement 7.1): store the nullifier digest, append it to the
/// Season's accepted-key list, increase passport `raw_reputation` by `score`
/// AND increment `accepted_proof_count` by 1 (two distinct updates), apply the
/// dual-channel shard update, and emit `ProofAccepted` (+ `ScoreShardUpdated`
/// from `shard::apply_proof`). NO coin is transferred to the player
/// (Requirement 19.3 — no P2E).
public fun submit_proof(
    registry: &OracleSignerRegistry,
    passport: &mut YetiPassport,
    season: &mut Season,
    shard: &mut ScoreShard,
    store: &mut NullifierStore,
    network: vector<u8>,
    package_id: address,
    season_id: u64,
    trial_id: u64,
    faction_id: u8,
    passport_id: address,
    wallet: address,
    proof_source: vector<u8>,
    provenance_tier: u8,
    score: u64,
    territory_power: u64,
    issued_ms: u64,
    expiry_ms: u64,
    nonce: u64,
    nullifier: vector<u8>,
    sig: vector<u8>,
    pk: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
) {
    // 1. Signer must be authorized BEFORE any cryptographic work.
    assert!(registry::is_authorized(registry, pk), constants::e_invalid_signer());

    // Reconstruct the payload from the typed args so the bytes verified are the
    // bytes the logic acts on (no "sign one thing, act on another").
    let payload = build_payload(
        network,
        package_id,
        season_id,
        trial_id,
        faction_id,
        passport_id,
        wallet,
        proof_source,
        provenance_tier,
        score,
        territory_power,
        issued_ms,
        expiry_ms,
        nonce,
        nullifier,
    );

    // 2. Signature verifies. MUST use the aborting wrapper (fails closed) — a
    //    dropped bool check could fail open, an omitted assert cannot.
    assert_valid_signature(&payload, &sig, &pk);

    // 3. Season active at submission time.
    assert!(season::is_active(season, clock), constants::e_season_inactive());

    // 4. Attestation not expired.
    let now = clock::timestamp_ms(clock);
    assert!(now <= expiry_ms, constants::e_expired());

    // 5. Season id matches the submission season.
    assert!(season_id == season::season_id(season), constants::e_wrong_season());

    // 6. Network matches the Season-stored expected network (replay-safety).
    assert!(network == season::network(season), constants::e_wrong_network());

    // 7. Package id matches the Season-stored expected package id (replay-safety).
    assert!(package_id == season::expected_package_id(season), constants::e_wrong_package());

    // 8. Trial id matches the active trial stored on the Season.
    assert!(trial_id == season::trial_id(season), constants::e_wrong_trial());

    // 9. Faction matches the passport's immutable faction.
    assert!(faction_id == passport::faction_id(passport), constants::e_wrong_faction());

    // 10. Passport id matches the supplied passport object.
    assert!(
        object::id(passport) == object::id_from_address(passport_id),
        constants::e_wrong_passport(),
    );

    // 11. Wallet matches both the passport owner and the transaction sender.
    assert!(
        wallet == passport::owner(passport) && wallet == ctx.sender(),
        constants::e_wrong_wallet(),
    );

    // 12. Supplied shard's (season, faction, shard) triple equals the bucket
    //     computed from the nullifier using the Season's configured shard_count
    //     (reusing the canonical Phase-2 bucket function).
    let bucket = compute_shard_bucket(&nullifier, season::shard_count(season));
    assert!(
        shard::season_id(shard) == season_id
            && shard::faction_id(shard) == faction_id
            && shard::shard_id(shard) == bucket,
        constants::e_score_shard_mismatch(),
    );

    // 13. Nullifier must be unused (replay protection).
    assert!(!nullifier_contains(store, &nullifier), constants::e_reused_nullifier());

    // ---- Accept: all checks passed. Apply side effects in order. ----

    // Persist only the digest; record it on the Season for bounded cleanup.
    insert_nullifier(store, nullifier, issued_ms);
    season::append_nullifier_key(season, nullifier);

    // Two DISTINCT passport updates (Requirement 7.1).
    passport::add_reputation(passport, score);
    passport::increment_accepted_proof_count(passport);

    // Dual-channel shard update (also emits ScoreShardUpdated).
    shard::apply_proof(shard, score, territory_power);

    // Emit the full AcceptedProof binding (event-only; no stored object).
    events::emit_proof_accepted(
        season_id,
        trial_id,
        faction_id,
        object::id(passport),
        wallet,
        provenance_tier,
        score,
        territory_power,
        expiry_ms,
        nullifier,
    );
}

#[test_only]
/// Create a `NullifierStore` in-place (NOT shared) for unit tests.
public fun new_nullifier_store_for_testing(ctx: &mut TxContext): NullifierStore {
    NullifierStore { id: object::new(ctx), nullifiers: table::new(ctx) }
}

#[test_only]
/// Delete a test `NullifierStore`.
public fun destroy_nullifier_store_for_testing(store: NullifierStore) {
    let NullifierStore { id, nullifiers } = store;
    table::destroy_empty(nullifiers);
    object::delete(id);
}

#[test_only]
/// Drop a test `NullifierStore` even when non-empty (drops the table contents).
public fun drop_nullifier_store_for_testing(store: NullifierStore) {
    let NullifierStore { id, nullifiers } = store;
    table::drop(nullifiers);
    object::delete(id);
}

// ===========================================================================
// Test-only accessors
// ===========================================================================

#[test_only]
/// Expose the serialized payload body (without domain) for hex diffing in
/// known-vector tests.
public fun payload_bcs_bytes(payload: &ProofPayload): vector<u8> {
    bcs::to_bytes(payload)
}
