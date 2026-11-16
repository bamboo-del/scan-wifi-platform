import { tooManyRequests } from "../lib/errors.js";

interface FailureBucket {
  failures: number[];
  blockedUntil: number;
}

export class LoginThrottle {
  private readonly buckets = new Map<string, FailureBucket>();
  private nextCleanupAt = 0;

  public constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 15 * 60_000,
    private readonly blockMs = 15 * 60_000,
  ) {}

  public assertAllowed(key: string, now = Date.now()): void {
    this.cleanup(now);
    const bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= 10_000) throw tooManyRequests("登录尝试过多，请稍后再试");
      return;
    }
    if (bucket.blockedUntil > now) throw tooManyRequests("登录失败次数过多，请稍后再试");
    this.compact(key, bucket, now);
  }

  public recordFailure(key: string, now = Date.now()): void {
    this.cleanup(now);
    if (!this.buckets.has(key) && this.buckets.size >= 10_000) {
      throw tooManyRequests("登录尝试过多，请稍后再试");
    }
    const bucket = this.buckets.get(key) ?? { failures: [], blockedUntil: 0 };
    bucket.failures = bucket.failures.filter((time) => time > now - this.windowMs);
    bucket.failures.push(now);
    if (bucket.failures.length >= this.maxFailures) bucket.blockedUntil = now + this.blockMs;
    this.buckets.set(key, bucket);
  }

  public clear(key: string): void {
    this.buckets.delete(key);
  }

  private cleanup(now: number): void {
    if (now < this.nextCleanupAt) return;
    for (const [key, bucket] of this.buckets) this.compact(key, bucket, now);
    this.nextCleanupAt = now + Math.min(60_000, this.windowMs, this.blockMs);
  }

  private compact(key: string, bucket: FailureBucket, now: number): void {
    bucket.failures = bucket.failures.filter((time) => time > now - this.windowMs);
    if (bucket.failures.length === 0 && bucket.blockedUntil <= now) this.buckets.delete(key);
  }
}
