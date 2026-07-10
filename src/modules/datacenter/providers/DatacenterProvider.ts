import { CreateServerPayload, FlavorDto, ImageDto, DatacenterProviderType, ServerAccessInfo } from "../../common/types";

export interface DatacenterProvider {
  providerType: DatacenterProviderType;
  listFlavors(): Promise<FlavorDto[]>;
  listImages(): Promise<ImageDto[]>;
  createServer(payload: CreateServerPayload): Promise<{ id: string; status: string; imageId: string; flavorId: string; access?: Partial<ServerAccessInfo> }>;
  getServer?(externalServerId: string): Promise<any>;
  stopServer?(externalServerId: string): Promise<void>;
}
