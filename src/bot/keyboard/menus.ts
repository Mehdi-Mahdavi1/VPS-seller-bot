import { InlineKeyboard } from "grammy";
import { FlavorDto, ImageDto } from "../../modules/common/types";

export const buildMainMenuKeyboard = (): InlineKeyboard =>
  new InlineKeyboard()
    .text("🖥 Create Server", "create_server")
    .row()
    .text("💰 Wallet", "wallet_menu")
    .text("📦 My Servers", "my_servers")
    .row()
    .text("👤 Profile", "profile")
    .text("📞 Support", "support")
    .row()
    .text("⚙ Settings", "settings")
    .text("🛠 Admin", "admin_panel");

export const buildDatacenterKeyboard = (datacenters: Array<{ slug: string; name: string }>) => {
  const keyboard = new InlineKeyboard();
  datacenters.forEach((datacenter) => keyboard.text(datacenter.name, `datacenter_select:${datacenter.slug}`));
  return keyboard;
};

export const buildCreateServerKeyboard = (slug: string, plans: FlavorDto[]) => {
  const keyboard = new InlineKeyboard();
  plans.forEach((plan) => keyboard.text(`${plan.name} | ${plan.vcpus} Core | ${plan.ramMb / 1024} GB | 1 TB | ${plan.monthlyPrice.toFixed(2)} $`, `plan_select:${slug}:${plan.id}`).row());
  keyboard.text("🔙 Main menu", "main_menu");
  return keyboard;
};

export const buildOsMenuKeyboard = (token: string, images: ImageDto[], backCallback: string) => {
  const keyboard = new InlineKeyboard();
  images.forEach((image) => keyboard.text(image.name, `os_select:${token}:${image.id}`).row());
  keyboard.text("🔙 Back", backCallback);
  return keyboard;
};

export const buildPaymentMethodKeyboard = (): InlineKeyboard =>
  new InlineKeyboard().text("💳 Card to Card", "wallet_increase").row().text("⬅️ Back", "main_menu");

export const buildPaymentAmountKeyboard = (): InlineKeyboard =>
  new InlineKeyboard()
    .text("1,000,000 Rial", "payment_amount:1000000")
    .row()
    .text("2,000,000 Rial", "payment_amount:2000000")
    .row()
    .text("5,000,000 Rial", "payment_amount:5000000")
    .row()
    .text("10,000,000 Rial", "payment_amount:10000000")
    .row()
    .text("15,000,000 Rial", "payment_amount:15000000")
    .row()
    .text("⬅️ Back", "wallet_menu");

export const buildAdminPaymentKeyboard = (paymentId: string): InlineKeyboard =>
  new InlineKeyboard().text("✅ Approve", `admin_payment:approve:${paymentId}`).row().text("❌ Reject", `admin_payment:reject:${paymentId}`).row().text("⬅️ Main menu", "main_menu");
