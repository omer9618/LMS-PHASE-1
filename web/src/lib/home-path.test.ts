import { describe, expect, it } from 'vitest';
import { homePathFor } from './home-path';

describe('homePathFor', () => {
  it.each([
    [null, '/courses'],
    [{ roles: ['STUDENT'] }, '/courses'],
    [{ roles: ['TEACHER'] }, '/teacher/courses'],
    [{ roles: ['STUDENT', 'TEACHER'] }, '/teacher/courses'],
    [{ roles: ['ADMIN'] }, '/admin'],
    [{ roles: ['ADMIN', 'TEACHER'] }, '/admin'],
    [{ roles: ['ADMIN', 'TEACHER'], activeContext: 'TEACHER' }, '/teacher/courses'],
    [{ roles: ['ADMIN', 'TEACHER'], activeContext: 'ADMIN' }, '/admin'],
  ] as const)('%j goes to %s', (user, expected) => {
    expect(homePathFor(user as never)).toBe(expected);
  });
});
