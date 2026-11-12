'use client';

import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Facts,
  Icon,
  Input,
  Money,
  PageHeader,
  Section,
  Select,
  StatGrid,
  StatTile,
  StatusBadge,
  Table,
  type Column,
} from '@/components/ui';
import styles from './showcase.module.css';

interface SampleRow {
  id: string;
  student: string;
  course: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  paidMinor: string;
}

const ROWS: SampleRow[] = [
  {
    id: '1',
    student: 'Ayesha Khan',
    course: 'A Level Physics',
    status: 'ACTIVE',
    paidMinor: '1500000',
  },
  {
    id: '2',
    student: 'Bilal Ahmed',
    course: 'IGCSE Chemistry',
    status: 'EXPIRED',
    paidMinor: '850050',
  },
  { id: '3', student: 'Sara Malik', course: 'O Level Maths', status: 'REVOKED', paidMinor: '0' },
];

const STATUS_TONE = { ACTIVE: 'success', EXPIRED: 'warning', REVOKED: 'danger' } as const;

const COLUMNS: Array<Column<SampleRow>> = [
  { key: 'student', header: 'Student', cell: (r) => r.student, rowHeader: true },
  { key: 'course', header: 'Course', cell: (r) => r.course },
  {
    key: 'status',
    header: 'Status',
    cell: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status.toLowerCase()}</Badge>,
  },
  {
    key: 'paid',
    header: 'Paid',
    cell: (r) => <Money minor={r.paidMinor} currency={'PKR'} />,
    numeric: true,
  },
];

export function ComponentShowcase({ density }: { density: 'comfortable' | 'compact' }) {
  const [loading, setLoading] = useState(false);
  const heading =
    density === 'comfortable' ? 'Comfortable (students, teachers)' : 'Compact (admin)';
  const id = `showcase-${density}`;

  return (
    <section data-density={density} className={styles.section} aria-labelledby={id}>
      <h2 id={id}>{heading}</h2>

      <div className={styles.group}>
        <h3>Buttons</h3>
        <div className="cluster">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </div>
        <div className="cluster">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
        <div className="cluster">
          <Button
            loading={loading}
            loadingText="Saving…"
            onClick={() => {
              setLoading(true);
              window.setTimeout(() => setLoading(false), 1500);
            }}
          >
            Click to load
          </Button>
          <Button disabled>Disabled</Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
        </div>
      </div>

      <div className={styles.group}>
        <h3>Inputs</h3>
        <div className={styles.grid}>
          <Input label="Full name" required autoComplete="name" />
          <Input label="Email" type="email" hint="We send a verification link here." />
          <Input label="Password" type="password" error="Password must be at least 10 characters" />
          <Input label="Disabled" disabled defaultValue="Read only value" />
          <Select label="Board" defaultValue="">
            <option value="">Any board</option>
            <option value="cie">Cambridge</option>
            <option value="edx">Edexcel</option>
          </Select>
          <Checkbox label="Free courses only" hint="Hides paid courses." />
        </div>
      </div>

      <div className={styles.group}>
        <h3>Badges</h3>
        <div className="cluster">
          <Badge>Neutral</Badge>
          <Badge tone="primary">Primary</Badge>
          <Badge tone="info">Info</Badge>
          <Badge tone="success">Success</Badge>
          <Badge tone="warning">Warning</Badge>
          <Badge tone="danger">Danger</Badge>
          <Badge tone="highlight">7</Badge>
          <StatusBadge status="PENDING_APPROVAL" />
        </div>
      </div>

      <div className={styles.group}>
        <h3>Statuses</h3>
        <div className="cluster">
          {[
            'DRAFT',
            'PENDING_APPROVAL',
            'PUBLISHED',
            'REJECTED',
            'ARCHIVED',
            'PENDING',
            'PROOF_SUBMITTED',
            'VERIFIED',
            'LAPSED',
            'REFUNDED',
          ].map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <h3>Icons</h3>
        <div className="cluster">
          {(
            [
              'check',
              'cross',
              'alert',
              'lock',
              'circle',
              'clock',
              'play',
              'arrowLeft',
              'arrowRight',
              'arrowUp',
              'arrowDown',
              'chevronUp',
              'chevronDown',
            ] as const
          ).map((n) => (
            <span key={n} className="mono">
              <Icon name={n} size={20} /> {n}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <h3>Page header, stats and facts</h3>
        <PageHeader
          eyebrow="Orders · proof submitted · oldest first"
          title="Payment verification"
          description="Match each transfer by transaction ID and amount before confirming."
          actions={<Button size="sm">Export</Button>}
        />
        <StatGrid label="Queue">
          <StatTile label="In queue" value="7" />
          <StatTile label="Balance owed" value="48,960.00" tone="primary" />
          <StatTile label="Need a second look" value="2" tone="warning" />
          <StatTile label="Past 48h" value="1" tone="danger" />
        </StatGrid>
        <Section
          title="Order"
          actions={
            <Button size="sm" variant="ghost">
              Open
            </Button>
          }
        >
          <Facts
            items={[
              [
                'Reference',
                <span key="ref" className="mono">
                  LMS-Q4HN-2BZE
                </span>,
              ],
              ['Total', <Money key="total" minor="320000" currency="PKR" />],
              ['Txn ID', null],
            ]}
          />
        </Section>
      </div>

      <div className={styles.group}>
        <h3>Alerts</h3>
        <Alert tone="info" title="Heads up">
          Informational message.
        </Alert>
        <Alert tone="danger" title="Could not save">
          Error message with role=&quot;alert&quot;.
        </Alert>
      </div>

      <div className={styles.group}>
        <h3>Table</h3>
        <Table caption="Recent enrolments" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />
        <Table
          caption="Empty table"
          columns={COLUMNS}
          rows={[]}
          rowKey={(r) => r.id}
          empty="No enrolments yet."
        />
      </div>
    </section>
  );
}
