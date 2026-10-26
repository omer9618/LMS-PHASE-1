/**
 * Base class for errors thrown by pure domain rules (`modules/x/domain/*.rules.ts`).
 *
 * Deliberately has no Nest or Prisma imports so rule files stay pure and unit-testable.
 * `code` should match an ErrorCode so the exception filter can map it to a status;
 * an unmapped code becomes 422.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    readonly info?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
