import axios, { AxiosInstance } from "axios";
import { env } from "../../../config/env";
import { DatacenterProvider } from "./DatacenterProvider";
import { CreateServerPayload, FlavorDto, ImageDto } from "../../common/types";
import { logger } from "../../../infrastructure/logger/logger";

const IMAGE_ENDPOINT = "https://api.pub2.infomaniak.cloud/image/v2/images";
const FLAVOR_ENDPOINT = "https://api.pub2.infomaniak.cloud/compute/v2.1/flavors/detail";
const SERVER_ENDPOINT = "https://api.pub2.infomaniak.cloud/compute/v2.1/servers";

export class InfomaniakProvider implements DatacenterProvider {
  public readonly providerType = "INFOMANIAK" as const;
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      headers: {
        "X-Auth-Token": env.INFOMANIAK_AUTH_TOKEN,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });
  }

  public async listImages(): Promise<ImageDto[]> {
    try {
      const response = await this.client.get(IMAGE_ENDPOINT);
      const images = response.data?.images ?? response.data?.list ?? [];
      return images.map((item: any) => ({
        id: item.id,
        name: item.name,
      }));
    } catch (error) {
      logger.error({ error }, "Infomaniak image list failed");
      return [];
    }
  }

  public async listFlavors(): Promise<FlavorDto[]> {
    try {
      const response = await this.client.get(FLAVOR_ENDPOINT);
      const flavors = response.data?.flavors ?? [];
      return flavors.map((item: any) => ({
        id: item.id,
        name: item.name,
        vcpus: item.vcpus ?? 1,
        ramMb: item.ram ?? 1024,
        diskGb: item.disk ?? 20,
        monthlyPrice: Number(item.extra?.prices?.monthly ?? 0) || 0,
      }));
    } catch (error) {
      logger.error({ error }, "Infomaniak flavor list failed");
      return [];
    }
  }

  public async createServer(payload: CreateServerPayload): Promise<{ id: string; status: string; imageId: string; flavorId: string }> {
    try {
      const serverPayload: any = {
        name: payload.name,
        imageRef: payload.imageRef,
        flavorRef: payload.flavorRef,
      };

      if (env.INFOMANIAK_SSH_KEY) {
        serverPayload.key_name = env.INFOMANIAK_SSH_KEY;
      }

      if (env.INFOMANIAK_NETWORK_IDS?.length) {
        serverPayload.networks = env.INFOMANIAK_NETWORK_IDS.map((uuid) => ({ uuid }));
      }

      const body = { server: serverPayload };
      const response = await this.client.post(SERVER_ENDPOINT, body);
      return {
        id: response.data.server?.id ?? response.data?.id,
        status: response.data.server?.status ?? "ACTIVE",
        imageId: payload.imageRef,
        flavorId: payload.flavorRef,
      };
    } catch (error) {
      logger.error({ error, payload, networks: env.INFOMANIAK_NETWORK_IDS, sshKey: env.INFOMANIAK_SSH_KEY }, "Infomaniak server creation failed");
      throw new Error("Infomaniak server creation failed");
    }
  }

  public async stopServer(externalServerId: string): Promise<void> {
    logger.info({ externalServerId }, "Placeholder stopServer called for Infomaniak");
    // Implementation note: add server stop or delete actions when API details are available.
  }
}
