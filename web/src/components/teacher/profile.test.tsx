import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestError } from '@/lib/api/errors';
import {
  checkLinkUrl,
  checkPhoto,
  type PublicTeacherProfile,
  type TeacherProfile,
} from '@/lib/api/profile';
import type { Me } from '@/lib/api/schemas/auth';
import { courseCard, listing } from '@/test/fixtures';
import { apiMock, resetMocks } from '@/test/mocks';
import { renderWithSession, STUDENT } from '@/test/render';
import { draftFrom, ProfileEditor, updateBody, validateDraft } from './ProfileEditor';
import { profileDescription, PublicProfile } from '../teachers/PublicProfile';

vi.mock('next/navigation', async () => (await import('@/test/mocks')).navigationMock);
vi.mock('@/lib/api/client', async () => (await import('@/test/mocks')).apiClientMock);

const TEACHER: Me = { ...STUDENT, id: 't-1', roles: ['TEACHER'] };

function profile(overrides: Partial<TeacherProfile> = {}): TeacherProfile {
  return {
    teacherId: 't-1',
    fullName: 'Omar Siddiqui',
    bio: null,
    qualifications: null,
    socialLinks: [],
    f2fLocations: [],
    photoUrl: null,
    isPublished: false,
    moderation: null,
    ...overrides,
  };
}

function renderEditor(p: TeacherProfile) {
  return renderWithSession(<ProfileEditor />, TEACHER, (path) => {
    if (path === '/teacher/profile') return p;
    throw new Error(path);
  });
}

beforeEach(() => {
  resetMocks();
});

describe('profile helpers', () => {
  it('accepts only http(s) links to real sites', () => {
    expect(checkLinkUrl('https://youtube.com/@omar')).toBeUndefined();
    expect(checkLinkUrl('http://example.org')).toBeUndefined();
    expect(checkLinkUrl('javascript:alert(1)')).toMatch(/http/);
    expect(checkLinkUrl('mailto:a@b.co')).toMatch(/http/);
    expect(checkLinkUrl('https://localhost')).toMatch(/real website/);
    expect(checkLinkUrl('youtube.com')).toMatch(/full link/);
  });

  it('checks the photo against the PROFILE_PHOTO policy', () => {
    expect(checkPhoto(new File(['x'], 'me.png', { type: 'image/png' }))).toBeUndefined();
    expect(checkPhoto(new File(['x'], 'me.gif', { type: 'image/gif' }))).toMatch(/PNG/);
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'me.jpg', { type: 'image/jpeg' });
    expect(checkPhoto(big)).toMatch(/2 MB/);
  });

  it('builds the PUT body and validates rows with the API’s paths', () => {
    const draft = draftFrom(
      profile({
        bio: ' Physics ',
        socialLinks: [{ label: 'YouTube', url: 'https://youtube.com/x' }],
        f2fLocations: [{ city: 'Lahore', area: 'Gulberg' }],
      }),
    );
    expect(updateBody(draft)).toEqual({
      bio: 'Physics',
      qualifications: null,
      socialLinks: [{ label: 'YouTube', url: 'https://youtube.com/x' }],
      f2fLocations: [{ city: 'Lahore', area: 'Gulberg' }],
    });
    expect(
      validateDraft({
        ...draft,
        links: [{ label: '', url: 'ftp://x.com' }],
        locations: [{ city: 'K', area: '', notes: '' }],
      }),
    ).toEqual({
      'socialLinks.0.label': 'Give the link a label',
      'socialLinks.0.url': 'Only http(s) links are allowed',
      'f2fLocations.0.city': 'Enter the city',
    });
  });
});

describe('ProfileEditor', () => {
  it('saves bio, links and places', async () => {
    apiMock.put.mockResolvedValue(profile({ bio: 'I teach physics.' }));
    renderEditor(profile());
    await userEvent.type(await screen.findByLabelText(/^Bio/), 'I teach physics.');
    await userEvent.click(screen.getByRole('button', { name: 'Add a link' }));
    const link = screen.getByRole('group', { name: 'Link 1' });
    await userEvent.type(within(link).getByLabelText('Label'), 'YouTube');
    await userEvent.type(within(link).getByLabelText('Address'), 'https://youtube.com/@omar');
    await userEvent.click(screen.getByRole('button', { name: 'Add a place' }));
    await userEvent.type(
      within(screen.getByRole('group', { name: 'Place 1' })).getByLabelText('City'),
      'Lahore',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText('Profile saved.')).toBeVisible();
    expect(apiMock.put).toHaveBeenCalledWith('/teacher/profile', expect.anything(), {
      bio: 'I teach physics.',
      qualifications: null,
      socialLinks: [{ label: 'YouTube', url: 'https://youtube.com/@omar' }],
      f2fLocations: [{ city: 'Lahore' }],
    });
  });

  it('refuses a non-http link before sending', async () => {
    renderEditor(profile());
    await userEvent.click(await screen.findByRole('button', { name: 'Add a link' }));
    const link = screen.getByRole('group', { name: 'Link 1' });
    await userEvent.type(within(link).getByLabelText('Label'), 'x');
    await userEvent.type(within(link).getByLabelText('Address'), 'javascript:alert(1)');
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(within(link).getByLabelText('Address')).toHaveAccessibleDescription(/http/);
    expect(apiMock.put).not.toHaveBeenCalled();
  });

  it('explains that publishing needs a bio', async () => {
    apiMock.post.mockRejectedValue(
      new RequestError('PROFILE_INCOMPLETE', { message: 'Needs more detail' }),
    );
    renderEditor(profile());
    await userEvent.click(await screen.findByRole('button', { name: 'Publish profile' }));
    expect(await screen.findByText(/Add a bio and save it before publishing/)).toBeVisible();
    expect(apiMock.post).toHaveBeenCalledWith('/teacher/profile/publish', expect.anything());
  });

  it('publishes, then links to the public page and can unpublish', async () => {
    apiMock.post.mockResolvedValueOnce(profile({ bio: 'x', isPublished: true }));
    renderEditor(profile({ bio: 'x' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Publish profile' }));
    expect(await screen.findByRole('link', { name: 'View your public page' })).toHaveAttribute(
      'href',
      '/teachers/t-1',
    );
    apiMock.post.mockResolvedValueOnce(profile({ bio: 'x' }));
    await userEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenLastCalledWith(
        '/teacher/profile/unpublish',
        expect.anything(),
      ),
    );
  });

  it('shows the admin’s unpublish reason', async () => {
    renderEditor(
      profile({
        bio: 'x',
        moderation: { unpublishedAt: '2026-11-05T00:00:00Z', reason: 'Remove the phone number.' },
      }),
    );
    expect(await screen.findByText(/Reason: Remove the phone number\./)).toBeVisible();
  });

  it('uploads a photo as multipart', async () => {
    apiMock.postForm.mockResolvedValue(profile({ photoUrl: 'https://files.example/p.png' }));
    renderEditor(profile());
    await userEvent.upload(
      await screen.findByLabelText(/^Upload a photo/),
      new File(['x'], 'me.png', { type: 'image/png' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByAltText('Your profile photo')).toHaveAttribute(
      'src',
      'https://files.example/p.png',
    );
    const [path, , form] = apiMock.postForm.mock.calls[0] as [string, unknown, FormData];
    expect(path).toBe('/teacher/profile/photo');
    expect((form.get('photo') as File).name).toBe('me.png');
  });
});

const PUBLIC: PublicTeacherProfile = {
  teacherId: 't-1',
  fullName: 'Omar Siddiqui',
  bio: 'Ten years teaching A Level physics.\nExam focused.',
  qualifications: 'MSc Physics',
  socialLinks: [{ label: 'YouTube', url: 'https://youtube.com/@omar' }],
  f2fLocations: [{ city: 'Lahore', area: 'Gulberg', notes: 'Weekends' }],
  photoUrl: 'https://files.example/p.png',
  courses: listing([courseCard()]),
};

describe('PublicProfile', () => {
  it('shows the teacher, places, safe links and course cards', () => {
    render(<PublicProfile profile={PUBLIC} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Omar Siddiqui' })).toBeVisible();
    expect(screen.getByAltText('Photo of Omar Siddiqui')).toBeVisible();
    expect(screen.getByText('Lahore · Gulberg')).toBeVisible();
    const link = screen.getByRole('link', { name: /YouTube/ });
    expect(link).toHaveAttribute('href', 'https://youtube.com/@omar');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('nofollow');
    expect(screen.getByRole('heading', { name: 'Courses (1)' })).toBeVisible();
    expect(screen.getByRole('link', { name: courseCard().title })).toHaveAttribute(
      'href',
      `/courses/${courseCard().id}`,
    );
  });

  it('has an empty course state', () => {
    render(<PublicProfile profile={{ ...PUBLIC, courses: listing([]) }} />);
    expect(screen.getByText('No published courses yet.')).toBeVisible();
  });

  it('summarises the bio for meta tags', () => {
    expect(profileDescription(PUBLIC)).toBe('Ten years teaching A Level physics. Exam focused.');
    expect(profileDescription({ ...PUBLIC, bio: 'x'.repeat(300) })).toHaveLength(158);
    expect(profileDescription({ ...PUBLIC, bio: null, qualifications: null })).toBe(
      'Courses by Omar Siddiqui.',
    );
  });
});
