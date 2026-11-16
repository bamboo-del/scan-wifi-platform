export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: unknown;

  public constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code: string, message: string, details?: unknown): AppError =>
  new AppError(400, code, message, details);
export const unauthorized = (message = "登录状态无效，请重新登录"): AppError =>
  new AppError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "无权执行此操作"): AppError =>
  new AppError(403, "FORBIDDEN", message);
export const notFound = (code: string, message: string): AppError =>
  new AppError(404, code, message);
export const conflict = (code: string, message: string): AppError =>
  new AppError(409, code, message);
export const tooManyRequests = (message: string): AppError =>
  new AppError(429, "RATE_LIMITED", message);
export const serviceUnavailable = (code: string, message: string): AppError =>
  new AppError(503, code, message);
