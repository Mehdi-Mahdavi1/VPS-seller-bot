import { prisma } from "../../../infrastructure/database/prismaClient";
import { DatacenterProviderType } from "../../common/types";

export class DatacenterRepository {
  public async ensureDatacenter(payload: { slug: string; name: string; provider: DatacenterProviderType; region: string }) {
    return prisma.datacenter.upsert({
      where: { slug: payload.slug },
      update: { name: payload.name, provider: payload.provider, region: payload.region, active: true },
      create: { slug: payload.slug, name: payload.name, provider: payload.provider, region: payload.region, active: true },
    });
  }

  public async findBySlug(slug: string) {
    return prisma.datacenter.findUnique({ where: { slug } });
  }
}
