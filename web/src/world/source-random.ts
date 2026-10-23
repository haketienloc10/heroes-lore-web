const JAVA_RANDOM_MULTIPLIER = 0x5deece66dn;
const JAVA_RANDOM_ADDEND = 0xbn;
const JAVA_RANDOM_MASK = (1n << 48n) - 1n;
const JAVA_RANDOM_INT_MIN = -0x80000000;

/** The 48-bit generator used by `java.util.Random`. */
export class JavaRandom {
  private state: bigint;

  constructor(seed: number | bigint) {
    const initialSeed = typeof seed === 'bigint' ? seed : BigInt(Math.trunc(seed));
    this.state = (initialSeed ^ JAVA_RANDOM_MULTIPLIER) & JAVA_RANDOM_MASK;
  }

  private next(bits: number): number {
    this.state = (this.state * JAVA_RANDOM_MULTIPLIER + JAVA_RANDOM_ADDEND) & JAVA_RANDOM_MASK;
    return Number(this.state >> BigInt(48 - bits));
  }

  nextInt(): number {
    return this.next(32) | 0;
  }

  /** Match `g.a(min, max)`, including its `Math.abs(int) % width` behavior. */
  nextSourceRange(minimum: number, maximum: number): number {
    if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum > maximum ||
      minimum < JAVA_RANDOM_INT_MIN || maximum > 0x7fffffff) {
      throw new RangeError('Source random range must be ordered signed 32-bit integers');
    }
    const width = (maximum - minimum + 1) | 0;
    if (width === 0) return 0;

    const value = this.nextInt();
    const absoluteValue = value === JAVA_RANDOM_INT_MIN ? JAVA_RANDOM_INT_MIN : Math.abs(value);
    return minimum + (absoluteValue % width);
  }
}

export interface SourceRandomStreams {
  /** Source `g.a(...)`, used for bounded rolls such as damage and loot. */
  range: JavaRandom;
  /** Source `cj.f245a`, used for raw sign checks, direction bytes and path ties. */
  entity: JavaRandom;
}

/** Create separate runtime streams; source seeds are time-dependent and unknown. */
export function createRuntimeSourceRandomStreams(): SourceRandomStreams {
  const seeds = new Uint32Array(2);
  if (globalThis.crypto?.getRandomValues !== undefined) {
    globalThis.crypto.getRandomValues(seeds);
  } else {
    const clock = BigInt(Date.now());
    const performanceClock = BigInt(Math.floor(globalThis.performance?.now() ?? 0));
    seeds[0] = Number(BigInt.asUintN(32, clock ^ (performanceClock << 12n)));
    seeds[1] = Number(BigInt.asUintN(32, (clock << 17n) ^ performanceClock ^ 0x9e3779b9n));
  }
  return {
    entity: new JavaRandom(BigInt(seeds[0])),
    range: new JavaRandom(BigInt(seeds[1])),
  };
}
