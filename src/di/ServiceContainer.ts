import { bot } from "../infrastructure/telegram/bot";
import { DatacenterService } from "../modules/datacenter/services/DatacenterService";
import { InfomaniakProvider } from "../modules/datacenter/providers/InfomaniakProvider";
import { UserRepository } from "../modules/users/repositories/UserRepository";
import { WalletRepository } from "../modules/wallet/repositories/WalletRepository";
import { ServerRepository } from "../modules/servers/repositories/ServerRepository";
import { PaymentRepository } from "../modules/payments/repositories/PaymentRepository";
import { UserService } from "../modules/users/services/UserService";
import { WalletService } from "../modules/wallet/services/WalletService";
import { ServerService } from "../modules/servers/services/ServerService";
import { PaymentService } from "../modules/payments/services/PaymentService";
import { AdminService } from "../modules/admin/services/AdminService";
import { DatacenterProviderType } from "../modules/common/types";

const infomaniakProvider = new InfomaniakProvider();
const datacenterService = new DatacenterService({
  providers: new Map([["INFOMANIAK", infomaniakProvider]]),
});

const userRepository = new UserRepository();
const walletRepository = new WalletRepository();
const serverRepository = new ServerRepository();
const paymentRepository = new PaymentRepository();

export const userService = new UserService(userRepository, walletRepository);
export const walletService = new WalletService(walletRepository);
export const serverService = new ServerService(serverRepository, datacenterService, walletService);
export const paymentService = new PaymentService(paymentRepository, walletService);
export const adminService = new AdminService();
export const datacenterServiceInstance = datacenterService;
export const botInstance = bot;
