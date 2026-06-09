// @yeti-trials/shared — single source of truth for the TS<->Move byte contract.
//
// Phase 0 exposes constants.ts (mirror of constants.move). Phase 2 adds the
// canonical signing-path modules: the BCS layout (bcs.ts), the signed-message
// builder (message.ts), and nullifier derivation + shard bucketing
// (nullifier.ts). The shared types (types.ts) are added in Phase 6.
export * from "./constants.js";
export * from "./bcs.js";
// message.ts exports a bytes `DOMAIN`; re-export only the builder here to avoid
// colliding with the constants `DOMAIN` string. Import `DOMAIN` (bytes)
// directly from "@yeti-trials/shared/message" or use `DOMAIN_BYTES`.
export { buildSignedMessage } from "./message.js";
export * from "./nullifier.js";
