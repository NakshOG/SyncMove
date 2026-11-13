import { describe, expect, it } from 'vitest';

import {
  generateKeyPair,
  generateSignedPreKey,
  verifySignedPreKeySignature,
} from '../lib/e2ee/x3dh.ts';

describe('X3DH crypto', () => {
  it('includes real signing material and validates signed prekeys', async () => {
    const identity = await generateKeyPair();

    expect(identity.publicKey).toHaveLength(32);
    expect(identity.privateKey).toHaveLength(32);
    expect(identity.signingPublicKey).toBeTruthy();
    expect(identity.signingPrivateKey).toBeTruthy();
    expect(identity.signingPublicKey).toHaveLength(32);
    expect(identity.signingPrivateKey).toHaveLength(32);

    const spk = await generateSignedPreKey(identity);
    expect(spk.publicKey).toHaveLength(32);
    expect(spk.privateKey).toHaveLength(32);
    expect(spk.signature).toHaveLength(64);

    const valid = await verifySignedPreKeySignature(
      identity,
      spk.publicKey,
      spk.signature,
    );

    expect(valid).toBe(true);
  });
});
