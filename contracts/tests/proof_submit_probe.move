/// TEMPORARY probe — prints the deterministic object id assigned to the first
/// passport created in a fresh `test_scenario` started by WALLET. Used once to
/// generate the genuine-signature submit-proof fixtures, then deleted.
#[test_only]
module yeti_trials::proof_submit_probe;

use std::debug;
use sui::test_scenario as ts;
use yeti_trials::passport;

const WALLET: address = @0xB0B;

#[test]
fun print_passport_id() {
    let mut scenario = ts::begin(WALLET);
    {
        let ctx = scenario.ctx();
        let p = passport::new_passport_for_testing(WALLET, 42, 1, ctx);
        debug::print(&object::id(&p));
        passport::destroy_for_testing(p);
    };
    scenario.end();
}
