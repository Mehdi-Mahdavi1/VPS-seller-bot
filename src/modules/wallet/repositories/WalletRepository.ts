import { prisma } from "../../../infrastructure/database/prismaClient";
import type { Wallet, WalletTransaction } from "@prisma/client";

export class WalletRepository {
  public async findByUserId(userId: string): Promise<Wallet | null> {
    return prisma.wallet.findUnique({ where: { userId } });
  }

  public async createForUser(userId: string): Promise<Wallet> {
    return prisma.wallet.create({ data: { userId } });
  }

  public async updateBalance(walletId: string, balance: number): Promise<Wallet> {
    return prisma.wallet.update({ where: { id: walletId }, data: { balance } });
  }

  public async createTransaction(payload: {
    walletId: string;
    type: "DEPOSIT" | "PURCHASE" | "REFUND" | "ADJUSTMENT";
    amount: number;
    description: string;
    metadata?: any;
  }): Promise<WalletTransaction> {
    return prisma.walletTransaction.create({ data: payload as any });
  }

  public async getSummary(userId: string) {
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    const totalDeposits = await prisma.walletTransaction.aggregate({
      where: { walletId: wallet?.id, type: "DEPOSIT" },
      _sum: { amount: true },
    });
    const totalUsage = await prisma.walletTransaction.aggregate({
      where: { walletId: wallet?.id, type: "PURCHASE" },
      _sum: { amount: true },
    });
    return {
      balance: Number(wallet?.balance ?? 0),
      totalDeposits: Number(totalDeposits._sum.amount ?? 0),
      totalUsage: Number(totalUsage._sum.amount ?? 0),
      wallet,
    };
  }
}
