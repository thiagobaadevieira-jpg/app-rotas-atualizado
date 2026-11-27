/** Regras puras de nome e ordem. A função SQL repete as mesmas regras. */

const ACCENT_FROM = 'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝŸABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ACCENT_TO = 'aaaaaaeeeeiiiiooooouuuucnyyaaaaaaeeeeiiiiooooouuuucnyaabcdefghijklmnopqrstuvwxyz';

const ACCENTS = new Map<string, string>(
  [...ACCENT_FROM].map((char, index) => [char, [...ACCENT_TO][index]]),
);

export function normalizeNome(value: string): string {
  let folded = '';
  for (const char of value.normalize('NFC')) folded += ACCENTS.get(char) ?? char;
  return folded.replace(/[^a-z0-9]/g, '');
}

/** Distância de edição com troca de letras vizinhas valendo 1. "sileo" e "siloe" = 1. */
export function osaDistance(a: string, b: string): number {
  if (a === b) return 0;
  const left = [...a];
  const right = [...b];
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;
  if (left.length > 200 || right.length > 200) return 999;
  let prev = Array.from({length: right.length + 1}, (_, index) => index);
  let prevPrev = prev.slice();
  for (let i = 1; i <= left.length; i++) {
    const curr = [i];
    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        value = Math.min(value, prevPrev[j - 2] + 1);
      }
      curr[j] = value;
    }
    prevPrev = prev;
    prev = curr;
  }
  return prev[right.length];
}

/** Menor é mais parecido. null = não sugerir. Igualdade exata não é sugestão. */
export function suggestionScore(needle: string, candidate: string): number | null {
  if (!needle || !candidate || needle === candidate) return null;
  const dist = osaDistance(needle, candidate);
  const longest = Math.max(needle.length, candidate.length);
  if (dist === 1 && longest >= 3) return dist;
  if (dist === 2 && longest >= 6) return dist;
  const shortest = Math.min(needle.length, candidate.length);
  if (shortest >= 4 && (candidate.includes(needle) || needle.includes(candidate))) {
    return 100 + Math.abs(needle.length - candidate.length);
  }
  return null;
}

export interface RankedSuggestion {
  id: string;
  nome: string;
  cidade: string;
  score: number;
}

export function rankSuggestions(
  needle: string,
  cadastros: Array<{id: string; nome: string; cidade: string}>,
  limit = 3,
): RankedSuggestion[] {
  return cadastros
    .map((item) => ({...item, score: suggestionScore(needle, normalizeNome(item.nome))}))
    .filter((item): item is RankedSuggestion => item.score != null)
    .sort((a, b) => a.score - b.score || a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export interface Orderable {
  ord: number;
  horario: string | null;
}

/** Com horário, ordena por HH:MM. Sem horário, fica depois, na ordem da lista. Empate mantém a ordem. */
export function orderForPlacement<T extends Orderable>(items: T[]): T[] {
  return items.slice().sort((a, b) => {
    if (a.horario != null && b.horario != null && a.horario !== b.horario) {
      return a.horario < b.horario ? -1 : 1;
    }
    if ((a.horario == null) !== (b.horario == null)) return a.horario == null ? 1 : -1;
    return a.ord - b.ord;
  });
}

export function todayInSaoPaulo(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
