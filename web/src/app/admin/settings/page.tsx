import type { Metadata } from 'next';
import { SettingsScreen } from '@/components/admin/screens/SettingsScreen';

export const metadata: Metadata = { title: 'Platform settings' };

export default function PlatformSettingsPage() {
  return <SettingsScreen />;
}
