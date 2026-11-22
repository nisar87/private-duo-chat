import type { Sealed } from './crypto/secretbox';

export interface UserDoc {
  uid: string;
  displayName: string;
  publicKey: string;
  wrappedPrivateKey: string;
  wrapNonce: string;
  kdfSalt: string;
  kdfIterations: number;
  keyVersion: number;
  verifiedPeer?: Sealed;
  quickCodeEnc?: Sealed;
  lastReadAtMs?: number;
}

/** An encrypted message exactly as stored. Nothing here is readable. */
export interface RawMessage {
  id: string;
  senderUid: string;
  ciphertext: string;
  nonce: string;
  keyVersion: string;
  createdAtMs: number;
  expireAtMs: number;
  pending: boolean;
}

export type PeerStatus = 'none' | 'unverified' | 'verified' | 'changed';

export type Phase =
  | 'configError'
  | 'booting'
  | 'signedOut'
  | 'forbidden'
  | 'needSetup'
  | 'needPassphrase'
  | 'needQuickCode'
  | 'offerQuickCode'
  | 'unlocked';
