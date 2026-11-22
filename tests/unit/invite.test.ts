import { describe, expect, it } from 'vitest';
import { checkNewPassword, parseInviteHash } from '../../src/invite/invite';
import { inviteLinkFromReset, isEmail } from '../../functions/src/invite';

describe('invite link', () => {
  it('reads the code only from a proper #invite= address', () => {
    expect(parseInviteHash('#invite=abcDEF0123-_xyz')).toBe('abcDEF0123-_xyz');
    expect(parseInviteHash('#invite=short')).toBeNull();
    expect(parseInviteHash('#other=abcDEF0123-_xyz')).toBeNull();
    expect(parseInviteHash('')).toBeNull();
    expect(parseInviteHash('#invite=<script>alert(1)</script>')).toBeNull();
  });
  it('makes our own link with the code after a #', () => {
    const link = inviteLinkFromReset('https://x.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=AbC123_-xyz&apiKey=k', 'https://chat.example.com/');
    expect(link).toBe('https://chat.example.com/#invite=AbC123_-xyz');
    expect(() => inviteLinkFromReset('https://x.firebaseapp.com/action?mode=resetPassword', 'https://a.b')).toThrow();
  });
  it('checks email addresses', () => {
    expect(isEmail('her@example.com')).toBe(true);
    expect(isEmail('not an email')).toBe(false);
    expect(isEmail('a@b')).toBe(false);
  });
});

describe('choosing a password', () => {
  it('needs 12 characters and a matching retry', () => {
    expect(checkNewPassword('short', 'short')).toMatch(/at least 12/);
    expect(checkNewPassword('long-enough-pass', 'long-enough-pasX')).toMatch(/do not match/);
    expect(checkNewPassword('long-enough-pass', 'long-enough-pass')).toBeNull();
  });
});
