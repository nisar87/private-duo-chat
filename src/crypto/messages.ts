import { Bytes, fromUtf8, utf8, wipe } from './encoding';
import { open, seal, Sealed } from './secretbox';

export const MAX_MESSAGE_CHARS = 4000;
/** Firestore rules reject ciphertext of 20000 characters or more. */
export const MAX_CIPHERTEXT_B64 = 19000;
const PAD_TO = 64;

export interface MessageContext {
  chatId: string;
  senderUid: string;
  messageId: string;
}

export class MessageTooLongError extends Error {
  constructor() {
    super('Message is too long');
    this.name = 'MessageTooLongError';
  }
}

/** Ties a ciphertext to its chat, sender and message id so it cannot be moved or replayed. */
export function messageAad(ctx: MessageContext): string {
  return `pdc/msg/v1|${ctx.chatId}|${ctx.senderUid}|${ctx.messageId}`;
}

/** [4-byte length][JSON][zero padding up to a multiple of 64 bytes] */
export function frame(text: string): Bytes {
  const json = utf8(JSON.stringify({ v: 1, t: text }));
  const total = Math.ceil((4 + json.length) / PAD_TO) * PAD_TO;
  const out = new Uint8Array(new ArrayBuffer(total));
  new DataView(out.buffer).setUint32(0, json.length, false);
  out.set(json, 4);
  return out;
}

export function unframe(buf: Uint8Array): string {
  if (buf.length < 4) throw new Error('Bad frame');
  const len = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(0, false);
  if (len > buf.length - 4) throw new Error('Bad frame');
  const parsed: unknown = JSON.parse(fromUtf8(buf.subarray(4, 4 + len)));
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as { v?: unknown }).v !== 1 ||
    typeof (parsed as { t?: unknown }).t !== 'string'
  ) {
    throw new Error('Bad message');
  }
  return (parsed as { t: string }).t;
}

export async function encryptMessage(
  key: CryptoKey,
  text: string,
  ctx: MessageContext,
): Promise<Sealed> {
  if (text.length > MAX_MESSAGE_CHARS) throw new MessageTooLongError();
  const framed = frame(text);
  try {
    const sealed = await seal(key, framed, messageAad(ctx));
    if (sealed.ct.length > MAX_CIPHERTEXT_B64) throw new MessageTooLongError();
    return sealed;
  } finally {
    wipe(framed);
  }
}

/** Throws DecryptError if the message was altered, moved, or encrypted with another key. */
export async function decryptMessage(
  key: CryptoKey,
  sealed: Sealed,
  ctx: MessageContext,
): Promise<string> {
  const buf = await open(key, sealed, messageAad(ctx));
  try {
    return unframe(buf);
  } finally {
    wipe(buf);
  }
}
