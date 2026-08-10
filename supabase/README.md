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

## Onde os dados realmente ficam

Ponto importante para qualquer script que leia valores de solicitações: o
aplicativo grava o documento inteiro da solicitação em
`purchase_requests.extra.doc` (JSONB) e o leitor
(`rowToRequest`, em `src/lib/backend.ts`) **retorna esse documento e ignora as
colunas normalizadas**. As colunas `suppliers.value`, `request_items.*` etc. só
são lidas para registros importados do sistema antigo.

Ou seja, o valor de um pedido pode estar em dois lugares diferentes conforme a
origem do registro. O backfill do módulo financeiro lê os dois.
