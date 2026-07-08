export const formatCurrency = (value: number | string): string => {
  const amount = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(amount);
};
