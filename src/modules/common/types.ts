export type DatacenterProviderType = "INFOMANIAK";

export interface FlavorDto {
  id: string;
  name: string;
  vcpus: number;
  ramMb: number;
  diskGb: number;
  monthlyPrice: number;
}

export interface ImageDto {
  id: string;
  name: string;
}

export interface CreateServerPayload {
  name: string;
  imageRef: string;
  flavorRef: string;
}
