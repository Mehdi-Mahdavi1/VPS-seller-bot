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
    await Promise.all(
      flavors.map((item) =>
        this.planRepository.upsertPlan({
          datacenterId: datacenter.id,
          externalId: item.id,
          name: item.name,
          vcpus: item.vcpus,
          ramMb: item.ramMb,
          diskGb: item.diskGb,
          bandwidthTb: 1,
          hourlyPrice: Number(item.monthlyPrice / 720),
          monthlyPrice: item.monthlyPrice,
        })
      )
    );
    return flavors;
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
    }
    return plan ?? null;
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

  public resolveProvider(slug: string): DatacenterProvider {
    const provider = this.providers.get("INFOMANIAK");
    if (!provider) {
      throw new Error(`Datacenter provider for slug ${slug} is not configured.`);
    }
    return provider;
  }
}
