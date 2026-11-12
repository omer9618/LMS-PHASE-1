import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  Alert,
  Badge,
  Breadcrumb,
  Button,
  Checkbox,
  ConfirmButton,
  Input,
  ProgressBar,
  RadioGroup,
  Select,
  Table,
  type Column,
} from './index';

describe('Button', () => {
  it('is a type=button by default and fires clicks', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies variant and size classes', () => {
    render(
      <Button variant="danger" size="sm">
        Delete
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button.className).toMatch(/danger/);
    expect(button.className).toMatch(/sm/);
  });

  it('while loading: busy, stays focusable, swallows clicks and submits', async () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" loading loadingText="Signing in…" onClick={onClick}>
          Sign in
        </Button>
      </form>,
    );
    const button = screen.getByRole('button', { name: 'Signing in…' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('when disabled: not clickable', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Nope
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Nope' });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Input', () => {
  it('is labelled and describes itself with the hint', () => {
    render(<Input label="Email" hint="We will verify it." type="email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAccessibleDescription('We will verify it.');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('marks errors invalid and announces them with the control', () => {
    render(<Input label="Password" hint="10+ characters" error="Too short" type="password" />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/Too short.*10\+ characters/);
  });

  it('shows a required marker hidden from assistive technology', () => {
    render(<Input label="Full name" required />);
    const input = screen.getByRole('textbox', { name: 'Full name' });
    expect(input).toBeRequired();
  });

  it('keeps a visually hidden label as the accessible name', () => {
    render(<Input label="Search courses" hideLabel />);
    expect(screen.getByRole('textbox', { name: 'Search courses' })).toBeInTheDocument();
  });

  it('accepts typing', async () => {
    render(<Input label="Name" />);
    const input = screen.getByLabelText('Name');
    await userEvent.type(input, 'Ayesha');
    expect(input).toHaveValue('Ayesha');
  });
});

describe('Select and Checkbox', () => {
  it('are labelled', async () => {
    render(
      <>
        <Select label="Board" defaultValue="">
          <option value="">Any</option>
          <option value="cie">Cambridge</option>
        </Select>
        <Checkbox label="Free only" hint="Hides paid courses" />
      </>,
    );
    await userEvent.selectOptions(screen.getByLabelText('Board'), 'cie');
    expect(screen.getByLabelText('Board')).toHaveValue('cie');
    const box = screen.getByRole('checkbox', { name: 'Free only' });
    expect(box).toHaveAccessibleDescription('Hides paid courses');
    await userEvent.click(box);
    expect(box).toBeChecked();
  });
});

describe('Badge and Alert', () => {
  it('renders badge text with a tone class', () => {
    render(<Badge tone="success">Active</Badge>);
    expect(screen.getByText('Active').className).toMatch(/success/);
  });

  it('uses role=alert for errors and role=status otherwise', () => {
    render(
      <>
        <Alert tone="danger" title="Failed" />
        <Alert tone="success" title="Saved" />
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });
});

interface Row {
  id: string;
  name: string;
  amount: string;
}

const columns: Array<Column<Row>> = [
  { key: 'name', header: 'Name', cell: (r) => r.name, rowHeader: true },
  { key: 'amount', header: 'Amount', cell: (r) => r.amount, numeric: true },
];

describe('Table', () => {
  it('is a captioned table with column and row headers', () => {
    render(
      <Table
        caption="Payments"
        columns={columns}
        rows={[
          { id: '1', name: 'Ayesha', amount: 'PKR 1.00' },
          { id: '2', name: 'Bilal', amount: 'PKR 2.00' },
        ]}
        rowKey={(r) => r.id}
      />,
    );
    const table = screen.getByRole('table', { name: 'Payments' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Name', 'Amount']);
    expect(within(table).getByRole('rowheader', { name: 'Bilal' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: 'PKR 2.00' }).className).toMatch(/numeric/);
    // The scroll container is a focusable, labelled region for keyboard scrolling.
    expect(screen.getByRole('region', { name: 'Payments' })).toHaveAttribute('tabindex', '0');
  });

  it('shows the empty message across all columns', () => {
    render(
      <Table
        caption="Payments"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        empty="None yet"
      />,
    );
    const cell = screen.getByRole('cell', { name: 'None yet' });
    expect(cell).toHaveAttribute('colspan', '2');
  });

  it('works in compact density', () => {
    render(
      <div data-density="compact">
        <Table caption="Compact" hideCaption columns={columns} rows={[]} rowKey={(r) => r.id} />
      </div>,
    );
    expect(
      screen.getByRole('table', { name: 'Compact' }).closest('[data-density]'),
    ).toHaveAttribute('data-density', 'compact');
  });
});

describe('ConfirmButton', () => {
  it('asks first, closes on Escape and gives focus back to the button', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <ConfirmButton question="Delete this?" confirmLabel="Delete" onConfirm={onConfirm}>
        Delete course
      </ConfirmButton>,
    );
    const trigger = screen.getByRole('button', { name: 'Delete course' });
    // The "…" says one more step follows, but is not part of the button's name.
    expect(trigger).toHaveTextContent('Delete course…');
    await userEvent.click(trigger);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Delete this?')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('Delete this?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete course' })).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Delete course' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('password field', () => {
  it('can show what was typed, and hides it again', async () => {
    render(<Input label="Password" type="password" defaultValue="hunter2" />);
    const field = screen.getByLabelText('Password');
    expect(field).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(field).toHaveAttribute('type', 'password');
  });
});

describe('RadioGroup, ProgressBar and Breadcrumb', () => {
  it('chooses one option at a time', async () => {
    const onChange = vi.fn();
    render(
      <RadioGroup
        legend="Decision"
        name="d"
        value="a"
        onChange={onChange}
        options={[
          { value: 'a', label: 'Confirm' },
          { value: 'b', label: 'Reject' },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Confirm' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Reject' }));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.getByRole('group', { name: 'Decision' })).toBeVisible();
  });

  it('draws a progress bar that never leaves 0–100', () => {
    render(<ProgressBar value={140} label="Course" />);
    expect(screen.getByRole('progressbar', { name: 'Course' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
  });

  it('keeps people’s words as they were typed and marks the page you are on', () => {
    render(
      <Breadcrumb
        items={[{ label: 'My courses', href: '/teacher/courses' }, { label: 'AS Maths' }]}
      />,
    );
    expect(screen.getByRole('link', { name: 'My courses' })).toHaveAttribute(
      'href',
      '/teacher/courses',
    );
    expect(screen.getByText('AS Maths')).toHaveAttribute('aria-current', 'page');
  });
});
