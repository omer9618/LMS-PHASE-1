import type { ReactNode } from 'react';
import { ButtonLink } from './Button';

/**
 * (Both gates are a plain `stack`: the route's own `.page` wrapper frames them, so they sit exactly
 * where the page they stand in for would.)
 *
 * One screen for "this page needs you to sign in". Every protected area uses it, so a guest sees
 * the same words and the same button wherever they land, and sign-in brings them back here.
 */
export function SignInGate({
  next,
  children = 'Sign in to see this page.',
  title = 'Sign in to continue',
}: {
  /** Where to go after signing in: a same-site path. */
  next: string;
  children?: ReactNode;
  title?: string;
}) {
  return (
    <div className="stack">
      <h1>{title}</h1>
      <p>{children}</p>
      <p>
        <ButtonLink href={`/login?next=${encodeURIComponent(next).replace(/%2F/gi, '/')}`}>
          Sign in
        </ButtonLink>
      </p>
    </div>
  );
}

/** The page for a signed-in person who is not allowed here: what it is, and a way out. */
export function Forbidden({
  title = 'You don’t have access to this area',
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="stack">
      <h1>{title}</h1>
      <p>{children}</p>
      <div className="cluster">
        {actions ?? <ButtonLink href="/dashboard">Go to My learning</ButtonLink>}
      </div>
    </div>
  );
}
