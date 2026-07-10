import { InlineKeyboard } from "grammy";
import { bot } from "../infrastructure/telegram/bot";
import { userService } from "../di/ServiceContainer";
import { datacenterServiceInstance } from "../di/ServiceContainer";
import { serverService } from "../di/ServiceContainer";
import { walletService } from "../di/ServiceContainer";
import { paymentService } from "../di/ServiceContainer";
import { adminService } from "../di/ServiceContainer";
import { logger } from "../infrastructure/logger/logger";
import {
  buildCreateServerKeyboard,
  buildMainMenuKeyboard,
  buildOsMenuKeyboard,
  buildPaymentAmountKeyboard,
  buildPaymentMethodKeyboard,
  buildDatacenterKeyboard,
  buildAdminPaymentKeyboard,
  buildServersListKeyboard,
  buildServerDetailsKeyboard,
} from "./keyboard/menus";
import { formatCurrency } from "../modules/common/formatter";
import { env } from "../config/env";
import { createSelectionState, getSelectionState, updateSelectionState, deleteSelectionState } from "./callbackStore";
import { setPendingPrice, getPendingPrice, clearPendingPrice } from "./adminPriceStore";
import { prisma } from "../infrastructure/database/prismaClient";

function parseCallbackData(data: string): string[] {
  return data.split(":");
}

async function ensureAppUser(ctx: any) {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) {
    throw new Error("Telegram user ID is unavailable.");
  }
  return userService.ensureUser(telegramId, ctx.from?.username, ctx.from?.first_name, ctx.from?.last_name);
}

function buildServerDetailsMessage(plan: any, osName: string | null, billingMode: "HOURLY" | "MONTHLY" = "HOURLY"): string {
  const monthly = Number(plan.monthlyPrice ?? 0);
  const hourly = monthly / 720;
  const priceLine = billingMode === "MONTHLY" ? `${formatCurrency(monthly)} / month` : `${formatCurrency(hourly)} / hour`;
  return [
    `🖥 <b>Plan details</b>`,
    `Name: ${plan.name}`,
    `CPU: ${plan.vcpus} Core(s)`,
    `RAM: ${plan.ramMb / 1024} GB`,
    `Disk: ${plan.diskGb} GB`,
    `Traffic: 1 TB`,
    `Price: ${priceLine}`,
    `Selected OS: ${osName ?? "Not Selected"}`,
  ].join("\n");
}

export class BotApp {
  public async initialize(): Promise<void> {
    this.configureRoutes();
    bot.start({
      onStart: () => {
        logger.info("Telegram bot initialized");
      },
    });
  }

  private configureRoutes(): void {
    bot.command("start", async (ctx: any) => {
      logger.info("START COMMAND RECEIVED", { telegramId: ctx.from?.id?.toString() });
      const user = await userService.ensureUser(ctx.from?.id.toString(), ctx.from?.username, ctx.from?.first_name, ctx.from?.last_name);
      const text = [`👋 Hello ${user.firstName ?? "there"}!`, "Use the menu below to manage your servers and wallet."].join("\n");
      await ctx.reply(text, { reply_markup: buildMainMenuKeyboard() });
    });

    bot.callbackQuery("create_server", async (ctx: any) => {
      const datacenters = await datacenterServiceInstance.getDatacenterSummaries();
      await ctx.editMessageText("🖥 Available Datacenters\nChoose the datacenter you want to deploy your virtual server.\nCurrently available:\n✅ Infomaniak", {
        reply_markup: buildDatacenterKeyboard(datacenters),
      });
    });

    bot.callbackQuery(/^datacenter_select:(.*)$/, async (ctx: any) => {
      const [, slug] = parseCallbackData(ctx.callbackQuery.data!);
      const plans = await datacenterServiceInstance.listPlans(slug);
      if (plans.length === 0) {
        await ctx.answerCallbackQuery({ text: "No plans available for the selected datacenter.", show_alert: true });
        return;
      }
      await ctx.editMessageText("🖥 Select a server plan", { reply_markup: buildCreateServerKeyboard(slug, plans) });
    });

    bot.callbackQuery(/^plan_select:(.*):(.*)$/, async (ctx: any) => {
      const [, slug, flavorId] = parseCallbackData(ctx.callbackQuery.data!);
      const plan = await datacenterServiceInstance.getPlanById(slug, flavorId);
      if (!plan) {
        await ctx.answerCallbackQuery({ text: "The selected plan is no longer available.", show_alert: true });
        return;
      }
      const token = createSelectionState({ slug, flavorId });
      const message = buildServerDetailsMessage(plan, null, "HOURLY");
      const keyboard = new InlineKeyboard()
        .text("💿 Select Operating System", `select_os:${token}`)
        .row()
        .text("🔁 Billing: Hourly", `toggle_billing:${token}`)
        .row()
        .text("✅ Create Server (Charge hourly)", `create_server_confirm:${token}`)
        .row()
        .text("🔙 Main menu", "main_menu");
      await ctx.editMessageText(message, { reply_markup: keyboard, parse_mode: "HTML" });
    });

    bot.callbackQuery(/^select_os:(.*)$/, async (ctx: any) => {
      const [, token] = parseCallbackData(ctx.callbackQuery.data!);
      let selection = getSelectionState(token);
      if (!selection) {
        await ctx.answerCallbackQuery({ text: "Selection expired. Please choose a plan again.", show_alert: true });
        return;
      }
      const images = await datacenterServiceInstance.listOperatingSystems(selection.slug);
      const keyboard = buildOsMenuKeyboard(token, images, `plan_select:${selection.slug}:${selection.flavorId}`);
      await ctx.editMessageText("💿 Select Server Operating System\n❕Changing OS after server creation is not supported.", { reply_markup: keyboard });
    });

    bot.callbackQuery(/^os_select:(.*):(.*)$/, async (ctx: any) => {
      const [, token, imageId] = parseCallbackData(ctx.callbackQuery.data!);
      let selection = getSelectionState(token);
      if (!selection) {
        await ctx.answerCallbackQuery({ text: "Selection expired. Please choose a plan again.", show_alert: true });
        return;
      }
      const plan = await datacenterServiceInstance.getPlanById(selection.slug, selection.flavorId);
      const os = await datacenterServiceInstance.getOperatingSystemById(imageId);
      if (!plan || !os) {
        await ctx.answerCallbackQuery({ text: "Unable to load selected operating system.", show_alert: true });
        return;
      }
      updateSelectionState(token, { imageId });
      selection = getSelectionState(token)!;
      const message = buildServerDetailsMessage(plan, os.name, selection.billingMode ?? "HOURLY");
      const keyboard = new InlineKeyboard()
        .text("💿 Select Operating System", `select_os:${token}`)
        .row()
        .text(selection.billingMode === "MONTHLY" ? "✅ Create Server (Charge monthly)" : "✅ Create Server (Charge hourly)", `create_server_confirm:${token}`)
        .row()
        .text(selection.billingMode === "MONTHLY" ? "💲 Billing: Monthly" : "💲 Billing: Hourly", `toggle_billing:${token}`)
        .row()
        .text("🔙 Main menu", "main_menu");
      await ctx.editMessageText(message, { reply_markup: keyboard, parse_mode: "HTML" });
    });

    bot.callbackQuery(/^create_server_confirm:(.*)$/, async (ctx: any) => {
      const [, token] = parseCallbackData(ctx.callbackQuery.data!);
      const selection = getSelectionState(token);
      if (!selection?.imageId) {
        await ctx.answerCallbackQuery({ text: "Please select an operating system before creating the server.", show_alert: true });
        return;
      }
      try {
        const user = await ensureAppUser(ctx);
        const billingMode = selection.billingMode ?? "HOURLY";

        // Send waiting message - edit current message
        await ctx.editMessageText("⏳ <b>سرور شما ایجاد می‌شود...</b>\n\nلطفاً منتظر بمانید.\nاطلاعات سرور بزودی ارسال خواهد شد.", {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard(),
        });

        // Create server
        const result = await serverService.createServer(user.id, selection.slug, selection.flavorId, selection.imageId, billingMode);
        const server = result.server;
        const access = result.accessData;
        const password = result.randomPassword;

        // Prepare access message
        const accessMessageLines = [
          "✅ <b>سرور شما آماده شد!</b>",
          "",
          `<b>نام سرور:</b> <code>${server.name}</code>`,
          `<b>وضعیت:</b> ${server.status}`,
        ];

        if (access.ipv4Address) {
          accessMessageLines.push(`<b>آدرس IPv4:</b> <code>${access.ipv4Address}</code>`);
        }
        if (access.ipv6Address) {
          accessMessageLines.push(`<b>آدرس IPv6:</b> <code>${access.ipv6Address}</code>`);
        }

        accessMessageLines.push(
          `<b>نام کاربری:</b> <code>${access.username}</code>`,
          `<b>رمز عبور:</b> <code>${password}</code>`,
        );

        if (access.sshCommand) {
          // Escape HTML special characters in SSH command
          const escapedSshCommand = access.sshCommand.replace(/</g, "&lt;").replace(/>/g, "&gt;");
          accessMessageLines.push(`<b>دستور SSH:</b> <code>${escapedSshCommand}</code>`);
        }

        accessMessageLines.push(
          "",
          "ℹ️ برای اتصال SSH، فایل <code>dvrssh1.pem</code> را از پروژه استفاده کنید.",
          "",
          access.ipv4Address ? "✅ شما می‌توانید اتصال SSH را شروع کنید." : "⏳ آدرس IP هنوز در دست دریافت است. لطفاً چند دقیقه منتظر بمانید.",
        );

        const accessMessage = accessMessageLines.join("\n");

        // Send complete info as NEW message (not edited) - WITHOUT buttons
        const sent = await ctx.api.sendMessage(ctx.from.id, accessMessage, {
          parse_mode: "HTML",
        });

        // Store chat and message id for later polling
        const chatId = ctx.from.id;
        const messageId = (sent as any)?.message_id;
        
        if (messageId) {
          await serverService.storeServerTelegramInfo(server.id, chatId.toString(), messageId);
          logger.info({ serverId: server.id, chatId, messageId }, "Stored Telegram notification info for IP polling");
        }

        // Clean up token
        deleteSelectionState(token);

        logger.info({ serverId: server.id, userId: user.id, ipv4: access.ipv4Address, ipv6: access.ipv6Address }, "Server created and info sent to user");
      } catch (error: any) {
        logger.error(error, "Server creation failed");
        const insufficientBalance = error?.message?.includes("Insufficient wallet balance");
        if (insufficientBalance) {
          await ctx.editMessageText("❌ موجودی کیف پول شما برای خرید سرور کافی نیست. لطفاً ابتدا کیف پول را شارژ کنید.", {
            reply_markup: new InlineKeyboard()
              .text("💳 شارژ کیف پول", "wallet_menu")
              .row()
              .text("🔙 منوی اصلی", "main_menu"),
          });
        } else {
          await ctx.editMessageText(`❌ ${error?.message ?? "Server creation failed."}`, { reply_markup: buildMainMenuKeyboard() });
        }
      }
    });

    bot.callbackQuery(/^toggle_billing:(.*)$/, async (ctx: any) => {
      const [, token] = parseCallbackData(ctx.callbackQuery.data!);
      const selection = getSelectionState(token);
      if (!selection) {
        await ctx.answerCallbackQuery({ text: "Selection expired. Please choose a plan again.", show_alert: true });
        return;
      }
      const newMode = selection.billingMode === "MONTHLY" ? "HOURLY" : "MONTHLY";
      updateSelectionState(token, { billingMode: newMode });
      const plan = await datacenterServiceInstance.getPlanById(selection.slug, selection.flavorId);
      const osName = selection.imageId ? (await datacenterServiceInstance.getOperatingSystemById(selection.imageId))?.name : null;
      const message = buildServerDetailsMessage(plan, osName ?? null, newMode);
      const keyboard = new InlineKeyboard()
        .text("💿 Select Operating System", `select_os:${token}`)
        .row()
        .text(newMode === "MONTHLY" ? "✅ Create Server (Charge monthly)" : "✅ Create Server (Charge hourly)", `create_server_confirm:${token}`)
        .row()
        .text(newMode === "MONTHLY" ? "💲 Billing: Monthly" : "💲 Billing: Hourly", `toggle_billing:${token}`)
        .row()
        .text("🔙 Main menu", "main_menu");
      await ctx.editMessageText(message, { reply_markup: keyboard, parse_mode: "HTML" });
    });

    bot.callbackQuery("wallet_menu", async (ctx: any) => {
      try {
        const user = await ensureAppUser(ctx);
        const summary = await walletService.getWalletSummary(user.id);
        const text = [`💰 Wallet`, `Current Balance: ${formatCurrency(summary.balance)}`, `Total Deposits: ${formatCurrency(summary.totalDeposits)}`, `Total Usage: ${formatCurrency(summary.totalUsage)}`].join("\n");
        await ctx.editMessageText(text, { reply_markup: buildPaymentMethodKeyboard() });
      } catch (error) {
        await ctx.answerCallbackQuery({ text: "Unable to resolve user.", show_alert: true });
      }
    });

    bot.callbackQuery("wallet_increase", async (ctx: any) => {
      await ctx.editMessageText("💳 Select top-up amount", { reply_markup: buildPaymentAmountKeyboard() });
    });

    bot.callbackQuery(/^payment_amount:(.*)$/, async (ctx: any) => {
      const [, amountValue] = parseCallbackData(ctx.callbackQuery.data!);
      const amount = Number(amountValue);
      if (isNaN(amount) || amount < 1000000) {
        await ctx.answerCallbackQuery({ text: "Invalid amount selected.", show_alert: true });
        return;
      }
      try {
        const user = await ensureAppUser(ctx);
        const payment = await paymentService.createPendingPayment(user.id, amount, "CARD_TO_CARD");
        const text = [`📄 Payment instructions`, `Card Number: 1234 5678 9012 3456`, `Card Holder Name: Your Company`, `Amount: ${formatCurrency(amount)}`, `Please take a screenshot of the transfer and upload the receipt below.`, `Payment ID: ${payment.id}`].join("\n");
        await ctx.editMessageText(text, { reply_markup: new InlineKeyboard().text("⬅️ Back", "wallet_menu") });
      } catch (error) {
        await ctx.answerCallbackQuery({ text: "Unable to resolve user.", show_alert: true });
      }
    });

    bot.on("message:photo", async (ctx: any) => {
      try {
        const user = await ensureAppUser(ctx);
        const photoFileId = ctx.message.photo[ctx.message.photo.length - 1]?.file_id;
        const payment = await paymentService.attachReceiptForLatestPendingPayment(user.id, photoFileId);
        if (payment) {
          const caption = `🧾 New wallet recharge receipt\nUser: ${user.telegramId}\nAmount: ${formatCurrency(Number(payment.amount))}\nPayment ID: ${payment.id}`;
          await Promise.allSettled(
            env.ADMIN_IDS.map((adminId: string) => ctx.api.sendPhoto(adminId, photoFileId, { caption }))
          );
          await ctx.reply("✅ Receipt received. An admin will review your payment shortly.");
        }
      } catch (error) {
        // ignore missing user or attachment issues
      }
    });

    bot.callbackQuery("admin_panel", async (ctx: any) => {
      const telegramId = ctx.from?.id.toString();
      if (!telegramId || !adminService.isAdmin(telegramId)) {
        await ctx.answerCallbackQuery({ text: "You are not authorized to access the admin panel.", show_alert: true });
        return;
      }
      // Admin panel: show options for payments and plan pricing
      const keyboard = new InlineKeyboard().text("📝 Pending payments", "admin_pending_payments").row().text("💲 Manage plans/prices", "admin_manage_plans");
      await ctx.editMessageText("🛠 Admin panel", { reply_markup: keyboard });
    });

    bot.callbackQuery("admin_pending_payments", async (ctx: any) => {
      const telegramId = ctx.from?.id.toString();
      if (!telegramId || !adminService.isAdmin(telegramId)) {
        await ctx.answerCallbackQuery({ text: "Unauthorized.", show_alert: true });
        return;
      }
      const pendingPayments = await adminService.getPendingPayments();
      if (pendingPayments.length === 0) {
        await ctx.editMessageText("✅ No pending payments at the moment.");
        return;
      }
      const payment = pendingPayments[0];
      const caption = `📝 Pending payment\nUser: ${payment.user.telegramId}\nAmount: ${formatCurrency(Number(payment.amount))}\nMethod: ${payment.method}\nStatus: ${payment.status}`;
      const keyboard = buildAdminPaymentKeyboard(payment.id);

      try {
        await ctx.deleteMessage(ctx.callbackQuery.message.message_id).catch(() => undefined);
      } catch (error) {
        logger.warn({ error }, "Unable to delete payment review message");
      }

      if (payment.receipt?.filePath) {
        try {
          await ctx.api.sendPhoto(telegramId, payment.receipt.filePath, {
            caption,
            reply_markup: keyboard,
          });
        } catch (error) {
          logger.warn({ error, paymentId: payment.id }, "Unable to send payment receipt to admin");
          await ctx.reply(caption, { reply_markup: keyboard });
        }
      } else {
        await ctx.reply(caption, { reply_markup: keyboard });
      }
    });

    bot.callbackQuery("admin_manage_plans", async (ctx: any) => {
      const telegramId = ctx.from?.id.toString();
      if (!telegramId || !adminService.isAdmin(telegramId)) {
        await ctx.answerCallbackQuery({ text: "Unauthorized.", show_alert: true });
        return;
      }
      const plans = await datacenterServiceInstance.listPlans("infomaniak");
      if (plans.length === 0) {
        await ctx.editMessageText("No plans available to manage.");
        return;
      }
      const keyboard = new InlineKeyboard();
      plans.forEach((p) => keyboard.text(`${p.name} | ${p.vcpus} Core | ${p.ramMb / 1024} GB | ${p.diskGb} GB | ${formatCurrency(p.monthlyPrice ?? 0)}`, `admin_price_set:${p.id}`).row());
      keyboard.text("🔙 Main menu", "main_menu");
      await ctx.editMessageText("Select a plan to set its monthly price:", { reply_markup: keyboard });
    });

    bot.callbackQuery(/^admin_price_set:(.*)$/, async (ctx: any) => {
      const [, externalId] = parseCallbackData(ctx.callbackQuery.data!);
      const telegramId = ctx.from?.id.toString();
      if (!telegramId || !adminService.isAdmin(telegramId)) {
        await ctx.answerCallbackQuery({ text: "Unauthorized.", show_alert: true });
        return;
      }
      setPendingPrice(telegramId, externalId);
      await ctx.editMessageText("Please send the new monthly price in USD as a message (numbers allowed, decimals OK). Example: 20.5");
    });

    // Handle admin text messages for setting price
    bot.on("message:text", async (ctx: any) => {
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId || !adminService.isAdmin(telegramId)) {
        return;
      }
      const pending = getPendingPrice(telegramId);
      if (!pending) {
        return;
      }
      const text = ctx.message?.text?.trim();
      const price = Number(text?.replace(/[^0-9.]/g, ""));
      if (!price || isNaN(price) || price <= 0) {
        await ctx.reply("Invalid price. Please send a numeric monthly price in USD (e.g. 20.5).");
        return;
      }
      try {
        await datacenterServiceInstance.updatePlanPrice(pending.externalId, price);
        clearPendingPrice(telegramId);
        await ctx.reply(`Price updated to ${formatCurrency(price)} for plan ${pending.externalId}`);
      } catch (error: any) {
        logger.error({ error }, "Failed to update plan price");
        await ctx.reply("Failed to update price. Check logs.");
      }
    });

    bot.callbackQuery(/^admin_payment:(approve|reject):(.*)$/, async (ctx: any) => {
      const [, action, paymentId] = parseCallbackData(ctx.callbackQuery.data!);
      const telegramId = ctx.from?.id.toString();
      if (!telegramId || !adminService.isAdmin(telegramId)) {
        await ctx.answerCallbackQuery({ text: "Unauthorized.", show_alert: true });
        return;
      }
      try {
        if (action === "approve") {
          await paymentService.approvePayment(paymentId, telegramId);
          await ctx.answerCallbackQuery({ text: "Payment approved." });
        } else {
          await paymentService.rejectPayment(paymentId, telegramId);
          await ctx.answerCallbackQuery({ text: "Payment rejected." });
        }

        if (ctx.callbackQuery?.message?.message_id) {
          try {
            await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
          } catch (error) {
            logger.warn({ error }, "Unable to delete payment review message after admin action");
          }
        }

        await ctx.reply(action === "approve" ? "✅ Payment approved and wallet updated." : "❌ Payment rejected.");
      } catch (error: any) {
        logger.error({ error }, "Admin payment action failed");
        await ctx.answerCallbackQuery({ text: error?.message ?? "Action failed.", show_alert: true });
      }
    });

    bot.callbackQuery("my_servers", async (ctx: any) => {
      try {
        const user = await ensureAppUser(ctx);
        const servers = await serverService.getUserServers(user.id);
        
        if (servers.length === 0) {
          await ctx.editMessageText("📦 <b>My Servers</b>\n\nYou don't have any servers yet. Create one to get started!", {
            reply_markup: new InlineKeyboard().text("🖥 Create Server", "create_server").row().text("🔙 Main menu", "main_menu"),
            parse_mode: "HTML",
          });
          return;
        }

        const serverList = servers.map(s => `🖥 ${s.name} (${s.status})`).join("\n");
        await ctx.editMessageText(`📦 <b>My Servers</b> (${servers.length})\n\n${serverList}\n\nSelect a server to view details and manage it:`, {
          reply_markup: buildServersListKeyboard(servers),
          parse_mode: "HTML",
        });
      } catch (error) {
        logger.error({ error }, "Failed to list user servers");
        await ctx.answerCallbackQuery({ text: "Failed to load servers.", show_alert: true });
      }
    });

    bot.callbackQuery(/^server_view:(.*)$/, async (ctx: any) => {
      try {
        const [, serverId] = parseCallbackData(ctx.callbackQuery.data!);
        const server = await serverService.getServerDetails(serverId);
        
        if (!server) {
          await ctx.answerCallbackQuery({ text: "Server not found.", show_alert: true });
          return;
        }

        const user = await ensureAppUser(ctx);
        if (server.userId !== user.id) {
          await ctx.answerCallbackQuery({ text: "Unauthorized.", show_alert: true });
          return;
        }

        const statusEmoji = server.status === 'ACTIVE' ? '🟢' : server.status === 'STOPPED' ? '🔴' : '⚪';
        const message = [
          `<b>📊 Server: ${server.name}</b>`,
          ``,
          `<b>📋 وضعیت سرور</b>`,
          `${statusEmoji} <b>Status:</b> ${server.status}`,
          `⏱️ <b>Created:</b> ${server.createdAt.toLocaleDateString('fa-IR')}`,
          ``,
          `<b>💻 Server Specs</b>`,
          `🔧 <b>Plan:</b> ${server.plan?.name}`,
          `💾 <b>CPU:</b> ${server.plan?.vcpus} Core(s)`,
          `🎛️ <b>RAM:</b> ${Math.round(server.plan?.ramMb ?? 0 / 1024)} GB`,
          `💽 <b>Disk:</b> ${server.plan?.diskGb} GB`,
          `🌐 <b>OS:</b> ${server.operatingSystem?.name}`,
          ``,
          `<b>🌍 Datacenter</b>`,
          `📍 <b>Region:</b> ${server.datacenter?.name}`,
          ``,
          `<b>🔐 اطلاعات دسترسی</b>`,
          server.ipv4Address ? `IPv4: <code>${server.ipv4Address}</code>` : `IPv4: <code>&lt;Pending&gt;</code>`,
          server.ipv6Address ? `IPv6: <code>${server.ipv6Address}</code>` : `IPv6: <code>&lt;Pending&gt;</code>`,
          `Username: <code>root</code>`,
          ``,
          `<b>💰 Billing</b>`,
          `💵 <b>Price:</b> ${formatCurrency(Number(server.hourlyPrice))} / hour`,
          `📊 <b>Renewal:</b> Hourly`,
        ].join("\n");

        await ctx.editMessageText(message, {
          reply_markup: buildServerDetailsKeyboard(serverId),
          parse_mode: "HTML",
        });
      } catch (error) {
        logger.error({ error }, "Failed to load server details");
        await ctx.answerCallbackQuery({ text: "Failed to load server details.", show_alert: true });
      }
    });

    bot.callbackQuery(/^server_action:(.+):(start|stop|reboot_soft|reboot_hard|delete)$/, async (ctx: any) => {
      try {
        const [, serverId, action] = parseCallbackData(ctx.callbackQuery.data!);
        const user = await ensureAppUser(ctx);
        
        const server = await serverService.getServerDetails(serverId);
        if (!server || server.userId !== user.id) {
          await ctx.answerCallbackQuery({ text: "Unauthorized.", show_alert: true });
          return;
        }

        const actionMessages: Record<string, string> = {
          start: "⏳ Starting server...",
          stop: "⏳ Stopping server...",
          reboot_soft: "⏳ Performing soft reboot...",
          reboot_hard: "⏳ Performing hard reboot...",
          delete: "⏳ Deleting server...",
        };

        await ctx.editMessageText(actionMessages[action] ?? "⏳ Processing...", {
          reply_markup: new InlineKeyboard(),
          parse_mode: "HTML",
        });

        try {
          if (action === "start") {
            await serverService.startServer(serverId);
            await ctx.editMessageText("✅ <b>Server started successfully!</b>\n\nIt may take a few moments to become fully operational.", {
              reply_markup: new InlineKeyboard().text("🔄 Refresh", `server_view:${serverId}`).row().text("🔙 Back", "my_servers"),
              parse_mode: "HTML",
            });
          } else if (action === "stop") {
            await serverService.stopServer(serverId);
            await ctx.editMessageText("✅ <b>Server stopped successfully!</b>", {
              reply_markup: new InlineKeyboard().text("🔄 Refresh", `server_view:${serverId}`).row().text("🔙 Back", "my_servers"),
              parse_mode: "HTML",
            });
          } else if (action === "reboot_soft") {
            await serverService.rebootServer(serverId, 'SOFT');
            await ctx.editMessageText("✅ <b>Soft reboot initiated!</b>\n\nThe server will restart gracefully.", {
              reply_markup: new InlineKeyboard().text("🔄 Refresh", `server_view:${serverId}`).row().text("🔙 Back", "my_servers"),
              parse_mode: "HTML",
            });
          } else if (action === "reboot_hard") {
            await serverService.rebootServer(serverId, 'HARD');
            await ctx.editMessageText("✅ <b>Hard reboot initiated!</b>\n\nThe server will restart immediately.", {
              reply_markup: new InlineKeyboard().text("🔄 Refresh", `server_view:${serverId}`).row().text("🔙 Back", "my_servers"),
              parse_mode: "HTML",
            });
          } else if (action === "delete") {
            await serverService.deleteServer(serverId);
            await ctx.editMessageText("✅ <b>Server deleted successfully!</b>\n\nThe server has been removed from your account.", {
              reply_markup: new InlineKeyboard().text("📦 My Servers", "my_servers").row().text("🔙 Main menu", "main_menu"),
              parse_mode: "HTML",
            });
          }
          logger.info({ serverId, userId: user.id, action }, "Server action completed");
        } catch (actionError: any) {
          logger.error({ actionError, serverId, action }, "Server action failed");
          await ctx.editMessageText(
            `❌ <b>Action failed!</b>\n\n${actionError?.message ?? "An error occurred while performing the action."}`,
            {
              reply_markup: new InlineKeyboard().text("🔄 Refresh", `server_view:${serverId}`).row().text("🔙 Back", "my_servers"),
              parse_mode: "HTML",
            }
          );
        }
      } catch (error) {
        logger.error({ error }, "Server action handler error");
        await ctx.answerCallbackQuery({ text: "An error occurred.", show_alert: true });
      }
    });

    bot.callbackQuery("main_menu", async (ctx: any) => {
      if (ctx.callbackQuery?.message?.message_id) {
        try {
          await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
        } catch (error) {
          logger.warn({ error }, "Unable to delete message before returning to main menu");
        }
      }
      await ctx.reply("Main menu", { reply_markup: buildMainMenuKeyboard() });
    });

    bot.catch((err: any) => {
      logger.error({ error: err }, "Unhandled bot error");
    });
  }
}
