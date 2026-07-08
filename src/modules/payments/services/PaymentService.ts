import { PaymentRepository } from "../repositories/PaymentRepository";
import { WalletService } from "../../wallet/services/WalletService";
import { logger } from "../../../infrastructure/logger/logger";

export class PaymentService {
  constructor(private readonly paymentRepository: PaymentRepository, private readonly walletService: WalletService) {}

  public async createPendingPayment(userId: string, amount: number, method: "CARD_TO_CARD" | "ONLINE") {
    const payment = await this.paymentRepository.create({
      userId,
      amount,
      currency: "IRR",
      method,
      note: "Card to card top-up",
    });
    logger.info({ userId, paymentId: payment.id, amount }, "Pending payment created");
    return payment;
  }

  public async attachReceiptForLatestPendingPayment(userId: string, fileId: string) {
    const payment = await this.paymentRepository.getPendingForUser(userId);
    if (!payment) {
      return null;
    }
    await this.paymentRepository.attachReceipt(payment.id, fileId);
    logger.info({ userId, paymentId: payment.id }, "Receipt attached for payment");
    return payment;
  }

  public async approvePayment(paymentId: string, adminId: string) {
    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment || payment.status !== "PENDING") {
      throw new Error("Payment not available for approval.");
    }
    await this.paymentRepository.updateStatus(paymentId, "APPROVED");
    await this.walletService.credit(payment.userId, Number(payment.amount), `Admin approved payment ${payment.id}`);
    logger.info({ paymentId, adminId }, "Payment approved");
    return payment;
  }

  public async rejectPayment(paymentId: string, adminId: string) {
    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment || payment.status !== "PENDING") {
      throw new Error("Payment not available for rejection.");
    }
    await this.paymentRepository.updateStatus(paymentId, "REJECTED");
    logger.info({ paymentId, adminId }, "Payment rejected");
    return payment;
  }
}
