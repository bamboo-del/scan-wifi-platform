import { getMiniProgramEnvironment } from "../core/mini-program-environment";

export type E2eStep =
  "SCAN" | "LOOKUP" | "WIFI_START" | "WIFI_CONNECT" | "WIFI_VERIFY" | "WIFI_FAILED";
/** Fixed messages only: never serialize credentials, network identifiers or platform errors. */
export function logStep(step: E2eStep): void {
  if (getMiniProgramEnvironment(wx) === "develop" || getMiniProgramEnvironment(wx) === "trial")
    console.info(`[${step}]`);
}
