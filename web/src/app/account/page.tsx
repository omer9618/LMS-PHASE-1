import type { Metadata } from 'next';
import { AccountSettings } from '@/components/account/AccountSettings';

export const metadata: Metadata = { title: 'Your account', robots: { index: false } };

export default function AccountPage() {
  return <AccountSettings />;
}
