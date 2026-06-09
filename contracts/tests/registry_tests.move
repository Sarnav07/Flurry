/// Tests for the oracle signer registry (Requirement 3.2–3.4).
#[test_only]
module yeti_trials::registry_tests;

use sui::test_scenario as ts;
use yeti_trials::registry::{Self, AdminCap, OracleSignerRegistry};

const ADMIN: address = @0xA1;

/// A representative raw 32-byte Ed25519 public key.
fun sample_pk(): vector<u8> {
    vector[
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
        16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
    ]
}

// Feature: yeti-trials-backend, Property 13: Signer registry add/revoke round-trip
//
// For any raw 32-byte key: add -> is_authorized true; revoke -> is_authorized false.
#[test]
fun add_revoke_round_trip() {
    let mut scenario = ts::begin(ADMIN);

    // Publish: mint AdminCap to ADMIN and share the registry.
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(ADMIN);
    {
        let admin = scenario.take_from_sender<AdminCap>();
        let mut reg = scenario.take_shared<OracleSignerRegistry>();
        let pk = sample_pk();

        // Initially not authorized.
        assert!(!registry::is_authorized(&reg, pk), 0);

        // Add -> authorized.
        registry::add_signer(&admin, &mut reg, pk);
        assert!(registry::is_authorized(&reg, pk), 1);

        // Revoke -> not authorized.
        registry::revoke_signer(&admin, &mut reg, pk);
        assert!(!registry::is_authorized(&reg, pk), 2);

        scenario.return_to_sender(admin);
        ts::return_shared(reg);
    };

    scenario.end();
}

/// add_signer is idempotent (adding twice keeps it authorized).
#[test]
fun add_is_idempotent() {
    let mut scenario = ts::begin(ADMIN);
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(ADMIN);
    {
        let admin = scenario.take_from_sender<AdminCap>();
        let mut reg = scenario.take_shared<OracleSignerRegistry>();
        let pk = sample_pk();

        registry::add_signer(&admin, &mut reg, pk);
        registry::add_signer(&admin, &mut reg, pk);
        assert!(registry::is_authorized(&reg, pk), 0);

        scenario.return_to_sender(admin);
        ts::return_shared(reg);
    };

    scenario.end();
}

/// revoke_signer on an absent key is a no-op (does not abort).
#[test]
fun revoke_absent_is_noop() {
    let mut scenario = ts::begin(ADMIN);
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(ADMIN);
    {
        let admin = scenario.take_from_sender<AdminCap>();
        let mut reg = scenario.take_shared<OracleSignerRegistry>();
        let pk = sample_pk();

        registry::revoke_signer(&admin, &mut reg, pk);
        assert!(!registry::is_authorized(&reg, pk), 0);

        scenario.return_to_sender(admin);
        ts::return_shared(reg);
    };

    scenario.end();
}
