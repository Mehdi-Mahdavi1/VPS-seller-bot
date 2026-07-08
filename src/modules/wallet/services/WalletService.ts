import { WalletRepository } from "../repositories/WalletRepository";
import { logger } from "../../../infrastructure/logger/logger";

export class WalletService {
  constructor(private readonly walletRepository: WalletRepository) {}

  public async getWalletSummary(userId: string) {
    return this.walletRepository.getSummary(userId);
  }

  public async getWalletByUserId(userId: string) {
    let wallet = await this.walletRepository.findByUserId(userId);
    if (!wallet) {
      wallet = await this.walletRepository.createForUser(userId);
    }
    return wallet;
  }

  public async hasEnoughBalance(userId: string, amount: number): Promise<boolean> {
    const wallet = await this.getWalletByUserId(userId);
    return Number(wallet.balance) >= amount;
  }

  public async credit(userId: string, amount: number, description: string) {
    const wallet = await this.getWalletByUserId(userId);
    const updatedBalance = Number(wallet.balance) + amount;
    await this.walletRepository.createTransaction({
      walletId: wallet.id,
      type: "DEPOSIT",
      amount,
      description,
    });
    logger.info({ userId, amount, updatedBalance }, "Wallet credited");
    return this.walletRepository.updateBalance(wallet.id, updatedBalance);
  }

  public async charge(userId: string, amount: number, description: string) {
    const wallet = await this.getWalletByUserId(userId);
    const updatedBalance = Number(wallet.balance) - amount;
    await this.walletRepository.createTransaction({
      walletId: wallet.id,
      type: "PURCHASE",
      amount,
      description,
    });
    logger.info({ userId, amount, updatedBalance }, "Wallet charged");
    return this.walletRepository.updateBalance(wallet.id, updatedBalance);
  }
}
