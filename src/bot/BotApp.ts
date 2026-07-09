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
} from "./keyboard/menus";
import { formatCurrency } from "../modules/common/formatter";
import { createSelectionState, getSelectionState, updateSelectionState } from "./callbackStore";
import { setPendingPrice, getPendingPrice, clearPendingPrice } from "./adminPriceStore";

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
        const server = await serverService.createServer(user.id, selection.slug, selection.flavorId, selection.imageId, billingMode);
        await ctx.editMessageText(`✅ Server created successfully!\nServer name: ${server.name}\nStatus: ${server.status}`, { reply_markup: buildMainMenuKeyboard() });
      } catch (error) {
        logger.error(error, "Server creation failed");
        await ctx.editMessageText("❌ Server creation failed. Please try again later or contact support.", { reply_markup: buildMainMenuKeyboard() });
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
        const payment = await paymentService.attachReceiptForLatestPendingPayment(user.id, ctx.message.photo[0].file_id);
        if (payment) {
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
      await ctx.editMessageText(
        `📝 Pending payment\nUser: ${payment.user.telegramId}\nAmount: ${formatCurrency(Number(payment.amount))}\nMethod: ${payment.method}\nStatus: ${payment.status}`,
        { reply_markup: buildAdminPaymentKeyboard(payment.id) }
      );
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
          await ctx.editMessageText("✅ Payment approved and wallet updated.");
        } else {
          await paymentService.rejectPayment(paymentId, telegramId);
          await ctx.editMessageText("❌ Payment rejected.");
        }
      } catch (error: any) {
        logger.error({ error }, "Admin payment action failed");
        await ctx.answerCallbackQuery({ text: error?.message ?? "Action failed.", show_alert: true });
      }
    });

    bot.callbackQuery("main_menu", async (ctx: any) => {
      await ctx.editMessageText("Main menu", { reply_markup: buildMainMenuKeyboard() });
    });

    bot.catch((err: any) => {
      logger.error({ error: err }, "Unhandled bot error");
    });
  }
}
