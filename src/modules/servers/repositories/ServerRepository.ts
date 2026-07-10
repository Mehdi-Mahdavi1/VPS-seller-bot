import { prisma } from "../../../infrastructure/database/prismaClient";
import type { Server as ServerModel, ServerStatus, Wallet, ServerPlan, User, Datacenter, OperatingSystem } from "@prisma/client";

export class ServerRepository {
  public async count(): Promise<number> {
    return prisma.server.count();
  }

  public async create(payload: {
    userId: string;
    walletId: string;
    planId: string;
    operatingSystemId: string;
    datacenterId: string;
    externalServerId: string;
    externalImageId: string;
    externalFlavorId: string;
    name: string;
    status: ServerStatus;
    hourlyPrice: number;
  }): Promise<ServerModel> {
    return prisma.server.create({ data: payload });
  }

  public async findActiveServers(): Promise<Array<ServerModel & { wallet: Wallet | null; plan: ServerPlan | null; user: User | null; datacenter: Datacenter | null }>> {
    return prisma.server.findMany({
      where: { status: "ACTIVE" },
      include: {
        wallet: true,
        plan: true,
        user: true,
        datacenter: true,
      },
    });
  }

  public async findExpiringServers(cutoff: Date): Promise<Array<ServerModel & { wallet: Wallet | null; plan: ServerPlan | null; user: User | null; datacenter: Datacenter | null }>> {
    return prisma.server.findMany({
      where: {
        status: "ACTIVE",
        expiresAt: { lte: cutoff },
      },
      include: {
        wallet: true,
        plan: true,
        user: true,
        datacenter: true,
      },
    });
  }

  public async findUserServers(userId: string): Promise<Array<ServerModel & { plan: ServerPlan | null; datacenter: Datacenter | null; operatingSystem: OperatingSystem | null }>> {
    return prisma.server.findMany({
      where: { userId },
      include: {
        plan: true,
        datacenter: true,
        operatingSystem: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  public async updateStatus(serverId: string, status: ServerStatus): Promise<ServerModel> {
    return prisma.server.update({ where: { id: serverId }, data: { status } });
  }

  public async updateTelegramNotificationInfo(
    serverId: string,
    telegramChatId: string,
    telegramMessageId: number
  ): Promise<ServerModel> {
    return prisma.server.update({
      where: { id: serverId },
      data: {
        telegramChatId,
        telegramMessageId,
      },
    });
  }

  public async findServerById(serverId: string): Promise<ServerModel | null> {
    return prisma.server.findUnique({
      where: { id: serverId },
    });
  }

  public async findServerByIdWithRelations(serverId: string): Promise<(ServerModel & { plan: ServerPlan | null; datacenter: Datacenter | null; operatingSystem: OperatingSystem | null; user: User | null }) | null> {
    return prisma.server.findUnique({
      where: { id: serverId },
      include: {
        plan: true,
        datacenter: true,
        operatingSystem: true,
        user: true,
      },
    });
  }
}

