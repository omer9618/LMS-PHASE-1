'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { Button, Input, Loadable, PageHeader, Pager, Table } from '@/components/ui';
import { adminApi, type AuditEntry, type AuditQuery } from '@/lib/api/admin';
import { useApi } from '@/lib/use-api';
import styles from '../Admin.module.css';
import { formatDateTime } from '../kit';

const LIMIT = 50;

/** Date input (YYYY-MM-DD) → the start or end of that day in the viewer's time zone, as ISO. */
export function dayBoundary(day: string, end: boolean): string | undefined {
  if (!z.iso.date().safeParse(day).success) return undefined;
  const date = new Date(`${day}T${end ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** #108: search the audit log by actor, action, entity and date range. */
export function AuditScreen() {
  const params = useSearchParams();
  const initial = {
    actorEmail: params.get('actorEmail') ?? '',
    action: params.get('action') ?? '',
    entityType: params.get('entityType') ?? '',
    entityId: params.get('entityId') ?? '',
    from: '',
    to: '',
  };
  const [draft, setDraft] = useState(initial);
  const [query, setQuery] = useState<AuditQuery & { offset: number }>({
    actorEmail: initial.actorEmail,
    action: initial.action,
    entityType: initial.entityType,
    entityId: initial.entityId,
    offset: 0,
  });
  const entries = useApi(`admin-audit:${JSON.stringify(query)}`, (signal) =>
    adminApi.searchAuditLog({ ...query, limit: LIMIT }, signal),
  );
  const field = (key: keyof typeof draft, label: string, extra: object = {}) => (
    <Input
      label={label}
      value={draft[key]}
      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      {...extra}
    />
  );

  return (
    <>
      <PageHeader
        eyebrow="Platform · newest first"
        title="Audit log"
        description="Every admin decision is recorded here and cannot be changed."
      />
      <form
        className={styles.filters}
        onSubmit={(e) => {
          e.preventDefault();
          setQuery({
            actorEmail: draft.actorEmail.trim(),
            action: draft.action.trim().toUpperCase(),
            entityType: draft.entityType.trim().toLowerCase(),
            entityId: draft.entityId.trim(),
            from: dayBoundary(draft.from, false),
            to: dayBoundary(draft.to, true),
            offset: 0,
          });
        }}
      >
        {field('actorEmail', 'Actor email')}
        {field('action', 'Action', { placeholder: 'COURSE_APPROVED' })}
        {field('entityType', 'Entity type', { placeholder: 'course' })}
        {field('entityId', 'Entity ID')}
        {field('from', 'From', { type: 'date' })}
        {field('to', 'To', { type: 'date' })}
        <Button type="submit" size="sm">
          Search
        </Button>
      </form>
      <Loadable state={entries} what="the audit log">
        {(page) => (
          <>
            <Table<AuditEntry>
              caption={`${page.total} entr${page.total === 1 ? 'y' : 'ies'}`}
              rows={page.items}
              rowKey={(e) => e.id}
              empty="No entries match."
              columns={[
                { key: 'when', header: 'When', cell: (e) => formatDateTime(e.createdAt) },
                { key: 'actor', header: 'Actor', cell: (e) => e.actor?.email ?? 'System' },
                {
                  key: 'action',
                  header: 'Action',
                  rowHeader: true,
                  cell: (e) => <code>{e.action}</code>,
                },
                {
                  key: 'entity',
                  header: 'Entity',
                  cell: (e) => (
                    <>
                      {e.entityType}
                      {e.entityId && <span className="muted"> {e.entityId}</span>}
                    </>
                  ),
                },
                {
                  key: 'details',
                  header: 'Details',
                  cell: (e) =>
                    e.details ? (
                      <pre className={styles.pre}>{JSON.stringify(e.details, null, 1)}</pre>
                    ) : (
                      '—'
                    ),
                },
                { key: 'ip', header: 'IP', cell: (e) => e.ipAddress ?? '—' },
              ]}
            />
            <Pager
              total={page.total}
              limit={LIMIT}
              offset={query.offset}
              onChange={(offset) => setQuery({ ...query, offset })}
            />
          </>
        )}
      </Loadable>
    </>
  );
}
