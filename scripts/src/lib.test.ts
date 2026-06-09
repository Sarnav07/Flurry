/**
 * Hermetic unit tests for the deployment-artifact load/merge/save logic in
 * `lib.ts` (Task 8.5).
 *
 * These ALWAYS run — no chain, no keys, no network. They use a per-test temp
 * directory via the `YETI_ARTIFACT_DIR` override so the real
 * `deployed.<network>.json` is never touched, and assert:
 *   - round-trips (save → load returns the same data),
 *   - network-keyed path (localnet vs testnet write to distinct files),
 *   - merge appends without clobbering prior ids,
 *   - merge ignores `undefined` patch values,
 *   - cross-network artifact contents are isolated,
 *   - a missing artifact loads as a fresh `{ network }` shell,
 *   - `requireArtifactField` throws on a missing id.
 */

import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  artifactPath,
  loadArtifact,
  mergeArtifact,
  requireArtifactField,
  saveArtifact,
  type DeployedArtifact,
} from "./lib.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(resolve(tmpdir(), "yeti-artifact-"));
  process.env["YETI_ARTIFACT_DIR"] = tmp;
});

afterEach(() => {
  delete process.env["YETI_ARTIFACT_DIR"];
  rmSync(tmp, { recursive: true, force: true });
});

describe("artifact path is network-keyed", () => {
  it("derives distinct file names per network", () => {
    expect(artifactPath("localnet")).toBe(resolve(tmp, "deployed.localnet.json"));
    expect(artifactPath("testnet")).toBe(resolve(tmp, "deployed.testnet.json"));
    expect(artifactPath("localnet")).not.toBe(artifactPath("testnet"));
  });
});

describe("load with no file returns a fresh shell", () => {
  it("returns { network } when the artifact does not exist", () => {
    expect(existsSync(artifactPath("localnet"))).toBe(false);
    expect(loadArtifact("localnet")).toEqual({ network: "localnet" });
  });
});

describe("save / load round-trip", () => {
  it("loads exactly what was saved", () => {
    const artifact: DeployedArtifact = {
      network: "localnet",
      packageId: "0xpkg",
      adminCap: "0xadmin",
      shards: [{ objectId: "0xs0", faction: 1, shard: 0 }],
      recipients: ["0xr0", "0xr1", "0xr2", "0xr3"],
    };
    saveArtifact(artifact, "localnet");
    expect(loadArtifact("localnet")).toEqual(artifact);
  });
});

describe("merge appends without clobbering", () => {
  it("preserves prior ids while adding new ones", () => {
    mergeArtifact({ packageId: "0xpkg", adminCap: "0xadmin" }, "localnet");
    mergeArtifact({ oracleRegistryId: "0xreg", nullifierStoreId: "0xnull" }, "localnet");
    const merged = mergeArtifact({ seasonId: "0xseason", seasonNumber: 1 }, "localnet");

    expect(merged.packageId).toBe("0xpkg");
    expect(merged.adminCap).toBe("0xadmin");
    expect(merged.oracleRegistryId).toBe("0xreg");
    expect(merged.nullifierStoreId).toBe("0xnull");
    expect(merged.seasonId).toBe("0xseason");
    expect(merged.seasonNumber).toBe(1);
  });

  it("overwrites only the keys explicitly provided", () => {
    mergeArtifact({ packageId: "0xfirst" }, "localnet");
    const merged = mergeArtifact({ packageId: "0xsecond" }, "localnet");
    expect(merged.packageId).toBe("0xsecond");
  });

  it("ignores undefined patch values (no accidental wipe)", () => {
    mergeArtifact({ packageId: "0xpkg" }, "localnet");
    const merged = mergeArtifact({ packageId: undefined, adminCap: "0xadmin" }, "localnet");
    expect(merged.packageId).toBe("0xpkg");
    expect(merged.adminCap).toBe("0xadmin");
  });
});

describe("cross-network isolation", () => {
  it("keeps localnet and testnet artifacts separate", () => {
    mergeArtifact({ packageId: "0xlocal" }, "localnet");
    mergeArtifact({ packageId: "0xtest" }, "testnet");
    expect(loadArtifact("localnet").packageId).toBe("0xlocal");
    expect(loadArtifact("testnet").packageId).toBe("0xtest");
  });

  it("rejects loading an artifact whose stored network mismatches", () => {
    // Hand-write a localnet file that claims to be testnet.
    saveArtifact({ network: "testnet", packageId: "0xx" }, "localnet");
    // The on-disk file path is deployed.localnet.json but content says testnet.
    const onDisk = JSON.parse(readFileSync(artifactPath("localnet"), "utf8"));
    expect(onDisk.network).toBe("testnet");
    expect(() => loadArtifact("localnet")).toThrow(/network/);
  });
});

describe("requireArtifactField", () => {
  it("returns a present field", () => {
    const artifact = mergeArtifact({ packageId: "0xpkg" }, "localnet");
    expect(requireArtifactField(artifact, "packageId")).toBe("0xpkg");
  });

  it("throws for a missing field", () => {
    const artifact = loadArtifact("localnet");
    expect(() => requireArtifactField(artifact, "seasonId")).toThrow(/missing "seasonId"/);
  });
});
