'use client';

import { useState } from 'react';
import { Button, type ButtonProps } from '@/components/ui';
import { authApi } from '@/lib/api/auth';
import { useMutation } from '@/lib/use-mutation';
import styles from '@/components/ui/Form.module.css';

/** POST /auth/verify-email/resend for the signed-in user, with its outcome announced. */
export function ResendVerificationButton(props: Pick<ButtonProps, 'variant' | 'size'>) {
  const send = useMutation();
  const [state, setState] = useState<'idle' | 'sent' | 'already'>('idle');

  async function resend() {
    await send.run(async () => {
      const result = await authApi.resendVerification();
      setState(result.sent ? 'sent' : 'already');
    });
  }

  return (
    <span className={styles.inlineStatus}>
      <Button
        variant={props.variant ?? 'secondary'}
        size={props.size}
        loading={send.pending}
        loadingText="Sending…"
        disabled={state === 'sent'}
        onClick={() => void resend()}
      >
        {state === 'sent' ? 'Link sent' : 'Send a new link'}
      </Button>
      <span role="status">
        {state === 'sent' && 'Check your inbox for the new link.'}
        {state === 'already' && 'Your email address is already verified.'}
        {send.error}
      </span>
    </span>
  );
}
