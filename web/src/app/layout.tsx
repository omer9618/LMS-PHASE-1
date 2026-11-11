import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Source_Sans_3, Source_Serif_4 } from 'next/font/google';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/chrome/SiteFooter';
import { SiteHeader } from '@/components/chrome/SiteHeader';
import { QueryProvider } from '@/lib/query';
import { SessionProvider } from '@/lib/session';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: { default: 'LMS', template: '%s · LMS' },
  description: 'Courses for Cambridge and Edexcel students, taught by independent teachers.',
};

// Self-hosted at build time; tokens.css reads the variables (--font-sans, --font-serif, --font-mono).
const sans = Source_Sans_3({ subsets: ['latin'], variable: '--font-face-sans', display: 'swap' });
const serif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-face-serif',
  display: 'swap',
});
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-face-mono', display: 'swap' });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-density="comfortable"
      className={`${sans.variable} ${serif.variable} ${mono.variable}`}
    >
      <body>
        <QueryProvider>
          <SessionProvider>
            <a className="skip-link" href="#main">
              Skip to content
            </a>
            <SiteHeader />
            <main id="main" tabIndex={-1}>
              {children}
            </main>
            <SiteFooter />
          </SessionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
