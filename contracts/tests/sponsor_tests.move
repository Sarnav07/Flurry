/// Phase-4 sponsor slot tests (6.9).
///
/// Exercises the real `create_slot` (shares + emits `SponsorSlotCreated`) and
/// `update_slot` (emits `SponsorSlotUpdated`) paths, asserting the stored
/// fields before and after. The module is display-only: there is no payment or
/// auction surface to call (none exists in `sponsor.move`). (Requirements
/// 12.1, 12.2, 12.3.)
#[test_only]
module yeti_trials::sponsor_tests;

use sui::test_scenario as ts;
use yeti_trials::registry::{Self, AdminCap};
use yeti_trials::sponsor::{Self, SponsorSlot};

const OPERATOR: address = @0x0DE;

#[test]
fun create_then_update_stores_fields() {
    let mut scenario = ts::begin(OPERATOR);

    // M-1: create_slot/update_slot are AdminCap-gated; mint the cap (as the
    // publisher would) and pass it through both calls.
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(OPERATOR);
    {
        let admin = scenario.take_from_sender<AdminCap>();
        let ctx = scenario.ctx();
        sponsor::create_slot(&admin, b"Frost Co", 7, b"Avalanche Testnet Proof", 0, ctx);
        scenario.return_to_sender(admin);
    };

    // The created slot is shared with the stored fields.
    scenario.next_tx(OPERATOR);
    {
        let admin = scenario.take_from_sender<AdminCap>();
        let mut slot = scenario.take_shared<SponsorSlot>();
        assert!(sponsor::name(&slot) == b"Frost Co", 0);
        assert!(sponsor::trial_id(&slot) == 7, 1);
        assert!(sponsor::action_label(&slot) == b"Avalanche Testnet Proof", 2);
        assert!(sponsor::status(&slot) == 0, 3);

        // Update every stored field; emits SponsorSlotUpdated.
        sponsor::update_slot(&admin, &mut slot, b"Glacier Labs", 9, b"Glaciers Push", 1);
        assert!(sponsor::name(&slot) == b"Glacier Labs", 4);
        assert!(sponsor::trial_id(&slot) == 9, 5);
        assert!(sponsor::action_label(&slot) == b"Glaciers Push", 6);
        assert!(sponsor::status(&slot) == 1, 7);

        ts::return_shared(slot);
        scenario.return_to_sender(admin);
    };
    scenario.end();
}

#[test]
fun in_place_constructor_round_trips_fields() {
    let mut scenario = ts::begin(OPERATOR);
    {
        let ctx = scenario.ctx();
        let slot = sponsor::new_slot_for_testing(b"Solo", 3, b"label", 2, ctx);
        assert!(sponsor::name(&slot) == b"Solo", 0);
        assert!(sponsor::trial_id(&slot) == 3, 1);
        assert!(sponsor::action_label(&slot) == b"label", 2);
        assert!(sponsor::status(&slot) == 2, 3);
        sponsor::destroy_for_testing(slot);
    };
    scenario.end();
}
