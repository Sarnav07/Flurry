# Yeti Trials — Backend

A Sui-native faction engine. Four Yeti factions (Glaciers, Avalanche, Blizzard,
Thaw) compete over a territory map by submitting provenance-tagged proofs of
real on-chain behavior. This repository is the **backend**: the Sui Move package,
the TypeScript orchestrator / demo-oracle, the deploy/init/lifecycle/smoke
scripts, and the shared TS modules that form the single source of truth for the
TS↔Move byte contract. The frontend is built separately and is out of scope.

The backend proves exactly one primitive:

> Provenance-tagged reputation can update a Sui-native faction map and route
> impact allocation **without becoming P2E**.

Three non-negotiable rules shape everything (read
[docs/TRUST_BOUNDARIES.md](./docs/TRUST_BOUNDARIES.md) before anything else):

1. **No P2E.** No contract function or endpoint transfers a reward token to a
   player.
2. **Reputation is raw and provenance-tagged; territory power is game-balanced.**
   They are two separate numeric channels — balancing never mutates raw
   reputation.
3. **Trust boundaries are visible.** The demo oracle is centralized V1;
   oracle-attested proof is never labeled native; zkLogin is onboarding, not
   Sybil resistance.

## Architecture

A pnpm monorepo with four layers that meet at one contract:

| Package | Path | Role |
|---|---|---|
| Contracts | `contracts/` | The `yeti_trials` Move package (edition 2024): `constants`, `events`, `registry`, `passport`, `season`, `shard`, `proof` (orchestration hub), `territory`, `impact`, `sponsor`. |
| Shared | `shared/` | Single source of truth for the TS↔Move byte contract: `constants.ts`, `bcs.ts` (`ProofPayload` layout), `message.ts` (signed message), `nullifier.ts` (derivation + shard bucket), `types.ts`. |
| Orchestrator | `orchestrator/` | A Fastify service in three roles — demo oracle (Ed25519 signer), frontend API, and chain reader. Reuses `shared/` for all byte-layout work. |
| Scripts | `scripts/` | CLI ops keyed by `SUI_NETWORK`: publish, init, register oracle, lifecycle (submit/finalize/cleanup), and the smoke test. Reads/writes per-network `deployed.<network>.json`. |

The make-or-break integration is the **byte-identical TS↔Move signing path**:
the oracle signs `DOMAIN || bcs(ProofPayload)` in TypeScript and the Move
contract reconstructs and verifies the same bytes on-chain. See
[docs/MESSAGE_FORMAT.md](./docs/MESSAGE_FORMAT.md) and
[docs/OBJECT_MODEL.md](./docs/OBJECT_MODEL.md).

```
shared/ (byte layout) ──▶ orchestrator/ (signs) ──▶ contracts/ (verifies on-chain)
                              ▲                          ▲
                          scripts/ (publish, init, drive lifecycle, smoke)
```

Deployment identifiers are **never hard-coded**: publish/init write them to
`deployed.<network>.json` and the orchestrator + lifecycle scripts read them
back.

## Documentation

- [docs/MESSAGE_FORMAT.md](./docs/MESSAGE_FORMAT.md) — the exact 15-field
  `ProofPayload` BCS layout, the raw `DOMAIN` prefix, the raw 64-byte Ed25519
  signature format, and nullifier derivation. The TS↔Move contract.
- [docs/OBJECT_MODEL.md](./docs/OBJECT_MODEL.md) — every on-chain object, its
  fields, abilities, ownership, and invariants.
- [docs/DEMO_FLOW.md](./docs/DEMO_FLOW.md) — the Genesis Frost walkthrough with
  exact commands.
- [docs/TRUST_BOUNDARIES.md](./docs/TRUST_BOUNDARIES.md) — what the backend does
  and does **not** guarantee.

## Setup

```bash
pnpm install
pnpm -r run build          # build shared / orchestrator / scripts
pnpm run move:build        # sui move build --path contracts
cp .env.example .env       # then fill in keys / recipients (never commit .env)
```

Useful root scripts (`package.json`):

```bash
pnpm run build       # pnpm -r run build
pnpm run test        # pnpm -r run test (all TS test suites)
pnpm run typecheck   # tsc --noEmit across all packages
pnpm run move:build  # sui move build --path contracts
pnpm run move:test   # sui move test  --path contracts
pnpm run smoke       # localnet Genesis Frost smoke test
```

## Localnet quickstart

```bash
# 1. Start a local validator
sui start --force-regenesis        # http://127.0.0.1:9000

# 2. .env: SUI_NETWORK=localnet, SUI_RPC_URL=http://127.0.0.1:9000,
#          ADMIN_PRIVATE_KEY / ORACLE_PRIVATE_KEY / ORACLE_PUBLIC_KEY,
#          IMPACT_RECIPIENT_* set

# 3. Publish, initialize, register the oracle
pnpm --filter @yeti-trials/scripts run publish
pnpm --filter @yeti-trials/scripts run init:all
pnpm --filter @yeti-trials/scripts run register:oracle

# 4. Run the orchestrator
pnpm --filter @yeti-trials/orchestrator run dev   # http://localhost:3000

# 5. Drive the lifecycle (or run the smoke test below)
pnpm --filter @yeti-trials/scripts run submit:proof
pnpm --filter @yeti-trials/scripts run finalize:territory
pnpm --filter @yeti-trials/scripts run finalize:impact
pnpm --filter @yeti-trials/scripts run cleanup:batch
```

All ids are written to `deployed.localnet.json`.

## Testnet quickstart

The same flow runs on testnet via the `SUI_NETWORK` switch; publish, init,
lifecycle, and smoke all target `deployed.testnet.json`.

```bash
# .env: SUI_NETWORK=testnet  (leave SUI_RPC_URL blank to use the default
#       testnet fullnode, or set it explicitly)

# 1. Fund the admin (and any distinct player / recipient) addresses from the
#    Sui testnet faucet — this is OUT OF BAND; the scripts do not auto-faucet.

# 2. Same commands as localnet — they read SUI_NETWORK and write deployed.testnet.json
pnpm --filter @yeti-trials/scripts run publish
pnpm --filter @yeti-trials/scripts run init:all
pnpm --filter @yeti-trials/scripts run register:oracle
```

Testnet uses **generous windows for real-clock latency**: the Genesis Frost
season opens a 14-day active window on testnet (vs. 24h on localnet), and the
attestation validity window is configurable via `ATTEST_EXPIRY_MS` (default 24h)
so an attestation does not expire before it is submitted. See
[docs/DEMO_FLOW.md](./docs/DEMO_FLOW.md#localnet-vs-testnet) for details.

## Running the smoke test

The localnet smoke test runs the full Genesis Frost flow end to end with a
per-step PASS/FAIL ledger and exits non-zero on the first failing assertion. It
reuses the real publish/init/lifecycle scripts and the orchestrator — no fakes.

```bash
# Requires a reachable localnet plus ADMIN_PRIVATE_KEY and ORACLE_PRIVATE_KEY.
pnpm run smoke
```

If localnet is unreachable or required keys are missing, it prints a clearly
labeled "SMOKE PENDING — not run" report and exits 0 (a pending/skip is **not** a
pass; no on-chain result is faked). `SMOKE_WINDOW_MS` tunes the localnet season
window.

## Security & secrets

Never commit a populated `.env`, real private keys/keystores, or a populated
`deployed.*.json` (all are gitignored). The orchestrator's demo oracle is a
centralized V1 trusted signer — see
[docs/TRUST_BOUNDARIES.md](./docs/TRUST_BOUNDARIES.md).
