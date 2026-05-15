const baseUrl = (import.meta.env.BASE_URL as string | undefined) ?? "/";

export const appEnv = {
  baseUrl,
  routerBase: baseUrl.replace(/\/$/, ""),
  apiBaseUrl: `${baseUrl}api`,
};
