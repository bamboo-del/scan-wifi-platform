# Project guidance

- Use pnpm workspaces and TypeScript strict mode. Keep package boundaries explicit.
- Never log, serialize to audit metadata, or return an unmasked Wi-Fi password from an admin list/status endpoint.
- AppSecret and encryption/session keys are server-only. No secret may use a `VITE_` prefix or appear in mini-program files.
- All API writes require Zod validation. All admin routes require an authenticated HttpOnly cookie session.
- Keep routes thin: validation and transport in routes, business rules in services, persistence in repositories.
- Store all timestamps as PostgreSQL `timestamptz`; serialize ISO UTC and localize only in UI.
- Use the shared error envelope `{ error: { code, message, requestId, details? } }`; sanitize external errors.
- Use cryptographically random 32-character lowercase hexadecimal `scene_token` values. Never encode store IDs, SSIDs, or passwords in QR scenes.
- The official WeChat Wi-Fi overview currently says the API family is delisted. Keep the compatibility adapter isolated and production-disabled until target-AppID physical-device verification succeeds.
- Do not commit generated credentials, `.env`, QR output, coverage, Playwright artifacts, or build output.
- Before handing off, run format check, lint, typecheck, tests, build, and the relevant rendered UI smoke flow.
