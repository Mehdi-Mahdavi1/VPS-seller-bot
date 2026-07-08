import cron from "node-cron";
import { ServerRepository } from "../repositories/ServerRepository";
import { WalletService } from "../../wallet/services/WalletService";
import { datacenterServiceInstance } from "../../../di/ServiceContainer";
import { logger } from "../../../infrastructure/logger/logger";
import { prisma } from "../../../infrastructure/database/prismaClient";

function toNumber(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "object" && typeof (value as any).toNumber === "function") {
    return (value as any).toNumber();
  }
  return Number(value);
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
        if (walletBalance < hourlyCost || walletBalance <= 0) {
          await this.serverRepository.updateStatus(server.id, "STOPPED");
          await prisma.auditLog.create({
            data: {
              actorId: server.userId,
              action: "AUTO_STOP",
              entity: "SERVER",
              entityId: server.id,
              metadata: { reason: "Insufficient balance" },
            },
          });
          const datacenterSlug = server.datacenter?.slug ?? "infomaniak";
          const provider = datacenterServiceInstance.resolveProvider(datacenterSlug);
          if (provider.stopServer) {
            await provider.stopServer(server.externalServerId);
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

        logger.info({ serverId: server.id, balance: toNumber(updatedWallet.balance) }, "Hourly charge applied");
      } catch (error) {
        logger.error({ error, serverId: server.id }, "Billing cycle failed for server");
      }
    }
  }
}
