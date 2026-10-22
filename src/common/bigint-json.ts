declare global {
  interface BigInt {
    toJSON(): string;
  }
}

/**
 * Money is BigInt minor units end-to-end. JSON.stringify throws on BigInt, so serialise it as a
 * decimal string. Never convert to Number: that is how rounding errors reach money.
 */
export function installBigIntJson(): void {
  if (Object.prototype.hasOwnProperty.call(BigInt.prototype, 'toJSON')) return;
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value(this: bigint) {
      return this.toString();
    },
    writable: true,
    configurable: true,
  });
}
