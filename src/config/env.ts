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
  ADMIN_IDS: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(",").map((value) => value.trim()) : [],
  NODE_ENV: process.env.NODE_ENV || "development",
};
