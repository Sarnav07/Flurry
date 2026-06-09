/// All `yeti_trials` event structs (`copy, drop`) and their `emit_*` helpers.
///
/// Centralizing event definitions keeps the emitted schema in one place for
/// indexers and the frontend. Every struct derives `copy, drop` as required by
/// `sui::event::emit`. No event carries private signer keys or secret values —
/// only public, indexable context (see Requirement 13.3).
module yeti_trials::events;

use sui::event;

// ===========================================================================
// Event structs
// ===========================================================================

/// Emitted by `passport::create_passport_with_faction`.
public struct PassportCreated has copy, drop {
    season_id: u64,
    faction_id: u8,
    passport_id: ID,
    wallet: address,
}

/// Emitted by `proof::submit_proof`. Carries the full AcceptedProof binding;
/// only the nullifier digest is persisted on-chain.
public struct ProofAccepted has copy, drop {
    season_id: u64,
    trial_id: u64,
    faction_id: u8,
    passport_id: ID,
    wallet: address,
    provenance_tier: u8,
    score: u64,
    territory_power: u64,
    expiry_ms: u64,
    nullifier: vector<u8>,
}

/// Emitted by `shard::apply_proof`.
public struct ScoreShardUpdated has copy, drop {
    season_id: u64,
    faction_id: u8,
    shard_id: u64,
    score_delta: u64,
    territory_power_delta: u64,
}

/// Emitted by `territory::finalize_territory`.
public struct TerritoryFinalized has copy, drop {
    season_id: u64,
    owners: vector<u8>,
    finalized_power: vector<u64>,
}

/// Emitted by `impact::fund`.
public struct ImpactEscrowFunded has copy, drop {
    season_id: u64,
    amount: u64,
}

/// Emitted by `impact::disburse`.
public struct ImpactFinalized has copy, drop {
    season_id: u64,
    faction_id: u8,
    recipient: address,
}

/// Emitted by `proof::cleanup_batches` (create).
public struct CleanupBatchCreated has copy, drop {
    season_id: u64,
    key_count: u64,
}

/// Emitted by `proof::cleanup_batches` (delete).
public struct CleanupBatchDeleted has copy, drop {
    season_id: u64,
    key_count: u64,
}

/// Emitted by `sponsor::create_slot`.
public struct SponsorSlotCreated has copy, drop {
    name: vector<u8>,
    trial_id: u64,
    action_label: vector<u8>,
    status: u8,
}

/// Emitted by `sponsor::update_slot`.
public struct SponsorSlotUpdated has copy, drop {
    name: vector<u8>,
    trial_id: u64,
    action_label: vector<u8>,
    status: u8,
}

// ===========================================================================
// Emit helpers — one per event.
// ===========================================================================

public fun emit_passport_created(
    season_id: u64,
    faction_id: u8,
    passport_id: ID,
    wallet: address,
) {
    event::emit(PassportCreated { season_id, faction_id, passport_id, wallet });
}

public fun emit_proof_accepted(
    season_id: u64,
    trial_id: u64,
    faction_id: u8,
    passport_id: ID,
    wallet: address,
    provenance_tier: u8,
    score: u64,
    territory_power: u64,
    expiry_ms: u64,
    nullifier: vector<u8>,
) {
    event::emit(ProofAccepted {
        season_id,
        trial_id,
        faction_id,
        passport_id,
        wallet,
        provenance_tier,
        score,
        territory_power,
        expiry_ms,
        nullifier,
    });
}

public fun emit_score_shard_updated(
    season_id: u64,
    faction_id: u8,
    shard_id: u64,
    score_delta: u64,
    territory_power_delta: u64,
) {
    event::emit(ScoreShardUpdated {
        season_id,
        faction_id,
        shard_id,
        score_delta,
        territory_power_delta,
    });
}

public fun emit_territory_finalized(
    season_id: u64,
    owners: vector<u8>,
    finalized_power: vector<u64>,
) {
    event::emit(TerritoryFinalized { season_id, owners, finalized_power });
}

public fun emit_impact_escrow_funded(season_id: u64, amount: u64) {
    event::emit(ImpactEscrowFunded { season_id, amount });
}

public fun emit_impact_finalized(
    season_id: u64,
    faction_id: u8,
    recipient: address,
) {
    event::emit(ImpactFinalized { season_id, faction_id, recipient });
}

public fun emit_cleanup_batch_created(season_id: u64, key_count: u64) {
    event::emit(CleanupBatchCreated { season_id, key_count });
}

public fun emit_cleanup_batch_deleted(season_id: u64, key_count: u64) {
    event::emit(CleanupBatchDeleted { season_id, key_count });
}

public fun emit_sponsor_slot_created(
    name: vector<u8>,
    trial_id: u64,
    action_label: vector<u8>,
    status: u8,
) {
    event::emit(SponsorSlotCreated { name, trial_id, action_label, status });
}

public fun emit_sponsor_slot_updated(
    name: vector<u8>,
    trial_id: u64,
    action_label: vector<u8>,
    status: u8,
) {
    event::emit(SponsorSlotUpdated { name, trial_id, action_label, status });
}
