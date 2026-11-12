import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestError } from '@/lib/api/errors';
import type { AccountSession } from '@/lib/api/schemas/auth';
import { apiMock, resetMocks } from '@/test/mocks';
import { renderWithSession, STUDENT } from '@/test/render';
import { AccountSettings } from './AccountSettings';

vi.mock('next/navigation', async () => (await import('@/test/mocks')).navigationMock);
vi.mock('@/lib/api/client', async () => (await import('@/test/mocks')).apiClientMock);

const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';

const DEVICES: AccountSession[] = [
  {
    id: 's-1',
    createdAt: '2026-11-01T10:00:00Z',
    lastSeenAt: '2026-11-11T09:00:00Z',
    ipAddress: '10.0.0.1',
    userAgent: CHROME,
    current: true,
  },
  {
    id: 's-2',
    createdAt: '2026-11-02T10:00:00Z',
    lastSeenAt: '2026-11-10T09:00:00Z',
    ipAddress: '10.0.0.2',
    userAgent: IPHONE,
    current: false,
  },
];

function renderAccount(devices: AccountSession[] = DEVICES) {
  return renderWithSession(<AccountSettings />, STUDENT, (path) => {
    if (path === '/account/sessions') return devices;
    throw new Error(`unexpected GET ${path}`);
  });
}

beforeEach(() => {
  resetMocks();
});

describe('AccountSettings', () => {
  it('asks a visitor to sign in', async () => {
    renderWithSession(<AccountSettings />);
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?next=/account',
    );
  });

  it('saves a new name and refreshes the session', async () => {
    apiMock.patch.mockResolvedValue({ ...STUDENT, fullName: 'Ayesha K.' });
    renderAccount();
    const form = await screen.findByRole('form', { name: 'Name' });
    expect(within(form).getByLabelText(/^Email/)).toHaveAttribute('readonly');
    const name = within(form).getByLabelText(/^Full name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Ayesha K.');
    await userEvent.click(within(form).getByRole('button', { name: 'Save name' }));
    await waitFor(() =>
      expect(apiMock.patch).toHaveBeenCalledWith('/account/profile', expect.anything(), {
        fullName: 'Ayesha K.',
      }),
    );
    expect(await screen.findByText('Name saved.')).toBeVisible();
  });

  it('checks the password form before sending anything', async () => {
    renderAccount();
    const form = await screen.findByRole('form', { name: 'Change password' });
    await userEvent.click(within(form).getByRole('button', { name: 'Change password' }));
    expect(await within(form).findByText('Enter your current password')).toBeVisible();

    await userEvent.type(within(form).getByLabelText(/^Current password/), 'old passphrase 1');
    await userEvent.type(within(form).getByLabelText(/^New password/), 'short');
    await userEvent.type(within(form).getByLabelText(/^Confirm new password/), 'different');
    await userEvent.click(within(form).getByRole('button', { name: 'Change password' }));
    expect(await within(form).findByText(/Use at least 10 characters/)).toBeVisible();
    expect(within(form).getByText('The passwords do not match')).toBeVisible();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('refuses reusing the current password without asking the server', async () => {
    renderAccount();
    const form = await screen.findByRole('form', { name: 'Change password' });
    await userEvent.type(within(form).getByLabelText(/^Current password/), 'same passphrase 1');
    await userEvent.type(within(form).getByLabelText(/^New password/), 'same passphrase 1');
    await userEvent.type(within(form).getByLabelText(/^Confirm new password/), 'same passphrase 1');
    await userEvent.click(within(form).getByRole('button', { name: 'Change password' }));
    expect(await within(form).findByText(/not already using/)).toBeVisible();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('changes the password, clears the boxes and says how many devices were signed out', async () => {
    apiMock.post.mockResolvedValue({ changed: true, otherSessionsEnded: 2 });
    renderAccount();
    const form = await screen.findByRole('form', { name: 'Change password' });
    await userEvent.type(within(form).getByLabelText(/^Current password/), 'old passphrase 1');
    await userEvent.type(within(form).getByLabelText(/^New password/), 'new passphrase 2');
    await userEvent.type(within(form).getByLabelText(/^Confirm new password/), 'new passphrase 2');
    await userEvent.click(within(form).getByRole('button', { name: 'Change password' }));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/account/password', expect.anything(), {
        currentPassword: 'old passphrase 1',
        newPassword: 'new passphrase 2',
      }),
    );
    expect(await screen.findByText(/2 other devices were signed out/)).toBeVisible();
    expect(within(form).getByLabelText(/^Current password/)).toHaveValue('');
  });

  it('shows the server’s message when the current password is wrong', async () => {
    apiMock.post.mockRejectedValue(
      new RequestError('VALIDATION_FAILED', {
        message: 'Request validation failed',
        status: 400,
        info: {
          location: 'body',
          issues: [
            {
              path: 'currentPassword',
              code: 'custom',
              message: 'Your current password is not correct',
            },
          ],
        },
      }),
    );
    renderAccount();
    const form = await screen.findByRole('form', { name: 'Change password' });
    await userEvent.type(within(form).getByLabelText(/^Current password/), 'wrong passphrase');
    await userEvent.type(within(form).getByLabelText(/^New password/), 'new passphrase 2');
    await userEvent.type(within(form).getByLabelText(/^Confirm new password/), 'new passphrase 2');
    await userEvent.click(within(form).getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Your current password is not correct')).toBeVisible();
  });

  it('lists the devices, marks this one, and can only sign out the others', async () => {
    renderAccount();
    const list = await screen.findByRole('list');
    expect(within(list).getByText('Chrome on Windows')).toBeVisible();
    expect(within(list).getByText('This device')).toBeVisible();
    expect(within(list).getByText('Safari on iOS')).toBeVisible();
    expect(within(list).getAllByRole('button', { name: /^Sign out/ })).toHaveLength(1);
  });

  it('signs one device out, then reloads the list', async () => {
    apiMock.delete.mockResolvedValue({ ended: true });
    renderAccount();
    await userEvent.click(await screen.findByRole('button', { name: /^Sign out Safari on iOS/ }));
    await waitFor(() =>
      expect(apiMock.delete).toHaveBeenCalledWith('/account/sessions/s-2', expect.anything()),
    );
    expect(await screen.findByText('Signed out.')).toBeVisible();
  });

  it('signs out every other device, and offers it only when there are others', async () => {
    apiMock.post.mockResolvedValue({ ended: 1 });
    renderAccount();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign out all other devices' }),
    );
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(
        '/account/sessions/sign-out-others',
        expect.anything(),
      ),
    );
  });

  it('has no sign-out-all button when this is the only device', async () => {
    renderAccount([DEVICES[0]!]);
    await screen.findByText('Chrome on Windows');
    expect(screen.queryByRole('button', { name: 'Sign out all other devices' })).toBeNull();
  });
});
