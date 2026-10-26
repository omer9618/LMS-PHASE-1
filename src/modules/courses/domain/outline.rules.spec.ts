import {
  assertLessonContent,
  assertLessonDeletable,
  assertSectionDeletable,
  InvalidOrderError,
  OutlineChangeRefusedError,
  planMove,
  planReorder,
} from './outline.rules';

describe('outline ordering (#27)', () => {
  it('reorders when the request names exactly the current items', () => {
    expect([...planReorder(['a', 'b', 'c'], ['c', 'a', 'b'])]).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ]);
  });

  it.each([
    ['a missing item', ['a', 'b']],
    ['an extra item', ['a', 'b', 'c', 'd']],
    ['a duplicate', ['a', 'a', 'b']],
    ['a foreign item', ['a', 'b', 'x']],
  ])('refuses %s', (_label, requested) => {
    expect(() => planReorder(['a', 'b', 'c'], requested)).toThrow(InvalidOrderError);
  });

  it('moves a lesson within its section', () => {
    expect(planMove('a', ['a', 'b', 'c'], null, 2)).toEqual({
      source: ['b', 'c', 'a'],
      target: null,
    });
    expect(planMove('c', ['a', 'b', 'c'], null, 0).source).toEqual(['c', 'a', 'b']);
  });

  it('moves a lesson to another section, clamping the position', () => {
    expect(planMove('b', ['a', 'b'], ['x', 'y'], 1)).toEqual({
      source: ['a'],
      target: ['x', 'b', 'y'],
    });
    expect(planMove('b', ['a', 'b'], ['x'], 99).target).toEqual(['x', 'b']);
    expect(planMove('b', ['a', 'b'], [], 0).target).toEqual(['b']);
  });

  it('refuses to move a lesson from a section it is not in', () => {
    expect(() => planMove('z', ['a'], ['x'], 0)).toThrow(InvalidOrderError);
  });
});

describe('lesson rules', () => {
  it('text lessons need a body; other types do not', () => {
    expect(() => assertLessonContent('TEXT', '  ')).toThrow(InvalidOrderError);
    expect(() => assertLessonContent('TEXT', 'Hello')).not.toThrow();
    expect(() => assertLessonContent('VIDEO', undefined)).not.toThrow();
  });

  it('never deletes lessons with student work, or non-empty sections', () => {
    expect(() => assertLessonDeletable({ progress: 0, attempts: 0 })).not.toThrow();
    expect(() => assertLessonDeletable({ progress: 3, attempts: 0 })).toThrow(
      OutlineChangeRefusedError,
    );
    expect(() => assertLessonDeletable({ progress: 0, attempts: 1 })).toThrow(
      OutlineChangeRefusedError,
    );
    expect(() => assertSectionDeletable(2)).toThrow(OutlineChangeRefusedError);
    expect(() => assertSectionDeletable(0)).not.toThrow();
  });
});
