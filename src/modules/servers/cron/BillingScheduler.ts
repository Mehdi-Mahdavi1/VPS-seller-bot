import cron from "node-cron";
import { ServerRepository } from "../repositories/ServerRepository";
import { WalletService } from "../../wallet/services/WalletService";
import { datacenterServiceInstance } from "../../../di/ServiceContainer";
import { logger } from "../../../infrastructure/logger/logger";
import { prisma } from "../../../infrastructure/database/prismaClient";
import { bot } from "../../../infrastructure/telegram/bot";
import { formatCurrency } from "../../common/formatter";
import { env } from "../../../config/env";

function toNumber(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "object" && typeof (value as any).toNumber === "function") {
    return (value as any).toNumber();
  }
  return Number(value);
}

function formatLocal(valueUsd: number): string | null {
  const rate = env.USD_TO_TOMAN;
  if (!rate) return null;
  const toman = Math.round(valueUsd * rate);
  return `${toman.toLocaleString()} تومان`;
}

export class BillingScheduler {
  constructor(private readonly serverRepository: ServerRepository, private readonly walletService: WalletService) {}

  public start() {
    cron.schedule("0 * * * *", async () => {
      logger.info("Starting hourly billing job");
      await this.runBillingCycle();
    });
    logger.info("Billing scheduler registered for hourly execution");
  }

  private async runBillingCycle() {
    const servers = await this.serverRepository.findActiveServers();
    for (const server of servers) {
      try {
        const hourlyCost = toNumber(server.hourlyPrice);
        if (!server.wallet) {
          logger.warn({ serverId: server.id }, "Server wallet not found");
          continue;
        }

        const walletBalance = toNumber(server.wallet.balance);
        const chatId = server.telegramChatId ?? server.user?.telegramId;

        if (walletBalance < hourlyCost || walletBalance <= 0) {
          // Insufficient funds -> delete server
          const datacenterSlug = server.datacenter?.slug ?? "infomaniak";
          const provider = datacenterServiceInstance.resolveProvider(datacenterSlug);
          try {
            if (provider.deleteServer) {
              await provider.deleteServer(server.externalServerId);
            }
          } catch (err) {
            logger.error({ error: err, serverId: server.id }, "Failed to delete server on provider despite insufficient balance");
          }

          await this.serverRepository.updateStatus(server.id, "DELETED");
          await prisma.auditLog.create({
            data: {
              actorId: server.userId,
              action: "AUTO_DELETE",
              entity: "SERVER",
              entityId: server.id,
              metadata: { reason: "Insufficient balance" },
            },
          });

          // Notify user
          if (chatId) {
            const msg = `🗑️ <b>سرور ${server.name} حذف شد</b>\n\nبه دلیل کمبود موجودی، سرور شما حذف شد.`;
            try {
              await bot.api.sendMessage(chatId, msg, { parse_mode: "HTML" });
            } catch (err) {
              logger.warn({ error: err, chatId, serverId: server.id }, "Failed to notify user about server deletion");
            }
          }

          continue;
        }

        const updatedWallet = await this.walletService.charge(server.userId, hourlyCost, `Hourly billing for server ${server.name}`);
        const transaction = await prisma.walletTransaction.findFirst({
          where: { walletId: server.wallet.id, type: "PURCHASE" },
          orderBy: { createdAt: "desc" },
        });
        if (transaction) {
          await prisma.serverBilling.create({
            data: {
              serverId: server.id,
              walletTransactionId: transaction.id,
              amount: hourlyCost,
            },
          });
        }

        // Extend expiry by 1 hour
        const currentExpiry = server.expiresAt ? new Date(server.expiresAt) : new Date();
        const newExpiry = new Date(Math.max(Date.now(), currentExpiry.getTime()) + 60 * 60 * 1000);
        await prisma.server.update({ where: { id: server.id }, data: { expiresAt: newExpiry } });

        // Notify user about renewal
        if (chatId) {
          const local = formatLocal(Number(hourlyCost));
          const usdText = formatCurrency(Number(hourlyCost));
          const localText = local ? ` (${local})` : "";
          const expiresStr = newExpiry.toLocaleString();
          const msg = `**${server.name}** (\`${server.externalServerId}\`)\n\n✅ <b>سرور شما با موفقیت تمدید شد.</b>\n\n• ️دوره پرداخت: ساعتی\n• ️تاریخ اتمام دوره: \`${expiresStr}\` (1 ساعت و 0 دقیقه)\n• ️هزینه کسر شده: ${usdText}${localText}`;
          try {
            await bot.api.sendMessage(chatId, msg, { parse_mode: "HTML" as any });
          } catch (err) {
            logger.warn({ error: err, chatId, serverId: server.id }, "Failed to notify user about renewal");
          }
        }

        logger.info({ serverId: server.id, balance: toNumber(updatedWallet.balance) }, "Hourly charge applied and expiry extended");
      } catch (error) {
        logger.error({ error, serverId: server.id }, "Billing cycle failed for server");
      }
    }
  }
}
