import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { BOARD_ID, courseCard, LEVEL_ID, listing, SUBJECT_ID } from '@/test/fixtures';
import { apiMock, resetMocks, router, setSearch } from '@/test/mocks';
import { renderWithSession } from '@/test/render';
import { CatalogueBrowser } from './CatalogueBrowser';
import * as catalogueSchema from '@/lib/api/schemas/catalogue';

vi.mock('next/navigation', async () => (await import('@/test/mocks')).navigationMock);
vi.mock('@/lib/api/client', async () => (await import('@/test/mocks')).apiClientMock);

const references = (path: string, query?: unknown): unknown => {
  if (path === '/catalogue/subjects') return [{ id: SUBJECT_ID, name: 'Physics', courseCount: 3 }];
  if (path === '/boards') return [{ id: BOARD_ID, name: 'Cambridge', code: 'CIE' }];
  if (path === `/boards/${BOARD_ID}/levels`) {
    return [{ id: LEVEL_ID, name: 'A Level', boardId: BOARD_ID, orderIndex: 1 }];
  }
  if (path === '/catalogue/courses') return catalogue(query);
  throw new Error(`unexpected GET ${path}`);
};

let catalogue: (query: unknown) => unknown = () => listing([courseCard()]);

function renderCatalogue() {
  return renderWithSession(<CatalogueBrowser />, null, references);
}

/** The last URL pushed, as its query parameters. */
function pushedParams(): URLSearchParams {
  const href = router.push.mock.calls.at(-1)?.[0] as string;
  expect(href.startsWith('/courses')).toBe(true);
  return new URLSearchParams(href.split('?')[1] ?? '');
}

beforeEach(() => {
  resetMocks();
  catalogue = () => listing([courseCard()]);
});

describe('CatalogueBrowser', () => {
  it('lists courses with price, badges and the stated ordering (#44)', async () => {
    renderCatalogue();
    const card = (await screen.findByRole('link', { name: 'A Level Physics: Mechanics' })).closest(
      'article',
    )!;
    expect(card).toHaveTextContent('PKR 15,000.00');
    expect(card).toHaveTextContent('Physics');
    expect(card).toHaveTextContent('Omar Siddiqui');
    expect(screen.getByRole('link', { name: 'A Level Physics: Mechanics' })).toHaveAttribute(
      'href',
      `/courses/${courseCard().id}`,
    );
    expect(screen.getByRole('heading', { name: '1 course' })).toBeVisible();
    expect(
      screen.getByText('Newest published first. No course can pay for a higher position.'),
    ).toBeVisible();
  });

  it('loads the listing from the URL (#42)', async () => {
    setSearch(`q=mechanics&subjectId=${SUBJECT_ID}&free=true&sort=title&page=2`);
    renderCatalogue();
    await screen.findByRole('heading', { name: '1 course' });
    expect(apiMock.get).toHaveBeenCalledWith(
      '/catalogue/courses',
      catalogueSchema.catalogueListing,
      expect.objectContaining({
        q: 'mechanics',
        subjectId: SUBJECT_ID,
        free: 'true',
        sort: 'title',
        offset: 24,
        limit: 24,
      }),
      expect.anything(),
    );
    expect(screen.getByLabelText('Search courses')).toHaveValue('mechanics');
    expect(screen.getByLabelText('Sort by')).toHaveValue('title');
    expect(screen.getByLabelText('Free courses only')).toBeChecked();
    await waitFor(() => expect(screen.getByLabelText('Subject')).toHaveValue(SUBJECT_ID));
  });

  it('pushes each change into the URL and resets the page', async () => {
    setSearch('page=3');
    renderCatalogue();
    await screen.findByRole('heading', { name: '1 course' });

    await userEvent.type(screen.getByLabelText('Search courses'), 'kinematics');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(Object.fromEntries(pushedParams())).toEqual({ q: 'kinematics' });

    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'price_asc');
    expect(Object.fromEntries(pushedParams())).toEqual({ sort: 'price_asc' });

    await waitFor(() => expect(screen.getByRole('option', { name: 'Cambridge' })).toBeTruthy());
    await userEvent.selectOptions(screen.getByLabelText('Exam board'), BOARD_ID);
    expect(pushedParams().get('boardId')).toBe(BOARD_ID);

    await userEvent.selectOptions(screen.getByLabelText('Pacing'), 'FREE');
    expect(pushedParams().get('pacing')).toBe('FREE');

    await userEvent.click(screen.getByLabelText('Free courses only'));
    expect(pushedParams().get('free')).toBe('true');
  });

  it('enables levels once a board is chosen', async () => {
    setSearch(`boardId=${BOARD_ID}`);
    renderCatalogue();
    const level = await screen.findByLabelText('Level');
    await waitFor(() =>
      expect(within(level).getByRole('option', { name: 'A Level' })).toBeTruthy(),
    );
    expect(level).toBeEnabled();
    await userEvent.selectOptions(level, LEVEL_ID);
    expect(Object.fromEntries(pushedParams())).toEqual({ boardId: BOARD_ID, levelId: LEVEL_ID });
  });

  it('keeps level disabled without a board', async () => {
    renderCatalogue();
    expect(await screen.findByLabelText('Level')).toBeDisabled();
  });

  it('applies a price range in minor units, with string maths', async () => {
    renderCatalogue();
    await screen.findByRole('heading', { name: '1 course' });
    await userEvent.type(screen.getByLabelText('Min'), '1,500');
    await userEvent.type(screen.getByLabelText('Max'), '2500.5');
    await userEvent.click(screen.getByRole('button', { name: 'Apply price' }));
    expect(Object.fromEntries(pushedParams())).toEqual({
      minPriceMinor: '150000',
      maxPriceMinor: '250050',
    });
  });

  it('rejects a bad or inverted price range', async () => {
    renderCatalogue();
    await screen.findByRole('heading', { name: '1 course' });
    await userEvent.type(screen.getByLabelText('Min'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Apply price' }));
    expect(screen.getByLabelText('Min')).toHaveAttribute('aria-invalid', 'true');
    await userEvent.clear(screen.getByLabelText('Min'));
    await userEvent.type(screen.getByLabelText('Min'), '500');
    await userEvent.type(screen.getByLabelText('Max'), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Apply price' }));
    expect(screen.getByLabelText('Max')).toHaveAccessibleDescription(/at least the minimum/);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('shows prices back from the URL in major units', async () => {
    setSearch('minPriceMinor=150000&maxPriceMinor=250050');
    renderCatalogue();
    expect(await screen.findByLabelText('Min')).toHaveValue('1500');
    expect(screen.getByLabelText('Max')).toHaveValue('2500.5');
  });

  it('says when nothing matches, with a way back', async () => {
    catalogue = () => listing([]);
    setSearch('q=zzz');
    renderCatalogue();
    expect(await screen.findByText(/No courses match “zzz”/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Show all courses' })).toHaveAttribute(
      'href',
      '/courses',
    );
  });

  it('paginates with links that keep the filters', async () => {
    catalogue = () => listing([courseCard()], { total: 60 });
    setSearch('free=true&page=2');
    renderCatalogue();
    expect(await screen.findByText('Page 2 of 3')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      '/courses?free=true',
    );
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/courses?free=true&page=3',
    );
  });

  it('shows a load failure with a retry', async () => {
    let calls = 0;
    catalogue = () => {
      calls += 1;
      if (calls === 1) throw new ApiError('INTERNAL', 'Internal error', { status: 500 });
      return listing([courseCard()]);
    };
    renderCatalogue();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load courses');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: '1 course' })).toBeVisible();
  });

  it('toggles the filter panel on small screens, announcing its state', async () => {
    setSearch(`subjectId=${SUBJECT_ID}&free=true`);
    renderCatalogue();
    const toggle = await screen.findByRole('button', { name: /Filters \(2 active\)/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toHaveAttribute(
      'data-open',
      'true',
    );
  });
});
