import { prisma } from "../../../infrastructure/database/prismaClient";

export class ServerPlanRepository {
  public async upsertPlan(payload: {
    datacenterId: string;
    externalId: string;
    name: string;
    vcpus: number;
    ramMb: number;
    diskGb: number;
    bandwidthTb: number;
    hourlyPrice: number;
    monthlyPrice: number;
  }) {
    return prisma.serverPlan.upsert({
      where: { externalId: payload.externalId },
      update: {
        datacenterId: payload.datacenterId,
        name: payload.name,
        vcpus: payload.vcpus,
        ramMb: payload.ramMb,
        diskGb: payload.diskGb,
        bandwidthTb: payload.bandwidthTb,
        hourlyPrice: payload.hourlyPrice,
        monthlyPrice: payload.monthlyPrice,
      },
      create: payload,
    });
  }

  public async findByExternalId(externalId: string) {
    return prisma.serverPlan.findUnique({ where: { externalId } });
  }

  public async updatePrice(externalId: string, monthlyPrice: number) {
    return prisma.serverPlan.update({ where: { externalId }, data: { monthlyPrice, hourlyPrice: Number(monthlyPrice / 720) } });
  }
}
