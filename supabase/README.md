# Banco (Supabase / Postgres)

O projeto não usa ferramenta de migration. Os scripts são aplicados à mão no
**SQL Editor** do painel do Supabase, na ordem abaixo.

## Ordem de aplicação

| Ordem | Arquivo | Quando |
|---|---|---|
| 1 | `clone-schema.sql` | Uma vez, ao provisionar um projeto novo. Cria o schema real do sistema. |
| 2 | `migrations/001_controle_financeiro_futuro_up.sql` | Antes de subir o módulo Financeiro. |

Cada script é idempotente (`if not exists` / `exception when duplicate_object`),
então rodar de novo não causa erro.

## Reversão

Cada migration tem um `_down.sql` correspondente. Leia o cabeçalho antes de
executar — o `down` da 001 apaga a projeção financeira e indica como fazer
backup primeiro.

Duas reversões são parciais por limitação do Postgres, e ambas são inofensivas:

- valores acrescentados a um `enum` não podem ser removidos (`app_role.financeiro`);
- funções genéricas (`has_any_role`, `set_updated_at`) ficam comentadas no `down`
  para não quebrar outras migrations que venham a usá-las.

## ⚠️ `schema.sql` está obsoleto

`schema.sql` descreve um schema **que não corresponde ao banco em produção** —
tabelas com `id text` e uma coluna `data jsonb`, além de uma tabela `app_users`
com senha em texto plano. O código não consulta nada disso.

O schema real é o do `clone-schema.sql`: `purchase_requests` com `id uuid`,
`request_number`, `requester_id` e a coluna `extra jsonb`, mais as tabelas
`request_items`, `suppliers`, `status_history`, `profiles` e `user_roles`.

**Não execute `schema.sql`.** Ele foi mantido apenas como registro histórico.

## Pós-migração obrigatório: avançar as sequências de numeração

A migração (`runMigration`, em `src/lib/backend.ts`, roda no navegador) copia
`purchase_requests` e `service_orders` preservando `request_number` /
`order_number` originais do projeto antigo. Ela **não avança** as sequências
que geram esses números para registros novos — o script só fala com o banco
via REST/PostgREST (CRUD em tabelas), e não há RPC arbitrária exposta no
schema para rodar SQL de sequência. Sem esse passo, as sequências continuam
em 1 enquanto as linhas migradas ocupam 1..N, e a primeira solicitação/O.S.
criada depois da migração colide na unique constraint (e cada tentativa
falha queima um valor da sequência, já que `nextval` não é transacional).

Rode manualmente no **SQL Editor** do projeto novo, logo depois que a
migração terminar:

```sql
select setval('public.purchase_requests_request_number_seq',
  coalesce((select max(request_number) from public.purchase_requests), 0) + 1, false);
select setval('public.service_orders_order_number_seq',
  coalesce((select max(order_number) from public.service_orders), 0) + 1, false);
```

## Onde os dados realmente ficam

Ponto importante para qualquer script que leia valores de solicitações: o
aplicativo grava o documento inteiro da solicitação em
`purchase_requests.extra.doc` (JSONB) e o leitor
(`rowToRequest`, em `src/lib/backend.ts`) **retorna esse documento e ignora as
colunas normalizadas**. As colunas `suppliers.value`, `request_items.*` etc. só
são lidas para registros importados do sistema antigo.

Ou seja, o valor de um pedido pode estar em dois lugares diferentes conforme a
origem do registro. O backfill do módulo financeiro lê os dois.
