import { randomBytes } from "crypto";

type SelectionState = {
  slug: string;
  flavorId: string;
  imageId?: string;
};

const callbackSelectionStore = new Map<string, SelectionState>();

export function createSelectionState(initialState: Omit<SelectionState, "imageId">): string {
  const token = randomBytes(8).toString("hex");
  callbackSelectionStore.set(token, initialState);
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
