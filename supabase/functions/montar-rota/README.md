# Montar a rota do dia

Webhook de **entrada**. Um bot faz POST com as paradas e o sistema cria ou atualiza a rota padrão daquele dia no Supabase. O app não muda nesta fase: ele só enxerga a rota pelo realtime que já escuta `routes` e `route_stops`.

Não cadastra cliente, não grava horário nem tipo, e não dispara o webhook de saída (`webhook-config`). Não há trigger em `routes` nem em `route_stops`.

## Endpoint

`POST https://zpvdavopwjlenlvdxumh.supabase.co/functions/v1/montar-rota`

Só POST. O cabeçalho `apikey` leva a chave anônima do projeto (o gateway do Supabase pede uma). O segredo da entrada vai em `Authorization`.

```bash
curl -X POST 'https://zpvdavopwjlenlvdxumh.supabase.co/functions/v1/montar-rota' \
  -H 'Content-Type: application/json' \
  -H 'apikey: <SUPABASE_ANON_KEY>' \
  -H 'Authorization: Bearer <ROUTE_INTAKE_SECRET>' \
  -d '{
    "request_id": "2026-12-15-manha",
    "paradas": [
      {"cliente": "Alfa", "tipo": "coleta", "horario": "08:00"},
      {"cliente": "Zeta", "tipo": "entrega", "horario": "10:00"},
      {"cliente": "Sem Hora"}
    ]
  }'
```

## Payload

| Campo | Obrigatório | Regra |
| --- | --- | --- |
| `request_id` | sim | Texto sem espaços, até 200 caracteres. Repetir o mesmo id devolve a mesma resposta e não grava de novo. |
| `data` | não | `YYYY-MM-DD`. Se faltar, vale hoje em `America/Sao_Paulo`. |
| `paradas` | sim | Lista, no máximo 300. Pode ser vazia. |
| `paradas[].cliente` | um dos dois | Nome. Sem `marmoraria_id`, casa com o cadastro. |
| `paradas[].marmoraria_id` | um dos dois | Id do cadastro. Usado direto, sem chute de nome. É assim que o bot reenvia quem faltou. |
| `paradas[].tipo` | não | `"entrega"` ou `"coleta"`. |
| `paradas[].horario` | não | `HH:MM` (08:00, não 8:30). |

`horario` e `tipo` não viram coluna e não entram no nome da parada. O nome copiado do cadastro é o que sai no WhatsApp.

## Como a rota é escolhida

Uma rota por dia, com o nome que o app usa: `Rota: DD/MM`, criada naquele dia em `America/Sao_Paulo`. Assim o `27/11` de outro ano não entra.

Se essa rota já existe, as paradas casadas entram nela. Se ela estava finalizada e pelo menos uma parada do pedido já estava nela ou entrou nela, volta para `em_andamento` e perde o destino atual. Rota em andamento não perde o destino. Uma lista em que ninguém casa não reabre nada. Rotas `Parte N` não são lidas nem alteradas, e esta entrada nunca cria uma segunda rota nem uma "Parte N".

Cliente que já está `pendente`: a parada fica como está (`ja_na_rota`). Cliente `concluida` ou `nao_entregue`: volta para `pendente`, com `updated_at` novo, e vai para o fim das pendentes. Não duplica parada.

Cliente novo entra `pendente`, depois das pendentes que já estavam na rota e antes das concluídas. Entre as novas e as reativadas deste pedido:

- quem tem horário vem primeiro, em ordem de `HH:MM` (empate mantém a ordem enviada);
- quem não tem horário vem em seguida, na ordem da lista.

Nome, cidade, telefone, latitude e longitude são copiados de `marmorarias`, como o app faz. O id da rota é `route-<epoch ms>` e o da parada é `stop-<epoch ms>-<índice>`.

## Nome do cliente

A comparação tira acento, pontuação, maiúsculas e espaços.

- Um cadastro igual: entra.
- Nenhum igual: `faltando`, com até 3 sugestões parecidas. `Sileo` sugere `Siloe`. A sugestão não é escolhida sozinha.
- Dois cadastros com o mesmo nome: `ambiguos`, com os cadastros. Nada é gravado para essa parada.
- `marmoraria_id` que não existe: `faltando` com `sugestoes` vazio. O restante do pedido ainda é aplicado.

As listas da resposta seguem a ordem enviada. A ordem vista no app é a do `sort_order`.

## Resposta

HTTP 200:

```json
{
  "ok": true,
  "rota": {"id": "route-1790000000000", "nome": "Rota: 15/12", "criada": true, "status": "em_andamento"},
  "adicionadas": [{"cliente": "Alfa", "stop_id": "stop-1790000000000-0", "marmoraria_id": "marm-alfa", "tipo": "coleta", "horario": "08:00"}],
  "reativadas": [{"cliente": "Zeta", "stop_id": "stop-1", "antes": "concluida", "marmoraria_id": "marm-zeta", "tipo": null, "horario": null}],
  "ja_na_rota": [],
  "faltando": [{"cliente": "Sileo", "marmoraria_id": null, "sugestoes": [{"id": "marm-siloe", "nome": "Siloe", "cidade": "Blumenau"}], "tipo": null, "horario": null}],
  "ambiguos": [{"cliente": "Pedra Sul", "cadastros": [{"id": "marm-dup-1", "nome": "Pedra Sul", "cidade": "Brusque"}], "tipo": null, "horario": null}]
}
```

`rota` vem `null` quando ninguém entrou e ainda não existe rota naquele dia.

`cliente` em `adicionadas`, `reativadas` e `ja_na_rota` é o nome do cadastro (ou o nome que já está na parada). Em `faltando` e `ambiguos` é o texto enviado.

Erros:

| HTTP | Quando |
| --- | --- |
| 401 | Segredo ausente ou errado. Corpo: `{"ok": false, "error": "Não autorizado."}` |
| 400 | JSON inválido, campo faltando (`campos`) ou parada inválida (`parada` é o número, começando em 1). Também parada repetida no mesmo pedido. |
| 409 | O mesmo `request_id` chegou com outro payload. A resposta antiga continua valendo. |
| 405 | Método diferente de POST. |
| 500 | Segredo não configurado, migração ainda não aplicada, ou falha interna. |

Se o gateway responder `Invalid JWT` (e não `Não autorizado.`), a função foi publicada com a verificação de JWT ligada. O deploy abaixo desliga isso.

## Idempotência

O mesmo `request_id` com o mesmo conteúdo devolve a resposta gravada e não mexe na rota. Espaço a mais no nome não conta como outro pedido. Outro conteúdo no mesmo id responde 409.

Quem ficou em `faltando` ou `ambiguos` só entra num **novo** `request_id`, em geral com `marmoraria_id`. Reenviar a lista inteira, com id novo, é seguro: pendente continua pendente; concluída ou não entregue volta para pendente; ninguém é duplicado.

## Deploy

Ainda não está aplicado no projeto. Faça nesta ordem, no projeto `zpvdavopwjlenlvdxumh`.

1. Abra o SQL Editor e rode o arquivo `supabase/migrations/20261127123000_montar_rota_intake.sql` inteiro.

   Não use `supabase db push`. O banco já tem migrações que não estão neste repositório; o push tenta reconciliar esse histórico.

2. Crie o segredo (não commite o valor):

   ```bash
   supabase secrets set ROUTE_INTAKE_SECRET='um-segredo-longo-aleatorio' --project-ref zpvdavopwjlenlvdxumh
   ```

   Ou em [Edge Function secrets](https://supabase.com/dashboard/project/zpvdavopwjlenlvdxumh/functions/secrets). `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem na função. Não coloque a service role no bot.

3. Publique só esta função. `supabase/config.toml` marca `verify_jwt = false` para ela. Não rode `supabase config push` com esse arquivo: ele não descreve o resto do projeto.

   ```bash
   supabase functions deploy montar-rota --project-ref zpvdavopwjlenlvdxumh --no-verify-jwt
   ```

4. Chame o curl acima. `Não autorizado.` com o segredo certo significa que o header não chegou. `Invalid JWT` significa que o passo 3 ficou sem `--no-verify-jwt`.

`webhook-config` não entra neste deploy.

## Teste local

```bash
deno test --node-modules-dir=none supabase/functions/montar-rota/logic_test.ts
deno check --node-modules-dir=none supabase/functions/montar-rota/index.ts
```

O SQL roda num Postgres vazio, nunca no projeto remoto. O fixture recusa qualquer banco que não se chame `montar_rota_test`.

```bash
sudo -u postgres psql -c "drop database if exists montar_rota_test;"
sudo -u postgres psql -c "create database montar_rota_test;"
sudo -u postgres psql -d montar_rota_test -v ON_ERROR_STOP=1 -f supabase/tests/fixture.sql
sudo -u postgres psql -d montar_rota_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261127123000_montar_rota_intake.sql
sudo -u postgres psql -d montar_rota_test -v ON_ERROR_STOP=1 -f supabase/tests/montar_rota_test.sql
sudo -u postgres psql -c "drop database if exists montar_rota_test;"
```
