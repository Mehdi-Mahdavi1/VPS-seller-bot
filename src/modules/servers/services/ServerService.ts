import { ServerRepository } from "../repositories/ServerRepository";
import { DatacenterService } from "../../datacenter/services/DatacenterService";
import { WalletService } from "../../wallet/services/WalletService";
import { prisma } from "../../../infrastructure/database/prismaClient";
import { logger } from "../../../infrastructure/logger/logger";

export class ServerService {
  constructor(
    private readonly serverRepository: ServerRepository,
    private readonly datacenterService: DatacenterService,
    private readonly walletService: WalletService
  ) {}

  private async generateServerName(): Promise<string> {
    const totalServers = await this.serverRepository.count();
    return `srv-${10000 + totalServers + 1}`;
  }

  public async createServer(userId: string, datacenterSlug: string, flavorId: string, imageId: string, billingMode: "HOURLY" | "MONTHLY" = "HOURLY") {
    await Promise.all([
      this.datacenterService.listPlans(datacenterSlug),
      this.datacenterService.listOperatingSystems(datacenterSlug),
    ]);

    const [userWallet, planDetail, imageDetail, datacenter] = await Promise.all([
      this.walletService.getWalletByUserId(userId),
      this.datacenterService.getPlanById(datacenterSlug, flavorId),
      this.datacenterService.getOperatingSystemById(imageId),
      this.datacenterService.getDatacenterRecord(datacenterSlug),
    ]);

    if (!planDetail) {
      throw new Error("Selected plan does not exist.");
    }
    if (!imageDetail) {
      throw new Error("Selected operating system does not exist.");
    }

    const planRecord = await this.datacenterService.getPlanRecordByExternalId(flavorId);
    const osRecord = await this.datacenterService.getOperatingSystemRecordByImageId(imageId);
    if (!planRecord || !osRecord) {
      throw new Error("Unable to resolve internal plan or OS metadata.");
    }

    const provider = this.datacenterService.resolveProvider(datacenterSlug);
    const name = await this.generateServerName();
    const serverResponse = await provider.createServer({
      name,
      imageRef: imageId,
      flavorRef: flavorId,
    });

    // Determine pricing and charge user wallet
    const monthlyPrice = Number(planRecord?.monthlyPrice ?? 0);
    const hourlyPrice = Number(monthlyPrice / 720);

    const chargeAmount = billingMode === "MONTHLY" ? monthlyPrice : hourlyPrice;
    // Ensure user has enough balance
    const hasEnough = await this.walletService.hasEnoughBalance(userId, chargeAmount);
    if (!hasEnough) {
      throw new Error("Insufficient wallet balance for selected billing mode.");
    }

    // Deduct payment from wallet
    await this.walletService.charge(userId, chargeAmount, `Server purchase ${name} (${billingMode})`);

    const server = await prisma.server.create({
      data: {
        userId,
        walletId: userWallet.id,
        planId: planRecord.id,
        operatingSystemId: osRecord.id,
        datacenterId: datacenter.id,
        externalServerId: serverResponse.id,
        externalImageId: serverResponse.imageId,
        externalFlavorId: serverResponse.flavorId,
        name,
        status: "ACTIVE",
        hourlyPrice: hourlyPrice,
      },
    });

    logger.info({ serverId: server.id, userId, datacenterSlug }, "Server persisted in database");
    return server;
  }
}
