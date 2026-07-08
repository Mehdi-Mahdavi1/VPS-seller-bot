import { bot } from "./infrastructure/telegram/bot";
import { BotApp } from "./bot/BotApp";
import { BillingScheduler } from "./modules/servers/cron/BillingScheduler";
import { ServerRepository } from "./modules/servers/repositories/ServerRepository";
import { WalletRepository } from "./modules/wallet/repositories/WalletRepository";
import { WalletService } from "./modules/wallet/services/WalletService";
import { logger } from "./infrastructure/logger/logger";

const app = new BotApp();
const scheduler = new BillingScheduler(new ServerRepository(), new WalletService(new WalletRepository()));

(async () => {
  try {
    await app.initialize();

    try {
      await bot.api.setMyCommands([
        { command: "start", description: "Open the main menu" },
      ]);
    } catch (commandError) {
      logger.warn({ error: commandError }, "Unable to register bot commands, continuing startup");
    }

    scheduler.start();
    logger.info("Bot process started");
  } catch (error) {
    logger.error({ error }, "Application failed to start");
    process.exit(1);
  }
})();
