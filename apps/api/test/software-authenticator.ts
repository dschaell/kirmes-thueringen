/**
 * Software-Authenticator für Tests: erzeugt echte WebAuthn-Antworten (ES256, Attestation „none“),
 * so wie ein Gerät mit Face ID / Touch ID sie liefern würde – nur ohne Gerät.
 */
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';

const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest();
const zaehlerBytes = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};

export class SoftwareAuthenticator {
  readonly schluessel = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  readonly credentialId = randomBytes(32);
  zaehler = 0;

  constructor(
    readonly origin: string,
    readonly rpId = new URL(origin).hostname,
  ) {}

  get id() {
    return b64u(this.credentialId);
  }

  private clientData(type: string, challenge: string, origin: string) {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }

  registriere(challenge: string, { origin = this.origin, transports = ['internal'] } = {}) {
    const jwk = this.schluessel.publicKey.export({ format: 'jwk' });
    const cose = isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2], // kty: EC2
        [3, -7], // alg: ES256
        [-1, 1], // crv: P-256
        [-2, Buffer.from(jwk.x!, 'base64url')],
        [-3, Buffer.from(jwk.y!, 'base64url')],
      ]),
    );
    const laenge = Buffer.alloc(2);
    laenge.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([
      sha256(this.rpId),
      Buffer.from([0x45]), // UP | UV | AT
      zaehlerBytes(0),
      Buffer.alloc(16), // AAGUID
      laenge,
      this.credentialId,
      cose,
    ]);
    const attestation = isoCBOR.encode(
      new Map<string, unknown>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', new Uint8Array(authData)],
      ]) as never,
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: {
        clientDataJSON: b64u(this.clientData('webauthn.create', challenge, origin)),
        attestationObject: b64u(attestation),
        ...(transports.length > 0 && { transports }),
      },
      clientExtensionResults: {},
    };
  }

  melde(challenge: string, { origin = this.origin, verifiziert = true, zaehler = 0 } = {}) {
    this.zaehler = zaehler;
    const authData = Buffer.concat([
      sha256(this.rpId),
      Buffer.from([verifiziert ? 0x05 : 0x01]), // UP (+ UV)
      zaehlerBytes(zaehler),
    ]);
    const clientData = this.clientData('webauthn.get', challenge, origin);
    const signatur = sign(
      'sha256',
      Buffer.concat([authData, sha256(clientData)]),
      this.schluessel.privateKey,
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: {
        clientDataJSON: b64u(clientData),
        authenticatorData: b64u(authData),
        signature: b64u(signatur),
      },
      clientExtensionResults: {},
    };
  }
}
