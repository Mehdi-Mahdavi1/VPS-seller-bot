import { UserRepository } from "../repositories/UserRepository";
import { prisma } from "../../../infrastructure/database/prismaClient";

export class UserService {
  constructor(private readonly userRepository: UserRepository, private readonly walletRepository: any) {}

  public async getByTelegramId(telegramId: string) {
    return this.userRepository.findByTelegramId(telegramId);
  }

  public async ensureUser(telegramId: string, username?: string, firstName?: string, lastName?: string) {
    let user = await this.userRepository.findByTelegramId(telegramId);
    if (!user) {
      user = await this.userRepository.create({ telegramId, username, firstName, lastName });
      await prisma.wallet.create({ data: { userId: user.id } });
    }
    return user;
  }
}
