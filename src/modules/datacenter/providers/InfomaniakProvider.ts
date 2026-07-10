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

  public async createServer(payload: CreateServerPayload): Promise<{ id: string; status: string; imageId: string; flavorId: string; access?: { username: string; password?: string; ipv4Address?: string; ipv6Address?: string; sshCommand?: string } }> {
    try {
      const body = {
        server: {
          name: payload.name,
          imageRef: payload.imageRef,
          flavorRef: payload.flavorRef,
          key_name: env.INFOMANIAK_SSH_KEY ?? "dvrssh1",
          adminPass: payload.adminPass,
          networks: [
            { uuid: "1729a205-fabb-45b2-b040-bb712aca40db" },
            { uuid: "546cce65-a380-45ac-b704-0383b7998262" },
          ],
          ...(payload.user_data && { user_data: payload.user_data }),
        },
      };
      const response = await this.client.post(SERVER_ENDPOINT, body);
      const server = response.data.server ?? response.data;
      const addresses = server?.addresses ?? [];
      const ipv4Address = addresses.find((item: any) => item?.version === 4 || item?.type === "ipv4")?.addr ?? addresses.find((item: any) => item?.version === 4 || item?.type === "ipv4")?.address ?? server?.accessIPv4 ?? server?.ipv4 ?? server?.access_ip_v4 ?? undefined;
      const ipv6Address = addresses.find((item: any) => item?.version === 6 || item?.type === "ipv6")?.addr ?? addresses.find((item: any) => item?.version === 6 || item?.type === "ipv6")?.address ?? server?.accessIPv6 ?? server?.ipv6 ?? server?.access_ip_v6 ?? undefined;
      return {
        id: server?.id ?? response.data?.id,
        status: server?.status ?? "ACTIVE",
        imageId: payload.imageRef,
        flavorId: payload.flavorRef,
        access: {
          username: "root",
          password: server?.adminPass ?? server?.password ?? undefined,
          ipv4Address,
          ipv6Address,
          sshCommand: ipv4Address ? `ssh -i dvrssh1.pem root@${ipv4Address}` : undefined,
        },
      };
    } catch (error: any) {
      const responseData = error?.response?.data;
      const status = error?.response?.status;
      logger.error(
        {
          error,
          payload,
          networks: ["1729a205-fabb-45b2-b040-bb712aca40db", "546cce65-a380-45ac-b704-0383b7998262"],
          sshKey: env.INFOMANIAK_SSH_KEY ?? "dvrssh1",
          status,
          responseData,
        },
        "Infomaniak server creation failed"
      );
      const apiMessage = responseData?.message || responseData?.error || JSON.stringify(responseData || {});
      const userMessage = status === 403 ? `Infomaniak API forbidden: ${apiMessage}` : `Infomaniak server creation failed: ${apiMessage}`;
      throw new Error(userMessage);
    }
  }

  public async getServer(externalServerId: string): Promise<any | null> {
    try {
      const response = await this.client.get(`${SERVER_ENDPOINT}/${externalServerId}`);
      return response.data?.server ?? response.data ?? null;
    } catch (error) {
      logger.error({ error, externalServerId }, "Infomaniak getServer failed");
      return null;
    }
  }

  public async stopServer(externalServerId: string): Promise<void> {
    logger.info({ externalServerId }, "Placeholder stopServer called for Infomaniak");
    // Implementation note: add server stop or delete actions when API details are available.
  }
}
