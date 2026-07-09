import { randomBytes } from "crypto";
import { ServerRepository } from "../repositories/ServerRepository";
import { DatacenterService } from "../../datacenter/services/DatacenterService";
import { WalletService } from "../../wallet/services/WalletService";
import { prisma } from "../../../infrastructure/database/prismaClient";
import { logger } from "../../../infrastructure/logger/logger";
import { generateCloudInitBase64 } from "../../common/cloudinit";

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

  private generateRandomPassword(length = 20): string {
    // Use only safe characters that don't need escaping in YAML/shell
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
    const bytes = randomBytes(length);
    return Array.from(bytes, (byte, index) => chars[byte % chars.length]).join("");
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
    const randomPassword = this.generateRandomPassword();
    const cloudInitBase64 = generateCloudInitBase64(randomPassword);
    
    const serverResponse = await provider.createServer({
      name,
      imageRef: imageId,
      flavorRef: flavorId,
      adminPass: randomPassword,
      user_data: cloudInitBase64,
    });
    const accessData = {
      username: "root",
      password: serverResponse.access?.password ?? randomPassword,
      ipv4Address: serverResponse.access?.ipv4Address,
      ipv6Address: serverResponse.access?.ipv6Address,
      sshCommand: serverResponse.access?.ipv4Address ? `ssh -i dvrssh1.pem root@${serverResponse.access.ipv4Address}` : `ssh -i dvrssh1.pem root@<server-ip>`,
    };

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
        ipv4Address: accessData.ipv4Address,
        ipv6Address: accessData.ipv6Address,
        hourlyPrice: hourlyPrice,
      },
    });

    logger.info({ serverId: server.id, userId, datacenterSlug, accessData }, "Server persisted in database");
    return { server, accessData, randomPassword };
  }

  public async getServerAccess(serverId: string): Promise<{ ipv4Address?: string; ipv6Address?: string; sshCommand?: string } | null> {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
    });
    
    if (!server) {
      return null;
    }

    try {
      const provider = this.datacenterService.resolveProvider(server.datacenterId);
      // Assuming provider has a method to get server details
      // For now, we'll return partial data
      return {
        ipv4Address: undefined,
        ipv6Address: undefined,
        sshCommand: undefined,
      };
    } catch (error) {
      logger.error({ error, serverId }, "Failed to get server access info");
      return null;
    }
  }
}
