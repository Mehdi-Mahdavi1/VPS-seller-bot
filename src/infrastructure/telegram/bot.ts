import { Bot } from "grammy";
import { env } from "../../config/env";

export const bot = new Bot(env.BOT_TOKEN);
