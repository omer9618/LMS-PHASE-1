'use client';

import { RouteError } from '@/components/ui/RouteError';

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return <RouteError error={error} retry={retry} backHref="/courses" backLabel="Browse courses" />;
}
