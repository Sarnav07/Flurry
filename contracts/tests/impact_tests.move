/// Phase-4 impact escrow tests.
///
/// Property 10 (6.5): the winning faction's verified recipient receives a
///   balance delta equal to the FULL escrow balance, transferred EXACTLY ONCE;
///   a second `disburse` aborts `E_IMPACT_ALREADY_FINALIZED`; disbursing before
///   the territory is finalized aborts `E_SEASON_NOT_FINALIZED`.
#[test_only]
module yeti_trials::impact_tests;

use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::test_scenario as ts;
use yeti_trials::impact::{Self, ImpactEscrow};
use yeti_trials::territory;

const OPERATOR: address = @0x0DE;
const R0: address = @0xA0;
const R1: address = @0xA1; // Avalanche recipient (winner in these tests)
const R2: address = @0xA2;
const R3: address = @0xA3;

const SEASON_ID: u64 = 1;
const FUNDED: u64 = 9_000;

// Abort codes mirrored from constants.move.
const E_IMPACT_ALREADY_FINALIZED: u64 = 18;
const E_SEASON_NOT_FINALIZED: u64 = 19;

fun recipients(): vector<address> { vector[R0, R1, R2, R3] }

// ===========================================================================
// Property 10 (6.5): single disbursement of the full balance to the winner.
// THIS IS THE ESCROW-DISBURSES-ONCE EVIDENCE.
// ===========================================================================

// Feature: yeti-trials-backend, Property 10: Single disbursement
#[test]
fun disburse_routes_full_balance_once_to_winner() {
    let mut scenario = ts::begin(OPERATOR);
    {
        let ctx = scenario.ctx();
        let mut escrow = impact::new_escrow_for_testing(SEASON_ID, recipients(), ctx);
        impact::fund(&mut escrow, coin::mint_for_testing<SUI>(FUNDED, ctx));
        assert!(impact::balance_value(&escrow) == FUNDED, 0);

        // Finalized map: faction 1 (Avalanche) captured the contested territory.
        let map = territory::new_finalized_map_for_testing(SEASON_ID, 1, ctx);

        impact::disburse(&mut escrow, &map, ctx);

        // The escrow is now empty and flagged disbursed.
        assert!(impact::balance_value(&escrow) == 0, 1);
        assert!(impact::is_disbursed(&escrow), 2);

        territory::destroy_for_testing(map);
        impact::destroy_for_testing(escrow);
    };

    // The winner's recipient (R1) received exactly one coin worth the FULL
    // funded balance. Delta == FUNDED, and because the escrow balance is now 0
    // and `disburse` performs a single `public_transfer`, the routing happened
    // exactly once.
    scenario.next_tx(R1);
    {
        let payout = scenario.take_from_sender<Coin<SUI>>();
        assert!(coin::value(&payout) == FUNDED, 3);
        scenario.return_to_sender(payout);
    };
    scenario.end();
}

// Feature: yeti-trials-backend, Property 10: Single disbursement
//
// A second disburse aborts E_IMPACT_ALREADY_FINALIZED.
#[test]
#[expected_failure(abort_code = E_IMPACT_ALREADY_FINALIZED, location = yeti_trials::impact)]
fun second_disburse_aborts() {
    let mut scenario = ts::begin(OPERATOR);
    {
        let ctx = scenario.ctx();
        let mut escrow = impact::new_escrow_for_testing(SEASON_ID, recipients(), ctx);
        impact::fund(&mut escrow, coin::mint_for_testing<SUI>(FUNDED, ctx));
        let map = territory::new_finalized_map_for_testing(SEASON_ID, 1, ctx);

        impact::disburse(&mut escrow, &map, ctx);
        // Second disburse must abort.
        impact::disburse(&mut escrow, &map, ctx);

        territory::destroy_for_testing(map);
        impact::destroy_for_testing(escrow);
    };
    scenario.end();
}

// Feature: yeti-trials-backend, Property 10: Single disbursement
//
// Disbursing before the territory is finalized aborts E_SEASON_NOT_FINALIZED.
#[test]
#[expected_failure(abort_code = E_SEASON_NOT_FINALIZED, location = yeti_trials::impact)]
fun disburse_before_territory_finalize_aborts() {
    let mut scenario = ts::begin(OPERATOR);
    {
        let ctx = scenario.ctx();
        let mut escrow = impact::new_escrow_for_testing(SEASON_ID, recipients(), ctx);
        impact::fund(&mut escrow, coin::mint_for_testing<SUI>(FUNDED, ctx));
        // Unfinalized territory map.
        let map = territory::new_territory_map_for_testing(SEASON_ID, 1, ctx);

        impact::disburse(&mut escrow, &map, ctx);

        territory::destroy_for_testing(map);
        impact::destroy_for_testing(escrow);
    };
    scenario.end();
}
