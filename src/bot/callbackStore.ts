import { randomBytes } from "crypto";

type SelectionState = {
  slug: string;
  flavorId: string;
  imageId?: string;
  billingMode?: "HOURLY" | "MONTHLY";
};

type RebuildState = {
  serverId: string;
  imageId?: string;
};

const callbackSelectionStore = new Map<string, SelectionState>();
const rebuildSelectionStore = new Map<string, RebuildState>();

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

export function createRebuildState(serverId: string): string {
  const token = randomBytes(8).toString("hex");
  rebuildSelectionStore.set(token, { serverId });
  return token;
}

export function getRebuildState(token: string): RebuildState | undefined {
  return rebuildSelectionStore.get(token);
}

export function updateRebuildState(token: string, imageId: string): RebuildState | undefined {
  const state = rebuildSelectionStore.get(token);
  if (!state) {
    return undefined;
  }
  const updatedState = { ...state, imageId };
  rebuildSelectionStore.set(token, updatedState);
  return updatedState;
}

export function deleteRebuildState(token: string): void {
  rebuildSelectionStore.delete(token);
}

