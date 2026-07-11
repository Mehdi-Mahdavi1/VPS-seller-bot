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
  buildRebuildOsKeyboard,
} from "./keyboard/menus";
import { formatCurrency } from "../modules/common/formatter";
import { env } from "../config/env";
import { 
  BillingMode,
  createSelectionState, 
  getSelectionState, 
  updateSelectionState, 
  deleteSelectionState,
  createRebuildState,
  getRebuildImageData,
  deleteRebuildImageToken,
} from "./callbackStore";
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

type BillingLabel = "ساعتی" | "ماهانه";

function getDisplayBillingMode(mode?: BillingMode): BillingLabel {
  return mode === "MONTHLY" ? "ماهانه" : "ساعتی";
}

function buildServerDetailsMessage(plan: any, osName: string | null, billingMode: BillingLabel | BillingMode = "ساعتی"): string {
  const displayMode: BillingLabel = billingMode === "MONTHLY" || billingMode === "HOURLY"
    ? getDisplayBillingMode(billingMode as BillingMode)
    : billingMode;
  const monthly = Number(plan.monthlyPrice ?? 0);
  const hourly = monthly / 720;
  const priceLine = displayMode === "ماهانه" ? `${formatCurrency(monthly)} / ماهانه` : `${formatCurrency(hourly)} / ساعتی`;
  return [
    `🖥 <b>جزئیات پلن</b>`,
    `نام سرور: ${plan.name}`,
    `پردازنده: ${plan.vcpus} Core(s)`,
    `رم: ${plan.ramMb / 1024} GB`,
    `دیسک: ${plan.diskGb} GB`,
    `ترافیک: 1 TB`,
    `قیمت: ${priceLine}`,
    `سیستم عامل: ${osName ?? "انتخاب نشده"}`,
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
      const text = ["به ربات خرید سرور مجازی سیموریکس خوش آمدید 👋", "برای ادامه یکی از گزینه های زیر را انتخاب کنید "].join("\n");
      await ctx.reply(text, { reply_markup: buildMainMenuKeyboard() });
    });

    bot.callbackQuery("create_server", async (ctx: any) => {
      const datacenters = await datacenterServiceInstance.getDatacenterSummaries();
      await ctx.editMessageText("🖥 لیست دیتاسنرتر ها\nدیتاسنتر مورد نظر خود را انتخاب کنید ", {
        reply_markup: buildDatacenterKeyboard(datacenters),
      });
    });

    bot.callbackQuery(/^datacenter_select:(.*)$/, async (ctx: any) => {
      const [, slug] = parseCallbackData(ctx.callbackQuery.data!);
      const plans = await datacenterServiceInstance.listPlans(slug);
      if (plans.length === 0) {
        await ctx.answerCallbackQuery({ text: "هیچ پلنی برای دیتاسنتر انتخاب شده در دسترس نیست.", show_alert: true });
        return;
      }
      await ctx.editMessageText("لطفا مشخصات سرویس خود را انتخاب کنید \n قیمت های درج شده ماهانه میباشند ", { reply_markup: buildCreateServerKeyboard(slug, plans) });
    });

    bot.callbackQuery(/^plan_select:(.*):(.*)$/, async (ctx: any) => {
      const [, slug, flavorId] = parseCallbackData(ctx.callbackQuery.data!);
      const plan = await datacenterServiceInstance.getPlanById(slug, flavorId);
      if (!plan) {
        await ctx.answerCallbackQuery({ text: "پلن انتخاب شده دیگر در دسترس نیست.", show_alert: true });
        return;
      }
      const token = createSelectionState({ slug, flavorId });
      const message = buildServerDetailsMessage(plan, null, "ساعتی");
      const keyboard = new InlineKeyboard()
        .text("💿 انتخاب سیستم عامل", `select_os:${token}`)
        .row()
        .text("🔁 صورتحساب: ساعتی", `toggle_billing:${token}`)
        .row()
        .text("✅ ایجاد سرور (شارژ ساعتی)", `create_server_confirm:${token}`)
        .row()
        .text("🔙 منوی اصلی", "main_menu");
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
      await ctx.editMessageText("💿 سیستم عامل مورد نظر را انتخاب کنید  : ", { reply_markup: keyboard });
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
        await ctx.answerCallbackQuery({ text: "امکان بارگذاری سیستم عامل انتخاب شده وجود ندارد.", show_alert: true });
        return;
      }
      updateSelectionState(token, { imageId });
      selection = getSelectionState(token)!;
      const message = buildServerDetailsMessage(plan, os.name, selection.billingMode ?? "HOURLY");
      const keyboard = new InlineKeyboard()
        .text("💿 انتخاب سیستم عامل", `select_os:${token}`)
        .row()
        .text(selection.billingMode === "MONTHLY" ? "✅ ایجاد سرور (شارژ ماهانه)" : "✅ ایجاد سرور (شارژ ساعتی)", `create_server_confirm:${token}`)
        .row()
        .text(selection.billingMode === "MONTHLY" ? "💲 صورتحساب: ماهانه" : "💲 صورتحساب: ساعتی", `toggle_billing:${token}`)
        .row()
        .text("🔙 منوی اصلی", "main_menu");
      await ctx.editMessageText(message, { reply_markup: keyboard, parse_mode: "HTML" });
    });

    bot.callbackQuery(/^create_server_confirm:(.*)$/, async (ctx: any) => {
      const [, token] = parseCallbackData(ctx.callbackQuery.data!);
      const selection = getSelectionState(token);
      if (!selection?.imageId) {
        await ctx.answerCallbackQuery({ text: "لطفاً قبل از ایجاد سرور یک سیستم عامل انتخاب کنید.", show_alert: true });
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
          await ctx.editMessageText(`❌ ${error?.message ?? "ایجاد سرور با خطا مواجه شد."}`, { reply_markup: buildMainMenuKeyboard() });
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
      const newMode: BillingMode = selection.billingMode === "MONTHLY" ? "HOURLY" : "MONTHLY";
      updateSelectionState(token, { billingMode: newMode });
      const plan = await datacenterServiceInstance.getPlanById(selection.slug, selection.flavorId);
      const osName = selection.imageId ? (await datacenterServiceInstance.getOperatingSystemById(selection.imageId))?.name : null;
      const message = buildServerDetailsMessage(plan, osName ?? null, newMode);
      const keyboard = new InlineKeyboard()
        .text("💿 انتخاب سیستم عامل", `select_os:${token}`)
        .row()
        .text(newMode === "MONTHLY" ? "✅ ایجاد سرور (شارژ ماهانه)" : "✅ ایجاد سرور (شارژ ساعتی)", `create_server_confirm:${token}`)
        .row()
        .text(newMode === "MONTHLY" ? "💲 صورتحساب: ماهانه" : "💲 صورتحساب: ساعتی", `toggle_billing:${token}`)
        .row()
        .text("🔙 منوی اصلی", "main_menu");
      await ctx.editMessageText(message, { reply_markup: keyboard, parse_mode: "HTML" });
    });

    bot.callbackQuery("wallet_menu", async (ctx: any) => {
      try {
        const user = await ensureAppUser(ctx);
        const summary = await walletService.getWalletSummary(user.id);
        const text = [ `موجودی کیف پول \n برای افزایش موجودی گزینه کارت به کار را انتخاب کنید : \n ${formatCurrency(summary.balance)}`].join("\n");
        await ctx.editMessageText(text, { reply_markup: buildPaymentMethodKeyboard() });
      } catch (error) {
        await ctx.answerCallbackQuery({ text: "Unable to resolve user.", show_alert: true });
      }
    });

    bot.callbackQuery("wallet_increase", async (ctx: any) => {
      await ctx.editMessageText("💳  مورد نظر برای شارژ کیف پول را نتخاب کنید مبلغ: \n حداقل مبلغ شارژ 0.5 دلار میباشد ", { reply_markup: buildPaymentAmountKeyboard() });
    });

    bot.callbackQuery(/^payment_amount:(.*)$/, async (ctx: any) => {
      const [, amountValue] = parseCallbackData(ctx.callbackQuery.data!);
      const amount = Number(amountValue);
      if (isNaN(amount) || amount < 0.5) {
        await ctx.answerCallbackQuery({ text: "مقدار انتخاب شده نامعتبر است.", show_alert: true });
        return;
      }
      try {
        const user = await ensureAppUser(ctx);
        const payment = await paymentService.createPendingPayment(user.id, amount, "CARD_TO_CARD");
        const text = [`📄 راهنمای پرداخت`, `شماره کارت: 1234 5678 9012 3456`, `نام صاحب کارت: Your Company`, `مبلغ: ${formatCurrency(amount)}`, `لطفاً از انتقال خود اسکرین‌شات بگیرید و رسید را در زیر ارسال کنید.`, `شناسه پرداخت: ${payment.id}`].join("\n");
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
          const caption = `🧾 رسید شارژ کیف پول\nکاربر: ${user.telegramId}\nمبلغ: ${formatCurrency(Number(payment.amount))}\nشناسه پرداخت: ${payment.id}`;
          await Promise.allSettled(
            env.ADMIN_IDS.map((adminId: string) => ctx.api.sendPhoto(adminId, photoFileId, { caption }))
          );
          await ctx.reply("✅ رسید دریافت شد. یک مدیر به زودی پرداخت شما را بررسی خواهد کرد.");
        }
      } catch (error) {
        // ignore missing user or attachment issues
      }
    });

    bot.callbackQuery("admin_panel", async (ctx: any) => {
      const telegramId = ctx.from?.id.toString();
      if (!telegramId || !adminService.isAdmin(telegramId)) {
        await ctx.answerCallbackQuery({ text: "شما اجازه دسترسی به پنل ادمین را ندارید.", show_alert: true });
        return;
      }
      // Admin panel: show options for payments and plan pricing
      const keyboard = new InlineKeyboard().text("📝 تایید واریزی ها", "admin_pending_payments").row().text("💲 قیمت گذاری ", "admin_manage_plans");
      await ctx.editMessageText("🛠 Admin panel", { reply_markup: keyboard });
    });

    bot.callbackQuery("admin_pending_payments", async (ctx: any) => {
      const telegramId = ctx.from?.id.toString();
      if (!telegramId || !adminService.isAdmin(telegramId)) {
        await ctx.answerCallbackQuery({ text: "دسترسی شما مجاز نیست.", show_alert: true });
        return;
      }
      const pendingPayments = await adminService.getPendingPayments();
      if (pendingPayments.length === 0) {
        await ctx.editMessageText("✅ در حال حاضر هیچ پرداخت در انتظار تأیید وجود ندارد.");
        return;
      }
      const payment = pendingPayments[0];
      const caption = `📝 پرداخت در انتظار تأیید\nکاربر: ${payment.user.telegramId}\nمبلغ: ${formatCurrency(Number(payment.amount))}\nروش: ${payment.method}\nوضعیت: ${payment.status}`;
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
        await ctx.answerCallbackQuery({ text: "دسترسی شما مجاز نیست.", show_alert: true });
        return;
      }
      const plans = await datacenterServiceInstance.listPlans("infomaniak");
      if (plans.length === 0) {
        await ctx.editMessageText("هیچ پلنی برای مدیریت موجود نیست.");
        return;
      }
      const keyboard = new InlineKeyboard();
      plans.forEach((p) => keyboard.text(`${p.name} | ${p.vcpus} Core | ${p.ramMb / 1024} GB | ${p.diskGb} GB | ${formatCurrency(p.monthlyPrice ?? 0)}`, `admin_price_set:${p.id}`).row());
      keyboard.text("🔙 منوی اصلی", "main_menu");
      await ctx.editMessageText("یک پلن را برای تنظیم قیمت ماهانه انتخاب کنید:", { reply_markup: keyboard });
    });

    bot.callbackQuery(/^admin_price_set:(.*)$/, async (ctx: any) => {
      const [, externalId] = parseCallbackData(ctx.callbackQuery.data!);
      const telegramId = ctx.from?.id.toString();
      if (!telegramId || !adminService.isAdmin(telegramId)) {
        await ctx.answerCallbackQuery({ text: "Unauthorized.", show_alert: true });
        return;
      }
      setPendingPrice(telegramId, externalId);
      await ctx.editMessageText("لطفاً قیمت ماهانه جدید را به صورت عددی به دلار ارسال کنید. مثال: 20.5");
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
        await ctx.reply("قیمت نامعتبر است. لطفاً یک عدد معتبر برای قیمت ماهانه به دلار ارسال کنید (مثلاً 20.5)." );
        return;
      }
      try {
        await datacenterServiceInstance.updatePlanPrice(pending.externalId, price);
        clearPendingPrice(telegramId);
        await ctx.reply(`قیمت برای پلن ${pending.externalId} به ${formatCurrency(price)} به‌روزرسانی شد.`);
      } catch (error: any) {
        logger.error({ error }, "Failed to update plan price");
        await ctx.reply("به‌روزرسانی قیمت با خطا مواجه شد. لاگ‌ها را بررسی کنید.");
      }
    });

    bot.callbackQuery(/^admin_payment:(approve|reject):(.*)$/, async (ctx: any) => {
      const [, action, paymentId] = parseCallbackData(ctx.callbackQuery.data!);
      const telegramId = ctx.from?.id.toString();
      if (!telegramId || !adminService.isAdmin(telegramId)) {
        await ctx.answerCallbackQuery({ text: "دسترسی شما مجاز نیست.", show_alert: true });
        return;
      }
      try {
        if (action === "approve") {
          await paymentService.approvePayment(paymentId, telegramId);
          await ctx.answerCallbackQuery({ text: "پرداخت تأیید شد." });
        } else {
          await paymentService.rejectPayment(paymentId, telegramId);
          await ctx.answerCallbackQuery({ text: "پرداخت رد شد." });
        }

        if (ctx.callbackQuery?.message?.message_id) {
          try {
            await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
          } catch (error) {
            logger.warn({ error }, "Unable to delete payment review message after admin action");
          }
        }

        await ctx.reply(action === "approve" ? "✅ پرداخت تأیید شد و کیف پول به‌روزرسانی گردید." : "❌ پرداخت رد شد.");
      } catch (error: any) {
        logger.error({ error }, "Admin payment action failed");
        await ctx.answerCallbackQuery({ text: error?.message ?? "عملیات با خطا مواجه شد.", show_alert: true });
      }
    });

    bot.callbackQuery("my_servers", async (ctx: any) => {
      try {
        const user = await ensureAppUser(ctx);
        const servers = await serverService.getUserServers(user.id);
        
        if (servers.length === 0) {
          await ctx.editMessageText("📦 <b>سرویس‌های من</b>\n\nهنوز هیچ سروری ندارید. برای شروع یکی بسازید!", {
            reply_markup: new InlineKeyboard().text("🖥 ایجاد سرور", "create_server").row().text("🔙 منوی اصلی", "main_menu"),
            parse_mode: "HTML",
          });
          return;
        }

        const serverList = servers.map(s => `🖥 ${s.name} (${s.status})`).join("\n");
        await ctx.editMessageText(`📦 <b>سرویس‌های من</b> (${servers.length})\n\n${serverList}\n\nبرای مشاهده جزئیات و مدیریت، یک سرور را انتخاب کنید:`, {
          reply_markup: buildServersListKeyboard(servers),
          parse_mode: "HTML",
        });
      } catch (error) {
        logger.error({ error }, "Failed to list user servers");
        await ctx.answerCallbackQuery({ text: "بارگذاری سرورها با خطا مواجه شد.", show_alert: true });
      }
    });

    bot.callbackQuery(/^server_view:(.*)$/, async (ctx: any) => {
      try {
        const [, serverId] = parseCallbackData(ctx.callbackQuery.data!);
        const server = await serverService.getServerDetails(serverId);
        
        if (!server) {
          await ctx.answerCallbackQuery({ text: "سرور یافت نشد.", show_alert: true });
          return;
        }

        const user = await ensureAppUser(ctx);
        if (server.userId !== user.id) {
          await ctx.answerCallbackQuery({ text: "دسترسی شما مجاز نیست.", show_alert: true });
          return;
        }

        const statusEmoji = server.status === 'ACTIVE' ? '🟢' : server.status === 'STOPPED' ? '🔴' : '⚪';
        const message = [
          `<b>📊 سرور: ${server.name}</b>`,
          ``,
          `<b>📋 وضعیت سرور</b>`,
          `${statusEmoji} <b>وضعیت:</b> ${server.status}`,
          `⏱️ <b>تاریخ ساخت:</b> ${server.createdAt.toLocaleDateString('fa-IR')}`,
          ``,
          `<b>💻 مشخصات سرور</b>`,
          `🔧 <b>پلن:</b> ${server.plan?.name}`,
          `💾 <b>CPU:</b> ${server.plan?.vcpus} هسته`,
          `🎛️ <b>RAM:</b> ${Math.round((server.plan?.ramMb ?? 0) / 1024)} GB`,
          `💽 <b>دیسک:</b> ${server.plan?.diskGb} GB`,
          `🌐 <b>سیستم عامل:</b> ${server.operatingSystem?.name}`,
          ``,
          `<b>🌍 دیتاسنتر</b>`,
          `📍 <b>منطقه:</b> ${server.datacenter?.name}`,
          ``,
          `<b>🔐 اطلاعات دسترسی</b>`,
          server.ipv4Address ? `IPv4: <code>${server.ipv4Address}</code>` : `IPv4: <code>&lt;در انتظار&gt;</code>`,
          server.ipv6Address ? `IPv6: <code>${server.ipv6Address}</code>` : `IPv6: <code>&lt;در انتظار&gt;</code>`,
          `نام کاربری: <code>root</code>`,
          ``,
          `<b>💰 صورتحساب</b>`,
          `💵 <b>قیمت:</b> ${formatCurrency(Number(server.hourlyPrice))} / ساعت`,
          `📊 <b>تمدید:</b> ساعتی`,
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
          await ctx.answerCallbackQuery({ text: "دسترسی شما مجاز نیست.", show_alert: true });
          return;
        }

        const actionMessages: Record<string, string> = {
          start: "⏳ در حال راه‌اندازی سرور...",
          stop: "⏳ در حال متوقف‌کردن سرور...",
          reboot_soft: "⏳ در حال اجرای ری‌استارت نرم...",
          reboot_hard: "⏳ در حال اجرای ری‌استارت سخت...",
          delete: "⏳ در حال حذف سرور...",
        };

        await ctx.editMessageText(actionMessages[action] ?? "⏳ در حال پردازش...", {
          reply_markup: new InlineKeyboard(),
          parse_mode: "HTML",
        });

        try {
          if (action === "start") {
            await serverService.startServer(serverId);
            await ctx.editMessageText("✅ <b>سرور با موفقیت راه‌اندازی شد!</b>\n\nممکن است چند لحظه طول بکشد تا به‌طور کامل آماده استفاده شود.", {
              reply_markup: new InlineKeyboard().text("🔄 تازه‌سازی", `server_view:${serverId}`).row().text("🔙 بازگشت", "my_servers"),
              parse_mode: "HTML",
            });
          } else if (action === "stop") {
            await serverService.stopServer(serverId);
            await ctx.editMessageText("✅ <b>سرور با موفقیت متوقف شد!</b>", {
              reply_markup: new InlineKeyboard().text("🔄 تازه‌سازی", `server_view:${serverId}`).row().text("🔙 بازگشت", "my_servers"),
              parse_mode: "HTML",
            });
          } else if (action === "reboot_soft") {
            await serverService.rebootServer(serverId, 'SOFT');
            await ctx.editMessageText("✅ <b>ری‌استارت نرم آغاز شد!</b>\n\nسرور به‌صورت نرم راه‌اندازی مجدد می‌شود.", {
              reply_markup: new InlineKeyboard().text("🔄 تازه‌سازی", `server_view:${serverId}`).row().text("🔙 بازگشت", "my_servers"),
              parse_mode: "HTML",
            });
          } else if (action === "reboot_hard") {
            await serverService.rebootServer(serverId, 'HARD');
            await ctx.editMessageText("✅ <b>ری‌استارت سخت آغاز شد!</b>\n\nسرور بلافاصله راه‌اندازی مجدد می‌شود.", {
              reply_markup: new InlineKeyboard().text("🔄 تازه‌سازی", `server_view:${serverId}`).row().text("🔙 بازگشت", "my_servers"),
              parse_mode: "HTML",
            });
          } else if (action === "delete") {
            await serverService.deleteServer(serverId);
            await ctx.editMessageText("✅ <b>سرور با موفقیت حذف شد!</b>\n\nسرور از حساب شما حذف شده است.", {
              reply_markup: new InlineKeyboard().text("📦 سرویس‌های من", "my_servers").row().text("🔙 منوی اصلی", "main_menu"),
              parse_mode: "HTML",
            });
          }
          logger.info({ serverId, userId: user.id, action }, "Server action completed");
        } catch (actionError: any) {
          logger.error({ actionError, serverId, action }, "Server action failed");
          await ctx.editMessageText(
            `❌ <b>عملیات با خطا مواجه شد!</b>\n\n${actionError?.message ?? "در حین انجام عملیات خطایی رخ داد."}`,
            {
              reply_markup: new InlineKeyboard().text("🔄 تازه‌سازی", `server_view:${serverId}`).row().text("🔙 بازگشت", "my_servers"),
              parse_mode: "HTML",
            }
          );
        }
      } catch (error) {
        logger.error({ error }, "Server action handler error");
        await ctx.answerCallbackQuery({ text: "An error occurred.", show_alert: true });
      }
    });

    bot.callbackQuery(/^server_rebuild:(.*)$/, async (ctx: any) => {
      try {
        const [, serverId] = parseCallbackData(ctx.callbackQuery.data!);
        const user = await ensureAppUser(ctx);
        
        const server = await serverService.getServerDetails(serverId);
        if (!server || server.userId !== user.id) {
          await ctx.answerCallbackQuery({ text: "Unauthorized.", show_alert: true });
          return;
        }

        const images = await datacenterServiceInstance.listOperatingSystems(server.datacenter?.slug ?? "infomaniak");
        if (images.length === 0) {
          await ctx.answerCallbackQuery({ text: "هیچ سیستم عاملی در دسترس نیست.", show_alert: true });
          return;
        }

        const imageTokens = createRebuildState(serverId, images);
        await ctx.editMessageText("💿 <b>انتخاب سیستم عامل برای بازنصب</b>\n\n⚠️ <i>این عملیات همه داده‌های سرور را پاک می‌کند و سیستم عامل انتخابی را نصب می‌کند.</i>", {
          reply_markup: buildRebuildOsKeyboard(imageTokens, images),
          parse_mode: "HTML",
        });
      } catch (error) {
        logger.error({ error }, "Rebuild OS selection failed");
        await ctx.answerCallbackQuery({ text: "Failed to load operating systems.", show_alert: true });
      }
    });

    bot.callbackQuery(/^rebuild_os_select:(.+)$/, async (ctx: any) => {
      try {
        const [, imageToken] = parseCallbackData(ctx.callbackQuery.data!);
        const rebuildData = getRebuildImageData(imageToken);
        
        if (!rebuildData) {
          await ctx.answerCallbackQuery({ text: "Selection expired. Please try again.", show_alert: true });
          return;
        }

        const { serverId, imageId } = rebuildData;
        const user = await ensureAppUser(ctx);
        
        const server = await serverService.getServerDetails(serverId);
        if (!server || server.userId !== user.id) {
          deleteRebuildImageToken(imageToken);
          await ctx.answerCallbackQuery({ text: "Unauthorized.", show_alert: true });
          return;
        }

        const image = await datacenterServiceInstance.getOperatingSystemById(imageId);
        if (!image) {
          await ctx.answerCallbackQuery({ text: "سیستم عامل مورد نظر یافت نشد.", show_alert: true });
          return;
        }

        await ctx.editMessageText(`⏳ <b>در حال بازنصب سرور با ${image.name}...</b>\n\nاین فرآیند ممکن است چند دقیقه طول بکشد.`, {
          reply_markup: new InlineKeyboard(),
          parse_mode: "HTML",
        });

        try {
          await serverService.rebuildServer(serverId, imageId);
          await ctx.editMessageText(`✅ <b>بازنصب سرور با موفقیت آغاز شد!</b>\n\n🖥️ <b>سیستم عامل جدید:</b> ${image.name}\n\n⏱️ در طول فرآیند بازنصب سرور در دسترس نخواهد بود. چند دقیقه صبر کنید.`, {
            reply_markup: new InlineKeyboard().text("🔄 Refresh", `server_view:${serverId}`).row().text("🔙 Back", "my_servers"),
            parse_mode: "HTML",
          });
          logger.info({ serverId, userId: user.id, imageId }, "Server rebuild initiated");
        } catch (rebuildError: any) {
          logger.error({ rebuildError, serverId, imageId }, "Server rebuild failed");
          await ctx.editMessageText(
            `❌ <b>بازنصب با خطا مواجه شد!</b>\n\n${rebuildError?.message ?? "در حین بازنصب خطایی رخ داد."}`,
            {
              reply_markup: new InlineKeyboard().text("🔄 Refresh", `server_view:${serverId}`).row().text("🔙 Back", "my_servers"),
              parse_mode: "HTML",
            }
          );
        } finally {
          deleteRebuildImageToken(imageToken);
        }
      } catch (error) {
        logger.error({ error }, "Rebuild confirmation handler error");
        await ctx.answerCallbackQuery({ text: "An error occurred.", show_alert: true });
      }
    });

    bot.callbackQuery(/^rebuild_cancel$/, async (ctx: any) => {
      try {
        await ctx.editMessageText("بازنصب لغو شد.", {
          reply_markup: new InlineKeyboard().text("🔙 بازگشت به سرویس‌ها", "my_servers"),
        });
      } catch (error) {
        logger.error({ error }, "Rebuild cancel handler error");
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
      await ctx.reply("منوی اصلی", { reply_markup: buildMainMenuKeyboard() });
    });

    bot.catch((err: any) => {
      logger.error({ error: err }, "Unhandled bot error");
    });
  }
}
