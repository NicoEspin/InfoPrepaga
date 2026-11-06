export const importKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export function historicalLabel(value: string) {
  return (
    { lan: 'Datos Lan', ref: 'Referidos', 'ip lan': 'Datos IP' } as Record<
      string,
      string
    >
  )[importKey(value)];
}
