'use client';

import { useState } from 'react';
import { Button, type ButtonProps } from '@/components/ui';
import { authApi } from '@/lib/api/auth';
import { errorMessage } from '@/lib/api/errors';
import styles from '@/components/forms/Form.module.css';

/** POST /auth/verify-email/resend for the signed-in user, with its outcome announced. */
export function ResendVerificationButton(props: Pick<ButtonProps, 'variant' | 'size'>) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | { error: string }>('idle');

  async function resend() {
    setState('sending');
    try {
      const result = await authApi.resendVerification();
      setState(result.sent ? 'sent' : { error: 'Your email address is already verified.' });
    } catch (error) {
      setState({ error: errorMessage(error) });
    }
  }

  return (
    <span className={styles.inlineStatus}>
      <Button
        variant={props.variant ?? 'secondary'}
        size={props.size}
        loading={state === 'sending'}
        loadingText="Sending…"
        disabled={state === 'sent'}
        onClick={() => void resend()}
      >
        {state === 'sent' ? 'Link sent' : 'Send a new link'}
      </Button>
      <span role="status">
        {state === 'sent' && 'Check your inbox for the new link.'}
        {typeof state === 'object' && state.error}
      </span>
    </span>
  );
}
