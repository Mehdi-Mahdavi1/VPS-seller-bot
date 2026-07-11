import { InlineKeyboard } from "grammy";
import { FlavorDto, ImageDto } from "../../modules/common/types";
import { formatCurrency } from "../../modules/common/formatter";

export const buildMainMenuKeyboard = (): InlineKeyboard =>
  new InlineKeyboard()
    .text("🖥 خرید سرویس", "create_server")
    .row()
    .text("💰 کیف پول", "wallet_menu")
    .text("📦 سرویس‌های من", "my_servers")
    .row()
    .text("👤 پروفایل", "profile")
    .text("📞 پشتیبانی", "support")
    .row()
    .text("⚙ تنظیمات", "settings")
    .text("🛠 ادمین", "admin_panel");

export const buildDatacenterKeyboard = (datacenters: Array<{ slug: string; name: string }>) => {
  const keyboard = new InlineKeyboard();
  datacenters.forEach((datacenter) => keyboard.text(datacenter.name, `datacenter_select:${datacenter.slug}`));
  return keyboard;
};

export const buildCreateServerKeyboard = (slug: string, plans: FlavorDto[]) => {
  const keyboard = new InlineKeyboard();
  plans.forEach((plan) => keyboard.text(`${plan.name} | ${plan.vcpus} Core | ${plan.ramMb / 1024} GB | 1 TB | ${formatCurrency(plan.monthlyPrice ?? 0)}`, `plan_select:${slug}:${plan.id}`).row());
  keyboard.text("🔙 منوی اصلی", "main_menu");
  return keyboard;
};

export const buildOsMenuKeyboard = (token: string, images: ImageDto[], backCallback: string) => {
  const keyboard = new InlineKeyboard();
  images.forEach((image) => keyboard.text(image.name, `os_select:${token}:${image.id}`).row());
  keyboard.text("🔙 بازگشت", backCallback);
  return keyboard;
};

export const buildPaymentMethodKeyboard = (): InlineKeyboard =>
  new InlineKeyboard().text("💳 کارت به کارت", "wallet_increase").row().text("⬅️ بازگشت", "main_menu");

export const buildPaymentAmountKeyboard = (): InlineKeyboard =>
  new InlineKeyboard()
    .text("0.5 $", "payment_amount:0.5")
    .row()
    .text("1 $", "payment_amount:1")
    .row()
    .text("5 $", "payment_amount:5")
    .row()
    .text("10 $", "payment_amount:10")
    .row()
    .text("15 $", "payment_amount:15")
    .row()
    .text("⬅️ بازگشت", "wallet_menu");

export const buildAdminPaymentKeyboard = (paymentId: string): InlineKeyboard =>
  new InlineKeyboard().text("✅ تأیید", `admin_payment:approve:${paymentId}`).row().text("❌ رد", `admin_payment:reject:${paymentId}`).row().text("⬅️ منوی اصلی", "main_menu");

export const buildServersListKeyboard = (servers: Array<{ id: string; name: string }>): InlineKeyboard => {
  const keyboard = new InlineKeyboard();
  servers.forEach((server) => {
    keyboard.text(`🖥 ${server.name}`, `server_view:${server.id}`).row();
  });
  keyboard.text("🔙 منوی اصلی", "main_menu");
  return keyboard;
};

export const buildServerDetailsKeyboard = (serverId: string): InlineKeyboard =>
  new InlineKeyboard()
    .text("▶️ شروع", `server_action:${serverId}:start`)
    .text("⏹️ توقف", `server_action:${serverId}:stop`)
    .row()
    .text("🔄 ری‌استارت نرم", `server_action:${serverId}:reboot_soft`)
    .text("⚡ ری‌استارت سخت", `server_action:${serverId}:reboot_hard`)
    .row()
    .text("🔨 بازنصب", `server_rebuild:${serverId}`)
    .text("🗑️ حذف", `server_action:${serverId}:delete`)
    .row()
    .text("🔙 بازگشت به سرویس‌ها", "my_servers");

export const buildRebuildOsKeyboard = (imageTokens: Map<string, string>, images: ImageDto[]): InlineKeyboard => {
  const keyboard = new InlineKeyboard();
  images.forEach((image) => {
    let imageToken: string | undefined;
    for (const [token, id] of imageTokens.entries()) {
      if (id === image.id) {
        imageToken = token;
        break;
      }
    }
    if (imageToken) {
      keyboard.text(image.name, `rebuild_os_select:${imageToken}`).row();
    }
  });
  keyboard.text("🔙 لغو", "rebuild_cancel");
  return keyboard;
};
