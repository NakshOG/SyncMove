import test from "node:test";
import assert from "node:assert/strict";

import {
  generateKeyPair,
  generateSignedPreKey,
  verifySignedPreKeySignature,
} from "../lib/e2ee/x3dh.ts";

test("X3DH identity keys include real signing material and validate signed prekeys", async () => {
  const identity = await generateKeyPair();

  assert.equal(identity.publicKey.length, 32);
  assert.equal(identity.privateKey.length, 32);
  assert.ok(identity.signingPublicKey);
  assert.ok(identity.signingPrivateKey);
  assert.equal(identity.signingPublicKey.length, 32);
  assert.equal(identity.signingPrivateKey.length, 32);

  const spk = await generateSignedPreKey(identity);
  assert.equal(spk.publicKey.length, 32);
  assert.equal(spk.privateKey.length, 32);
  assert.equal(spk.signature.length, 64);

  const valid = await verifySignedPreKeySignature(
    identity,
    spk.publicKey,
    spk.signature
  );

  assert.equal(valid, true);
});
