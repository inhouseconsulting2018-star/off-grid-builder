import pino from "pino";
import { env } from "../config/env";

const isProduction = env.nodeEnv === "production";

export const logger = pino({
  level: env.logLevel,
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
