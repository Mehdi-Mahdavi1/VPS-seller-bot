import { randomBytes } from "crypto";

export type BillingMode = "HOURLY" | "MONTHLY";

type SelectionState = {
  slug: string;
  flavorId: string;
  imageId?: string;
  billingMode?: BillingMode;
};

type RebuildState = {
  serverId: string;
  imageId: string;
};

type RebuildImageToken = {
  serverId: string;
  imageId: string;
};

const callbackSelectionStore = new Map<string, SelectionState>();
const rebuildSelectionStore = new Map<string, RebuildState>();
const rebuildImageTokens = new Map<string, RebuildImageToken>();

export function createSelectionState(initialState: Omit<SelectionState, "imageId">): string {
  const token = randomBytes(8).toString("hex");
  const state: SelectionState = { ...initialState, billingMode: "HOURLY" };
  callbackSelectionStore.set(token, state);
  return token;
}


export function getSelectionState(token: string): SelectionState | undefined {
  return callbackSelectionStore.get(token);
}

export function updateSelectionState(token: string, updates: Partial<SelectionState>): SelectionState | undefined {
  const state = callbackSelectionStore.get(token);
  if (!state) {
    return undefined;
  }
  const updatedState = { ...state, ...updates };
  callbackSelectionStore.set(token, updatedState);
  return updatedState;
}

export function deleteSelectionState(token: string): void {
  callbackSelectionStore.delete(token);
}

export function createRebuildState(serverId: string, images: Array<{ id: string }>): Map<string, string> {
  const imageTokens = new Map<string, string>();
  const baseToken = randomBytes(8).toString("hex");
  
  rebuildSelectionStore.set(baseToken, { serverId, imageId: "" });
  
  images.forEach((image) => {
    const imageToken = randomBytes(4).toString("hex");
    imageTokens.set(imageToken, image.id);
    rebuildImageTokens.set(imageToken, { serverId, imageId: image.id });
  });
  
  return imageTokens;
}

export function getRebuildState(token: string): RebuildState | undefined {
  return rebuildSelectionStore.get(token);
}

export function getRebuildImageData(imageToken: string): RebuildImageToken | undefined {
  return rebuildImageTokens.get(imageToken);
}

export function deleteRebuildState(token: string): void {
  rebuildSelectionStore.delete(token);
}

export function deleteRebuildImageToken(imageToken: string): void {
  rebuildImageTokens.delete(imageToken);
}

