const placeholderHostnames = new Set([
  "example.cn",
  "example.com",
  "example.net",
  "example.org",
  "invalid",
  "localhost",
  "test",
]);

function normalizeHostname(value) {
  return value.trim().toLowerCase().replace(/\.$/u, "");
}

export function isPlaceholderHostname(value) {
  const hostname = normalizeHostname(value);
  return (
    placeholderHostnames.has(hostname) ||
    hostname.endsWith(".example.cn") ||
    hostname.endsWith(".example.com") ||
    hostname.endsWith(".example.net") ||
    hostname.endsWith(".example.org") ||
    hostname.endsWith(".invalid") ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".test")
  );
}

export function assertProductionDomain(value, name) {
  const domain = normalizeHostname(value ?? "");
  if (!domain) {
    throw new Error(`${name} is required for a production release`);
  }
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(domain)) {
    throw new Error(`${name} must be a valid public domain name`);
  }
  if (isPlaceholderHostname(domain)) {
    throw new Error(`${name} must not use an example or localhost placeholder`);
  }
  return domain;
}

export function assertReleaseApiBaseUrl(value, name = "MINIPROGRAM_API_BASE_URL") {
  let url;
  try {
    url = new URL(value ?? "");
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must use HTTPS without credentials, port, query, or fragment`);
  }
  assertProductionDomain(url.hostname, `${name} hostname`);
  return url.href.replace(/\/$/u, "");
}

export function isPlaceholderApiBaseUrl(value) {
  try {
    return isPlaceholderHostname(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function assertReleaseAppId(value, name = "project.config.json appid") {
  const appId = typeof value === "string" ? value.trim() : "";
  if (appId === "touristappid" || appId === "testappid") {
    throw new Error(`${name} must not use a tourist or test AppID`);
  }
  if (!/^wx[A-Za-z0-9]{16}$/u.test(appId)) {
    throw new Error(`${name} must contain a formal WeChat mini-program AppID`);
  }
  return appId;
}
