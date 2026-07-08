import { prisma } from "../../../infrastructure/database/prismaClient";
import type { User as PrismaUser } from "@prisma/client";

export class UserRepository {
  public async findByTelegramId(telegramId: string): Promise<PrismaUser | null> {
    return prisma.user.findUnique({ where: { telegramId } });
  }

  public async create(payload: {
    telegramId: string;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  }): Promise<PrismaUser> {
    return prisma.user.create({ data: payload });
  }

  public async update(telegramId: string, data: Partial<{ username?: string | null; firstName?: string | null; lastName?: string | null }>): Promise<PrismaUser> {
    return prisma.user.update({ where: { telegramId }, data });
  }
}
