import { prisma } from "../../../infrastructure/database/prismaClient";
import type { PaymentStatus, PaymentMethod } from "@prisma/client";

export class PaymentRepository {
  public async create(payload: { userId: string; amount: number; currency: string; method: PaymentMethod; note?: string }) {
    return prisma.payment.create({ data: payload });
  }

  public async attachReceipt(paymentId: string, filePath: string) {
    return prisma.paymentReceipt.create({ data: { paymentId, filePath } });
  }

  public async getPendingForUser(userId: string) {
    return prisma.payment.findFirst({ where: { userId, status: "PENDING" }, orderBy: { createdAt: "desc" } });
  }

  public async updateStatus(paymentId: string, status: PaymentStatus) {
    return prisma.payment.update({ where: { id: paymentId }, data: { status } });
  }

  public async findById(paymentId: string) {
    return prisma.payment.findUnique({ where: { id: paymentId }, include: { user: true, receipt: true } });
  }

  public async listPending() {
    return prisma.payment.findMany({ where: { status: "PENDING" }, include: { user: true } });
  }
}
