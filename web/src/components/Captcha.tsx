'use client';

import { useEffect, useRef } from 'react';

/**
 * The human check for public forms (#18). With NEXT_PUBLIC_TURNSTILE_SITE_KEY set it renders
 * Cloudflare Turnstile and reports its token; without it (development, CAPTCHA_PROVIDER=disabled in
 * the API) it reports a placeholder token that the API's disabled verifier accepts.
 */
export const DEV_CAPTCHA_TOKEN = 'dev-captcha-disabled';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render(
    el: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load the captcha'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function Captcha({
  onToken,
  siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
}: {
  /** Called with a token when solved, and with null when it expires or fails. */
  onToken: (token: string | null) => void;
  siteKey?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  useEffect(() => {
    callback.current = onToken;
  });

  useEffect(() => {
    if (!siteKey) {
      callback.current(DEV_CAPTCHA_TOKEN);
      return;
    }
    let widgetId: string | null = null;
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetId = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: (token) => callback.current(token),
          'expired-callback': () => callback.current(null),
          'error-callback': () => callback.current(null),
        });
      })
      .catch(() => callback.current(null));
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  if (!siteKey) {
    return (
      <p className="muted" data-testid="captcha-disabled">
        Human check disabled in this environment.
      </p>
    );
  }
  return <div ref={ref} />;
}
