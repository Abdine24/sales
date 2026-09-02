export const formatCfa = (value: number) => {
  const rounded = Math.round(value || 0);
  return `${rounded.toLocaleString('fr-FR')} F`;
};

// Format compact pour les axes de graphiques : 1 500 -> "1,5 k F", 2 400 000 -> "2,4 M F"
export const formatCfaCompact = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M F`;
  if (abs >= 1_000) return `${(value / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k F`;
  return `${Math.round(value || 0).toLocaleString('fr-FR')} F`;
};

// Parse une saisie utilisateur en nombre, en tolérant la virgule décimale (locale FR) et les espaces
export const parseAmount = (raw: string): number => {
  if (typeof raw !== 'string') return Number(raw) || 0;
  const normalized = raw.replace(/\s/g, '').replace(',', '.');
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
};
