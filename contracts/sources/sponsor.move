/// `SponsorSlot`: a DISPLAY-ONLY object representing scarce sponsor campaign
/// routing for a season.
///
/// This module stores sponsor metadata (name, trial id, action label, status)
/// and emits create/update events for indexers. There is deliberately NO
/// auction, bid, payment, coin, or balance surface here — sponsor monetization
/// is out of scope for the demo. (Requirements 12.1–12.3.)
module yeti_trials::sponsor;

use yeti_trials::events;

/// A shared, display-only sponsor slot.
public struct SponsorSlot has key {
    id: UID,
    name: vector<u8>,
    trial_id: u64,
    action_label: vector<u8>,
    status: u8,
}

/// Create and SHARE a `SponsorSlot`, storing the fields and emitting
/// `SponsorSlotCreated`. (Requirement 12.1.)
public fun create_slot(
    name: vector<u8>,
    trial_id: u64,
    action_label: vector<u8>,
    status: u8,
    ctx: &mut TxContext,
) {
    let slot = SponsorSlot { id: object::new(ctx), name, trial_id, action_label, status };
    // `vector<u8>` is copyable, so the event helper copies the stored fields.
    events::emit_sponsor_slot_created(slot.name, slot.trial_id, slot.action_label, slot.status);
    transfer::share_object(slot);
}

/// Update a `SponsorSlot`'s stored fields and emit `SponsorSlotUpdated`.
/// (Requirement 12.2.)
public fun update_slot(
    slot: &mut SponsorSlot,
    name: vector<u8>,
    trial_id: u64,
    action_label: vector<u8>,
    status: u8,
) {
    slot.name = name;
    slot.trial_id = trial_id;
    slot.action_label = action_label;
    slot.status = status;
    events::emit_sponsor_slot_updated(slot.name, slot.trial_id, slot.action_label, slot.status);
}

// ===========================================================================
// Read accessors (public — stable API for scripts and tests).
// ===========================================================================

public fun name(slot: &SponsorSlot): vector<u8> { slot.name }

public fun trial_id(slot: &SponsorSlot): u64 { slot.trial_id }

public fun action_label(slot: &SponsorSlot): vector<u8> { slot.action_label }

public fun status(slot: &SponsorSlot): u8 { slot.status }

// ===========================================================================
// Test-only constructors / destructors.
// ===========================================================================

#[test_only]
/// Build a `SponsorSlot` in-place (NOT shared) for unit tests.
public fun new_slot_for_testing(
    name: vector<u8>,
    trial_id: u64,
    action_label: vector<u8>,
    status: u8,
    ctx: &mut TxContext,
): SponsorSlot {
    SponsorSlot { id: object::new(ctx), name, trial_id, action_label, status }
}

#[test_only]
/// Delete a test `SponsorSlot`.
public fun destroy_for_testing(slot: SponsorSlot) {
    let SponsorSlot { id, name: _, trial_id: _, action_label: _, status: _ } = slot;
    object::delete(id);
}
