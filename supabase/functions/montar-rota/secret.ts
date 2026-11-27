/** Compara o segredo sem vazar o tamanho nem curto-circuitar no primeiro byte diferente. */
export async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(leftHash);
  const right = new Uint8Array(rightHash);
  let diff = expected.length === 0 ? 1 : 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

export function bearerToken(header: string | null): string {
  if (!header) return '';
  const match = header.match(/^Bearer\s+(\S+)\s*$/i);
  return match?.[1] ?? '';
}
