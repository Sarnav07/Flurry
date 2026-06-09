/// Oracle signer registry and the publisher capability that gates it.
///
/// On publish, `init` mints a single `AdminCap` to the publisher and shares an
/// empty `OracleSignerRegistry`. Only an `AdminCap` holder can add or revoke
/// authorized oracle signer public keys; anyone can query authorization.
///
/// Keys are raw 32-byte Ed25519 public keys (as produced by
/// `Ed25519Keypair.getPublicKey().toRawBytes()` on the TS side). This module
/// performs NO signature/proof verification — it is purely the authorized-key
/// set plus its CRUD and a membership check. (Requirement 3.1–3.4.)
module yeti_trials::registry;

use sui::table::{Self, Table};

/// Capability minted to the publisher authorizing administrative operations
/// (add/revoke oracle signers). Has `store` so it can be transferred/custodied.
public struct AdminCap has key, store {
    id: UID,
}

/// Shared object holding the set of authorized oracle public keys. The value is
/// always `true`; membership in the table is the authorization signal.
public struct OracleSignerRegistry has key {
    id: UID,
    signers: Table<vector<u8>, bool>,
}

/// Published-package initializer: mint the `AdminCap` to the publisher and
/// share the registry. (Requirement 3.1.)
fun init(ctx: &mut TxContext) {
    transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
    transfer::share_object(OracleSignerRegistry {
        id: object::new(ctx),
        signers: table::new(ctx),
    });
}

/// Record `pk` as an authorized signer. Idempotent: adding a key already
/// present is a no-op. (Requirement 3.2.)
public fun add_signer(_admin: &AdminCap, registry: &mut OracleSignerRegistry, pk: vector<u8>) {
    if (!table::contains(&registry.signers, pk)) {
        table::add(&mut registry.signers, pk, true);
    }
}

/// Remove `pk` from the authorized set. Idempotent: revoking a key that is not
/// present is a no-op. (Requirement 3.3.)
public fun revoke_signer(_admin: &AdminCap, registry: &mut OracleSignerRegistry, pk: vector<u8>) {
    if (table::contains(&registry.signers, pk)) {
        table::remove(&mut registry.signers, pk);
    }
}

/// Report whether `pk` is currently authorized. (Requirement 3.4.)
public fun is_authorized(registry: &OracleSignerRegistry, pk: vector<u8>): bool {
    table::contains(&registry.signers, pk)
}

#[test_only]
/// Test-only initializer so unit tests can mint the cap and share the registry
/// without a real publish transaction.
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx)
}

#[test_only]
/// Build an `OracleSignerRegistry` in-place (NOT shared) for unit tests.
public fun new_registry_for_testing(ctx: &mut TxContext): OracleSignerRegistry {
    OracleSignerRegistry { id: object::new(ctx), signers: table::new(ctx) }
}

#[test_only]
/// Authorize `pk` directly on a test registry (no `AdminCap` needed).
public fun authorize_for_testing(registry: &mut OracleSignerRegistry, pk: vector<u8>) {
    if (!table::contains(&registry.signers, pk)) {
        table::add(&mut registry.signers, pk, true);
    }
}

#[test_only]
/// Drop a test registry (drops the signers table even if non-empty).
public fun destroy_for_testing(registry: OracleSignerRegistry) {
    let OracleSignerRegistry { id, signers } = registry;
    table::drop(signers);
    object::delete(id);
}
