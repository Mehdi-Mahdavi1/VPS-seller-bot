import dotenv from "dotenv";
import { existsSync } from "fs";

const envPath = process.env.NODE_ENV === "test" ? ".env.test" : ".env";
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const requiredEnv = ["BOT_TOKEN", "INFOMANIAK_AUTH_TOKEN", "DATABASE_URL"];
for (const name of requiredEnv) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

export const env = {
  BOT_TOKEN: process.env.BOT_TOKEN as string,
  INFOMANIAK_AUTH_TOKEN: process.env.INFOMANIAK_AUTH_TOKEN as string,
  DATABASE_URL: process.env.DATABASE_URL as string,
  INFOMANIAK_SSH_KEY: process.env.INFOMANIAK_SSH_KEY ?? undefined,
  INFOMANIAK_NETWORK_IDS: process.env.INFOMANIAK_NETWORK_IDS
    ? process.env.INFOMANIAK_NETWORK_IDS.split(",").map((value) => value.trim()).filter(Boolean)
    : [],
  ADMIN_IDS: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(",").map((value) => value.trim()) : [],
  NODE_ENV: process.env.NODE_ENV || "development",
  // Optional exchange rate (USD -> Toman). If set, messages will include local currency conversion.
  USD_TO_TOMAN: process.env.USD_TO_TOMAN ? Number(process.env.USD_TO_TOMAN) : undefined,
};
