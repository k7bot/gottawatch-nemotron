export * from '@gottawatch/client/logic';

/** Session update after a sign-in email is verified on the Me tab (keeps it across tab switches). */
export function withSavedEmail<S extends { k: string }>(s: S, email: string): S {
  if (s.k !== 'ready') return s;
  const r = s as S & { me: { email?: string } };
  return { ...r, me: { ...r.me, email } };
}

/** Signed-out welcome copy (ux-design §signed-out). Never names a person. */
export function signedOutCopy(o: { emailOn: boolean; invalid: boolean }) {
  return {
    title: 'Gottawatch',
    value: "The shows and movies your friends say you've gotta watch, waiting on your TV.",
    notice: o.invalid ? "That link doesn't work anymore. Ask the person who sent it for a new one." : null,
    linkLine: o.emailOn ? 'Have an invite or private link? Just open it.' : 'Open the Gottawatch link you were sent. It signs you in on this phone.',
  };
}
