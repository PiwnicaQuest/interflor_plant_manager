/**
 * Parsuje wartość ceny z obsługą przecinka i kropki jako separatora dziesiętnego
 * Np. "12,50" i "12.50" zwrócą 12.5
 */
export const parsePrice = (value: string | number): number => {
  if (typeof value === 'number') return value;
  if (!value || value === '') return 0;
  // Zamień przecinek na kropkę
  const normalized = String(value).replace(',', '.');
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * Parsuje wartość ceny, zwraca undefined gdy puste (dla filtrów)
 */
export const parsePriceOrUndefined = (value: string | number): number | undefined => {
  if (value === '' || value === null || value === undefined) return undefined;
  const result = parsePrice(value);
  return result === 0 && String(value).replace(',', '.') !== '0' ? undefined : result;
};
