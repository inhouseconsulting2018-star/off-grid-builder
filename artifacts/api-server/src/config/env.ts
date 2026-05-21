export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  logLevel: process.env.LOG_LEVEL ?? "info",
  port: process.env.PORT,
  databaseUrl: process.env.DATABASE_URL,
  pvwattsApiKey: process.env.PVWATTS_API_KEY,
  stripePriceId: process.env.STRIPE_HOMEOWNER_REPORT_PRICE_ID ?? process.env.STRIPE_PRICE_ID,
  stripePropertyPackPriceId: process.env.STRIPE_PROPERTY_PACK_PRICE_ID,
  stripeContractorAnnualPriceId: process.env.STRIPE_CONTRACTOR_ANNUAL_PRICE_ID,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  adminToken: process.env.ADMIN_TOKEN,
  frontendUrl: process.env.FRONTEND_URL,
  replitConnectorsHostname: process.env.REPLIT_CONNECTORS_HOSTNAME,
  replitIdentity: process.env.REPL_IDENTITY,
  webReplRenewal: process.env.WEB_REPL_RENEWAL,
  isReplitDeployment: process.env.REPLIT_DEPLOYMENT === "1",
};

export function requireEnv(name: keyof typeof env): string {
  const value = env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}
