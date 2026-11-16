let verified: { ssid: string; storeName: string } | null = null;
export function rememberVerifiedConnection(value: { ssid: string; storeName: string }): void {
  verified = value;
}
export function takeVerifiedConnection(): { ssid: string; storeName: string } | null {
  const value = verified;
  verified = null;
  return value;
}
