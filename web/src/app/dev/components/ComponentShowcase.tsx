'use client';

import { useState } from 'react';
import { Alert, Badge, Button, Checkbox, Input, Select, Table, type Column } from '@/components/ui';
import { formatMoney } from '@/lib/money';
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
  { key: 'paid', header: 'Paid', cell: (r) => formatMoney(r.paidMinor, 'PKR'), numeric: true },
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
        <div className={styles.row}>
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </div>
        <div className={styles.row}>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
        <div className={styles.row}>
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
        <div className={styles.row}>
          <Badge>Neutral</Badge>
          <Badge tone="primary">Primary</Badge>
          <Badge tone="info">Info</Badge>
          <Badge tone="success">Success</Badge>
          <Badge tone="warning">Warning</Badge>
          <Badge tone="danger">Danger</Badge>
        </div>
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
        <Table caption="Recent enrollments" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />
        <Table
          caption="Empty table"
          columns={COLUMNS}
          rows={[]}
          rowKey={(r) => r.id}
          empty="No enrollments yet."
        />
      </div>
    </section>
  );
}
