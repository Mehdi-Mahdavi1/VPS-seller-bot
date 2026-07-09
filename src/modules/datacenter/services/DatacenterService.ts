import { DatacenterProvider } from "../providers/DatacenterProvider";
import { DatacenterProviderType, FlavorDto, ImageDto } from "../../common/types";
import { DatacenterRepository } from "../repositories/DatacenterRepository";
import { ServerPlanRepository } from "../repositories/ServerPlanRepository";
import { OperatingSystemRepository } from "../repositories/OperatingSystemRepository";
import { logger } from "../../../infrastructure/logger/logger";

interface DatacenterServiceOptions {
  providers: Map<DatacenterProviderType, DatacenterProvider>;
}

export class DatacenterService {
  private readonly providers: Map<DatacenterProviderType, DatacenterProvider>;
  private readonly datacenterRepository = new DatacenterRepository();
  private readonly planRepository = new ServerPlanRepository();
  private readonly osRepository = new OperatingSystemRepository();

  constructor(options: DatacenterServiceOptions) {
    this.providers = options.providers;
  }

  public getDatacenterSummaries() {
    return [
      {
        slug: "infomaniak",
        name: "Infomaniak",
        provider: "INFOMANIAK" as DatacenterProviderType,
      },
    ];
  }

  public async listPlans(slug: string): Promise<FlavorDto[]> {
    const provider = this.resolveProvider(slug);
    const datacenter = await this.datacenterRepository.ensureDatacenter({ slug: "infomaniak", name: "Infomaniak", provider: "INFOMANIAK", region: "ch" });
    const flavors = await provider.listFlavors();

    // Only keep a curated set of flavors matching allowed (ram, cpu) pairs and with disk > 0
    // Desired flavor set: cpu 1 ram 2, cpu 2 ram 4, cpu 4 ram 8, cpu 8 ram 16 (GB)
    const allowedPairs: Array<{ ramGb: number; vcpus: number }> = [
      { ramGb: 2, vcpus: 1 },
      { ramGb: 4, vcpus: 2 },
      { ramGb: 8, vcpus: 4 },
      { ramGb: 16, vcpus: 8 },
    ];

    const filtered = flavors.filter((item) => {
      const ramGb = Math.round(item.ramMb / 1024);
      const matchesPair = allowedPairs.some((p) => p.ramGb === ramGb && p.vcpus === item.vcpus);
      // require disk at least 20 GB
      return matchesPair && (item.diskGb ?? 0) >= 20;
    });

    // Sort ascending by RAM size
    filtered.sort((a, b) => Math.round(a.ramMb / 1024) - Math.round(b.ramMb / 1024));

    // Upsert the filtered plans and then read the stored monthlyPrice so admin-set prices take precedence
    // Upsert plans but preserve any admin-set monthlyPrice in DB
    await Promise.all(
      filtered.map(async (item) => {
        const existing = await this.planRepository.findByExternalId(item.id);
        const monthlyPriceToSaveNum = Number(existing?.monthlyPrice ?? item.monthlyPrice ?? 0);
        return this.planRepository.upsertPlan({
          datacenterId: datacenter.id,
          externalId: item.id,
          name: item.name,
          vcpus: item.vcpus,
          ramMb: item.ramMb,
          diskGb: item.diskGb,
          bandwidthTb: 1,
          hourlyPrice: Number(monthlyPriceToSaveNum / 720),
          monthlyPrice: monthlyPriceToSaveNum,
        });
      })
    );

    // Replace provider monthlyPrice with stored DB monthlyPrice when available
    const result: FlavorDto[] = await Promise.all(
      filtered.map(async (item) => {
        const record = await this.planRepository.findByExternalId(item.id);
        return {
          id: item.id,
          name: item.name,
          vcpus: item.vcpus,
          ramMb: item.ramMb,
          diskGb: item.diskGb,
          monthlyPrice: record?.monthlyPrice ?? item.monthlyPrice,
        } as FlavorDto;
      })
    );

    return result;
  }

  public async listOperatingSystems(slug: string): Promise<ImageDto[]> {
    const provider = this.resolveProvider(slug);
    const images = await provider.listImages();
    await Promise.all(
      images.map((item) =>
        this.osRepository.upsertOperatingSystem({
          imageId: item.id,
          name: item.name,
          provider: "INFOMANIAK",
        })
      )
    );
    return images;
  }

  public async getPlanById(slug: string, flavorId: string): Promise<FlavorDto | null> {
    const provider = this.resolveProvider(slug);
    const plan = (await provider.listFlavors()).find((item) => item.id === flavorId);
    if (!plan) {
      logger.warn({ slug, flavorId }, "Plan not found");
      return null;
    }
    // Override provider monthlyPrice with DB value if admin set it
    const record = await this.planRepository.findByExternalId(flavorId);
    const monthlyPrice = record?.monthlyPrice ?? plan.monthlyPrice;
    return {
      id: plan.id,
      name: plan.name,
      vcpus: plan.vcpus,
      ramMb: plan.ramMb,
      diskGb: plan.diskGb,
      monthlyPrice,
    } as FlavorDto;
  }

  public async getOperatingSystemById(imageId: string) {
    const os = await this.osRepository.findByImageId(imageId);
    if (os) {
      return { id: os.imageId, name: os.name };
    }
    const provider = this.resolveProvider("infomaniak");
    const image = (await provider.listImages()).find((item) => item.id === imageId);
    return image ?? null;
  }

  public async getPlanRecordByExternalId(externalId: string) {
    return this.planRepository.findByExternalId(externalId);
  }

  public async getOperatingSystemRecordByImageId(imageId: string) {
    return this.osRepository.findByImageId(imageId);
  }

  public async getDatacenterRecord(slug: string) {
    return this.datacenterRepository.ensureDatacenter({ slug: "infomaniak", name: "Infomaniak", provider: "INFOMANIAK", region: "ch" });
  }

  public async updatePlanPrice(externalId: string, monthlyPrice: number) {
    return this.planRepository.updatePrice(externalId, monthlyPrice);
  }

  public resolveProvider(slug: string): DatacenterProvider {
    const provider = this.providers.get("INFOMANIAK");
    if (!provider) {
      throw new Error(`Datacenter provider for slug ${slug} is not configured.`);
    }
    return provider;
  }
}
