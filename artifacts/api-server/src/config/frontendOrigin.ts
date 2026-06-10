import { env } from "./env";

export const productionFrontendOrigin = "https://offgridsolarbuilder.com";

export function getFrontendOrigin(fallbackOrigin?: string): string {
  if (env.frontendUrl) {
    return env.frontendUrl.replace(/\/$/, "");
  }
  if (env.nodeEnv === "production" || env.isReplitDeployment) {
    return productionFrontendOrigin;
  }
  return fallbackOrigin ?? productionFrontendOrigin;
}
