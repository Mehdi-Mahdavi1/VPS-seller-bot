type PendingPrice = {
  externalId: string;
};

const adminPending = new Map<string, PendingPrice>();

export function setPendingPrice(adminTelegramId: string, externalId: string) {
  adminPending.set(adminTelegramId, { externalId });
}

export function getPendingPrice(adminTelegramId: string): PendingPrice | undefined {
  return adminPending.get(adminTelegramId);
}

export function clearPendingPrice(adminTelegramId: string) {
  adminPending.delete(adminTelegramId);
}
