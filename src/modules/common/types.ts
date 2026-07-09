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
  adminPass?: string;
}

export interface ServerAccessInfo {
  username: string;
  password: string;
  ipv4Address?: string;
  ipv6Address?: string;
  sshCommand?: string;
}
