import {assertEquals} from 'jsr:@std/assert@1';
import {
  normalizeNome,
  orderForPlacement,
  osaDistance,
  rankSuggestions,
  suggestionScore,
  todayInSaoPaulo,
} from './logic.ts';
import {parseIntake} from './payload.ts';
import {bearerToken, secretsMatch} from './secret.ts';

Deno.test('normaliza acento, caixa, pontuação e espaço', () => {
  assertEquals(normalizeNome('Síloe'), 'siloe');
  assertEquals(normalizeNome('SÍLOE'), 'siloe');
  assertEquals(normalizeNome('Siloe.'), 'siloe');
  assertEquals(normalizeNome("  D'Água Ltda. "), 'dagualtda');
  assertEquals(normalizeNome('São João'), 'saojoao');
  assertEquals(normalizeNome('Sileo'), 'sileo');
});

Deno.test('sileo fica a uma troca de siloe', () => {
  assertEquals(osaDistance('sileo', 'siloe'), 1);
  assertEquals(osaDistance('siloe', 'siloe'), 0);
  assertEquals(osaDistance('siloe', 'siloa'), 1);
  assertEquals(osaDistance('abc', 'ab'), 1);
  assertEquals(suggestionScore('sileo', 'siloe'), 1);
  assertEquals(suggestionScore('siloe', 'siloe'), null);
  assertEquals(suggestionScore('abc', 'xyz'), null);
  assertEquals(suggestionScore('ana', 'bia'), null);
});

Deno.test('Sileo sugere Siloe e não escolhe sozinho', () => {
  const ranked = rankSuggestions('sileo', [
    {id: 'marm-siloe', nome: 'Siloe', cidade: 'Blumenau'},
    {id: 'marm-zeta', nome: 'Zeta', cidade: 'Gaspar'},
    {id: 'marm-outra', nome: 'Siloe Marmores', cidade: 'Gaspar'},
  ]);
  assertEquals(ranked[0]?.nome, 'Siloe');
  assertEquals(ranked[0]?.cidade, 'Blumenau');
  assertEquals(ranked.some((item) => item.nome === 'Zeta'), false);
  assertEquals(ranked.length <= 3, true);
});

Deno.test('horário ordena e ausência mantém a lista', () => {
  assertEquals(
    orderForPlacement([
      {ord: 0, horario: '10:00', nome: 'Zeta'},
      {ord: 1, horario: '08:00', nome: 'Alfa'},
      {ord: 2, horario: null, nome: 'Sem'},
    ]).map((item) => item.nome),
    ['Alfa', 'Zeta', 'Sem'],
  );
  assertEquals(
    orderForPlacement([
      {ord: 0, horario: null, nome: 'C'},
      {ord: 1, horario: null, nome: 'A'},
      {ord: 2, horario: null, nome: 'B'},
    ]).map((item) => item.nome),
    ['C', 'A', 'B'],
  );
  assertEquals(
    orderForPlacement([
      {ord: 0, horario: '09:00', nome: 'A'},
      {ord: 1, horario: '09:00', nome: 'B'},
    ]).map((item) => item.nome),
    ['A', 'B'],
  );
});

Deno.test('data ausente usa o dia em São Paulo', () => {
  assertEquals(todayInSaoPaulo(new Date('2026-11-27T02:30:00.000Z')), '2026-11-26');
  assertEquals(todayInSaoPaulo(new Date('2026-11-27T03:00:00.000Z')), '2026-11-27');
  const parsed = parseIntake(
    {request_id: 'pedido-1', paradas: [{cliente: 'Siloe'}]},
    new Date('2026-11-27T02:30:00.000Z'),
  );
  if (!parsed.ok) throw new Error('deveria aceitar');
  assertEquals(parsed.payload.data, '2026-11-26');
  assertEquals(parsed.payload.paradas[0]?.tipo, null);
  assertEquals(parsed.payload.paradas[0]?.horario, null);
});

Deno.test('rejeita o que falta e a parada repetida', async () => {
  const missing = parseIntake({paradas: []});
  if (missing.ok) throw new Error('deveria exigir request_id');
  assertEquals(missing.status, 400);
  assertEquals(missing.body.campos, ['request_id']);

  const badDay = parseIntake({request_id: 'a', data: '27/11/2026', paradas: []});
  if (badDay.ok) throw new Error('data inválida');
  assertEquals(badDay.status, 400);

  const badTipo = parseIntake({
    request_id: 'a',
    paradas: [{cliente: 'Siloe', tipo: 'Entrega'}],
  });
  if (badTipo.ok) throw new Error('tipo inválido');
  assertEquals(badTipo.status, 400);

  const badHora = parseIntake({
    request_id: 'a',
    paradas: [{cliente: 'Siloe', horario: '8:30'}],
  });
  if (badHora.ok) throw new Error('horário inválido');
  assertEquals(badHora.status, 400);

  const repeated = parseIntake({
    request_id: 'a',
    paradas: [{cliente: 'Síloe'}, {cliente: 'Siloe'}],
  });
  if (repeated.ok) throw new Error('nome repetido');
  assertEquals(repeated.status, 400);

  const noClient = parseIntake({request_id: 'a', paradas: [{tipo: 'entrega'}]});
  if (noClient.ok) throw new Error('sem cliente');
  assertEquals(noClient.status, 400);

  assertEquals(bearerToken('Bearer segredo'), 'segredo');
  assertEquals(bearerToken('bearer segredo'), 'segredo');
  assertEquals(bearerToken(null), '');
  assertEquals(await secretsMatch('segredo', 'segredo'), true);
  assertEquals(await secretsMatch('segredo', 'outro'), false);
  assertEquals(await secretsMatch('segredo', ''), false);
});
