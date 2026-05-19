export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  logLevel: process.env.LOG_LEVEL ?? "info",
  port: process.env.PORT ?? "5000",
  databaseUrl: process.env.DATABASE_URL,
  adminToken: process.env.ADMIN_TOKEN,
  nrelApiKey: process.env.NREL_API_KEY ?? process.env.PVWATTS_API_KEY,
  stripePriceId: process.env.STRIPE_PRICE_ID,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  reportEmailWebhookUrl: process.env.REPORT_EMAIL_WEBHOOK_URL,
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
