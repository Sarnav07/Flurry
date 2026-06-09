/**
 * Builds the `Signed_Message` the oracle signs and the Move contract verifies
 * (Requirement 4.2):
 *
 *     Signed_Message = DOMAIN || bcs::to_bytes(ProofPayload)
 *
 * The `DOMAIN` prefix is prepended as RAW BYTES, never as a BCS field. The
 * Move side prepends the identical `constants::domain()` bytes before
 * `ed25519_verify`, so the two byte streams match exactly.
 */

import { DOMAIN_BYTES } from "./constants.js";
import { serializeProofPayload, type ProofPayload } from "./bcs.js";

/**
 * The signing domain as raw UTF-8 bytes of "Yeti Trials". This is the byte
 * prefix that is prepended (NOT as a BCS field) to the serialized payload.
 * Equal to {@link DOMAIN_BYTES} from constants; re-exported here as the
 * canonical domain for the signing path.
 */
export const DOMAIN: Uint8Array = DOMAIN_BYTES;

/**
 * Construct the `Signed_Message`: the raw `domain` bytes followed by the BCS
 * serialization of `payload`. Pass {@link DOMAIN} as `domain` for the
 * production signing path.
 */
export function buildSignedMessage(
  domain: Uint8Array,
  payload: ProofPayload,
): Uint8Array {
  const body = serializeProofPayload(payload);
  const out = new Uint8Array(domain.length + body.length);
  out.set(domain, 0);
  out.set(body, domain.length);
  return out;
}
