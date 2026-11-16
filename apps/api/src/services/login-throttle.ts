import { tooManyRequests } from "../lib/errors.js";

interface FailureBucket {
  failures: number[];
  blockedUntil: number;
}

export class LoginThrottle {
  private readonly buckets = new Map<string, FailureBucket>();

  public constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 15 * 60_000,
    private readonly blockMs = 15 * 60_000,
  ) {}

  public assertAllowed(key: string, now = Date.now()): void {
    const bucket = this.buckets.get(key);
    if (!bucket) return;
    if (bucket.blockedUntil > now) throw tooManyRequests("登录失败次数过多，请稍后再试");
    this.compact(key, bucket, now);
  }

  public recordFailure(key: string, now = Date.now()): void {
    const bucket = this.buckets.get(key) ?? { failures: [], blockedUntil: 0 };
    bucket.failures = bucket.failures.filter((time) => time > now - this.windowMs);
    bucket.failures.push(now);
    if (bucket.failures.length >= this.maxFailures) bucket.blockedUntil = now + this.blockMs;
    this.buckets.set(key, bucket);
  }

  public clear(key: string): void {
    this.buckets.delete(key);
  }

  private compact(key: string, bucket: FailureBucket, now: number): void {
    bucket.failures = bucket.failures.filter((time) => time > now - this.windowMs);
    if (bucket.failures.length === 0 && bucket.blockedUntil <= now) this.buckets.delete(key);
  }
}
