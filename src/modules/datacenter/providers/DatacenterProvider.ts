import { CreateServerPayload, FlavorDto, ImageDto, DatacenterProviderType } from "../../common/types";

export interface DatacenterProvider {
  providerType: DatacenterProviderType;
  listFlavors(): Promise<FlavorDto[]>;
  listImages(): Promise<ImageDto[]>;
  createServer(payload: CreateServerPayload): Promise<{ id: string; status: string; imageId: string; flavorId: string }>;
  stopServer?(externalServerId: string): Promise<void>;
}
