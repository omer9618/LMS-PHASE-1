import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { SessionProvider } from '@/lib/session';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: { default: 'LMS', template: '%s · LMS' },
  description: 'Courses for Cambridge and Edexcel students, taught by independent teachers.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-density="comfortable">
      <body>
        <SessionProvider>
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <SiteHeader />
          <main id="main" tabIndex={-1}>
            {children}
          </main>
        </SessionProvider>
      </body>
    </html>
  );
}
