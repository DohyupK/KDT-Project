/**
 * BigInt JSON serialization for Prisma message ids (@db.UnsignedBigInt).
 * Import once from the app root layout so API Route responses do not throw.
 */
export function patchBigIntJson(): void {
  const proto = BigInt.prototype as unknown as { toJSON?: () => string }
  if (typeof proto.toJSON !== 'function') {
    proto.toJSON = function toJSON(this: bigint) {
      return this.toString()
    }
  }
}

patchBigIntJson()
