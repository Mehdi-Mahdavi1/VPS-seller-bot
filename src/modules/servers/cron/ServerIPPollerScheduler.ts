import cron from "node-cron";
import { ServerRepository } from "../repositories/ServerRepository";
import { datacenterServiceInstance } from "../../../di/ServiceContainer";
import { logger } from "../../../infrastructure/logger/logger";
import { prisma } from "../../../infrastructure/database/prismaClient";
import { bot } from "../../../infrastructure/telegram/bot";

const IP_POLLING_INTERVAL_MINUTES = 3;
const IP_POLLING_TIMEOUT_MINUTES = 30;

function toNumber(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "object" && typeof (value as any).toNumber === "function") {
    return (value as any).toNumber();
  }
  return Number(value);
}

export class ServerIPPollerScheduler {
  constructor(private readonly serverRepository: ServerRepository) {}

  public start() {
    // Run every 3 minutes
    cron.schedule(`*/${IP_POLLING_INTERVAL_MINUTES} * * * *`, async () => {
      logger.info("Starting server IP polling job");
      await this.runIPPollingCycle();
    });
    logger.info(`Server IP poller scheduler registered for every ${IP_POLLING_INTERVAL_MINUTES} minutes`);
  }

  private async runIPPollingCycle() {
    try {
      // Find servers that:
      // 1. Are ACTIVE
      // 2. Missing either IPv4 or IPv6
      // 3. Were created within the last 30 minutes (still waiting for IP)
      const now = new Date();
      const thirtyMinutesAgo = new Date(now.getTime() - IP_POLLING_TIMEOUT_MINUTES * 60 * 1000);

      const serversWaitingForIP = await prisma.server.findMany({
        where: {
          status: "ACTIVE",
          AND: [
            {
              OR: [{ ipv4Address: null }, { ipv6Address: null }],
            },
            {
              createdAt: {
                gte: thirtyMinutesAgo,
              },
            },
          ],
        },
        include: {
          user: true,
          datacenter: true,
        },
      });

      logger.info({ count: serversWaitingForIP.length }, "Found servers waiting for IP addresses");

      for (const server of serversWaitingForIP) {
        try {
          const datacenterSlug = server.datacenter?.slug ?? "infomaniak";
          const provider = datacenterServiceInstance.resolveProvider(datacenterSlug);

          // Get server details from the datacenter provider
          if (!provider || typeof provider.getServer !== "function") {
            logger.warn({ serverId: server.id }, "Provider does not support getServer method");
            continue;
          }

          const serverData = await provider.getServer(server.externalServerId);
          if (!serverData) {
            logger.warn({ serverId: server.id, externalServerId: server.externalServerId }, "Unable to fetch server data from provider");
            continue;
          }

          // Extract IPv4 and IPv6 from the response
          const addressesObj = serverData.addresses ?? {};
          const addrArrays: any[] = Object.values(addressesObj).flat();

          const ipv4 =
            addrArrays.find((a: any) => a?.version === 4 || (a?.addr && a.addr.includes(".")))?.addr ??
            addrArrays.find((a: any) => a?.address && a.address.includes("."))?.address ??
            serverData?.accessIPv4 ??
            serverData?.ipv4Address ??
            undefined;

          const ipv6 =
            addrArrays.find((a: any) => a?.version === 6 || (a?.addr && a.addr.includes(":")))?.addr ??
            addrArrays.find((a: any) => a?.address && a.address.includes(":"))?.address ??
            serverData?.accessIPv6 ??
            serverData?.ipv6Address ??
            undefined;

          // If IPs are available, update the database
          if (ipv4 || ipv6) {
            const updatedServer = await prisma.server.update({
              where: { id: server.id },
              data: {
                ...(ipv4 && { ipv4Address: ipv4 }),
                ...(ipv6 && { ipv6Address: ipv6 }),
              },
            });

            logger.info(
              { serverId: server.id, ipv4, ipv6 },
              "Server IP addresses updated in database"
            );

            // Notify user if we have their chat ID and message ID
            await this.notifyUserAboutIPUpdate(server, ipv4, ipv6);
          } else {
            logger.debug({ serverId: server.id }, "Server IPs still not available from provider");
          }
        } catch (error) {
          logger.error({ error, serverId: server.id }, "IP polling cycle failed for server");
        }
      }
    } catch (error) {
      logger.error({ error }, "IP polling cycle failed");
    }
  }

  private async notifyUserAboutIPUpdate(
    server: any,
    ipv4?: string,
    ipv6?: string
  ) {
    try {
      if (!server.user?.telegramId) {
        logger.warn({ serverId: server.id }, "Unable to notify user: no telegram ID");
        return;
      }

      // Use stored chat ID and message ID
      const chatId = server.telegramChatId ?? server.user.telegramId;
      const messageId = server.telegramMessageId;

      const updatedLines = [
        "✅ <b>سرور شما آماده شد!</b>",
        "",
        `<b>نام سرور:</b> <code>${server.name}</code>`,
        `<b>وضعیت:</b> ${server.status}`,
      ];

      if (ipv4) updatedLines.push(`<b>آدرس IPv4:</b> <code>${ipv4}</code>`);
      if (ipv6) updatedLines.push(`<b>آدرس IPv6:</b> <code>${ipv6}</code>`);

      updatedLines.push(
        `<b>نام کاربری:</b> <code>root</code>`,
        ""
      );

      const sshCommand = ipv4 ? `ssh -i dvrssh1.pem root@${ipv4}` : ipv6 ? `ssh -i dvrssh1.pem root@[${ipv6}]` : `ssh -i dvrssh1.pem root@<server-ip>`;
      const escapedSshCommand = sshCommand.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      updatedLines.push(`<b>دستور SSH:</b> <code>${escapedSshCommand}</code>`);

      updatedLines.push(
        "",
        "ℹ️ برای اتصال SSH، فایل <code>dvrssh1.pem</code> را از پروژه استفاده کنید.",
        "",
        "✅ شما می‌توانید اتصال SSH را شروع کنید."
      );

      const updatedMessage = updatedLines.join("\n");

      // Try to edit the original message if we have messageId
      if (messageId) {
        try {
          await bot.api.editMessageText(chatId, messageId, updatedMessage, {
            parse_mode: "HTML",
          });
          logger.info({ serverId: server.id, chatId, messageId }, "Notified user about IP update via message edit");
        } catch (editError: any) {
          // If edit fails (e.g., message too old), send a new message
          if (editError?.error_code === 400) {
            await bot.api.sendMessage(chatId, updatedMessage, { parse_mode: "HTML" });
            logger.info({ serverId: server.id, chatId }, "Notified user about IP update via new message (original edit failed)");
          } else {
            throw editError;
          }
        }
      } else {
        // Send new message if we don't have messageId
        await bot.api.sendMessage(chatId, updatedMessage, { parse_mode: "HTML" });
        logger.info({ serverId: server.id, chatId }, "Notified user about IP update via new message");
      }
    } catch (error) {
      logger.error({ error, serverId: server.id }, "Failed to notify user about IP update");
    }
  }
}

