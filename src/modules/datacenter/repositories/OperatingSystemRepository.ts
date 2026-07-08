import { prisma } from "../../../infrastructure/database/prismaClient";
import { DatacenterProviderType } from "../../common/types";

export class OperatingSystemRepository {
  public async upsertOperatingSystem(payload: { imageId: string; name: string; provider: DatacenterProviderType }) {
    return prisma.operatingSystem.upsert({
      where: { imageId: payload.imageId },
      update: { name: payload.name, provider: payload.provider },
      create: payload,
    });
  }

  public async findByImageId(imageId: string) {
    return prisma.operatingSystem.findUnique({ where: { imageId } });
  }
}
