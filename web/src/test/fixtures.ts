import type { CatalogueListing, CourseCard, CourseDetail } from '@/lib/api/schemas/catalogue';

export const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
export const BOARD_ID = '22222222-2222-4222-8222-222222222222';
export const LEVEL_ID = '33333333-3333-4333-8333-333333333333';
export const COURSE_ID = '44444444-4444-4444-8444-444444444444';

export function courseCard(overrides: Partial<CourseCard> = {}): CourseCard {
  return {
    id: COURSE_ID,
    title: 'A Level Physics: Mechanics',
    description: 'Forces, motion and energy.',
    syllabusArea: 'Paper 1: Mechanics',
    isFree: false,
    priceMinor: '1500000',
    currency: 'PKR',
    progressionMode: 'SEQUENTIAL',
    isEnrollmentOpen: true,
    publishedAt: '2026-10-01T00:00:00.000Z',
    board: { id: BOARD_ID, name: 'Cambridge' },
    level: { id: LEVEL_ID, name: 'A Level' },
    subject: { id: SUBJECT_ID, name: 'Physics' },
    teacher: { id: 't-1', fullName: 'Omar Siddiqui' },
    ...overrides,
  };
}

export function listing(
  items: CourseCard[],
  overrides: Partial<CatalogueListing> = {},
): CatalogueListing {
  return {
    items,
    total: items.length,
    limit: 24,
    offset: 0,
    ordering: 'Newest published first. No course can pay for a higher position.',
    ...overrides,
  };
}

export function courseDetail(overrides: Partial<CourseDetail> = {}): CourseDetail {
  const { teacher: _teacher, ...card } = courseCard();
  return {
    ...card,
    teacher: {
      id: 't-1',
      fullName: 'Omar Siddiqui',
      profile: {
        bio: 'Ten years teaching physics.',
        photoUrl: null,
        qualifications: 'MSc Physics',
      },
    },
    outline: [
      {
        id: 's-1',
        title: 'Kinematics',
        lessons: [
          { id: 'l-1', title: 'Welcome', type: 'VIDEO', isFreePreview: true, durationSeconds: 300 },
          {
            id: 'l-2',
            title: 'Velocity',
            type: 'VIDEO',
            isFreePreview: false,
            durationSeconds: 900,
          },
          {
            id: 'l-3',
            title: 'Worksheet',
            type: 'PDF',
            isFreePreview: false,
            durationSeconds: null,
          },
        ],
      },
    ],
    demoLessonIds: ['l-1'],
    lessonCount: 3,
    totalVideoSeconds: 1200,
    ...overrides,
  };
}
