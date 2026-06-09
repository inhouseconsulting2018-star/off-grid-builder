import { env } from "./env";

export const productionFrontendOrigin = "https://www.offgridsolarbuilder.com";

export function getFrontendOrigin(fallbackOrigin?: string): string {
  if (env.nodeEnv === "production" || env.isReplitDeployment) {
    return productionFrontendOrigin;
  }

  return env.frontendUrl?.replace(/\/$/, "") ?? fallbackOrigin ?? productionFrontendOrigin;
}
