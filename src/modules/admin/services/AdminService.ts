import { env } from "../../../config/env";
import { PaymentRepository } from "../../payments/repositories/PaymentRepository";

const paymentRepository = new PaymentRepository();

export class AdminService {
  public isAdmin(telegramId: string): boolean {
    return env.ADMIN_IDS.includes(telegramId);
  }

  public async getPendingPayments() {
    return paymentRepository.listPending();
  }
}
