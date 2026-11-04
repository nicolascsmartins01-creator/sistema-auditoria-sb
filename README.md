# Sistema de Auditoria de Vendas — Shopping Benfica

Compara a venda que cada lojista declara ao shopping com a venda captada pela
auditoria e calcula o aluguel percentual no fechamento de cada mês.

> **Dados:** este repositório contém somente dados **fictícios** (testes e seeds).
> Os dados reais do shopping são confidenciais e nunca devem ser versionados.

## Situação das fases

| Fase | Conteúdo | Situação |
|---|---|---|
| 1 | Login, 3 perfis, usuários, cadastro de lojas (vigências e 13º aluguel), importação da planilha de lojas com escolha de colunas | **aprovada** |
| 2 | Lançamento do auditor (busca, calendário, valor, fotos, offline) | **concluída — aguardando aprovação** |
| 3 | Importação do PDF mensal do portal | — |
| 4 | Conciliação, projeção e alertas | — |
| 5 | Ciclo mensal, feriados, fechamento e reabertura | — |
| 6 | Cálculo do aluguel e exportações | — |
| 7 | Lançamentos em lote por planilha | — |
| 8 | Painéis | — |

## Tecnologia

- **Next.js 15** (App Router, TypeScript, Tailwind) — telas e regras no servidor
- **Supabase** — Postgres, login, storage privado e **Row Level Security** (as
  permissões são conferidas pelo banco, não só escondendo botões)
- **Vercel** — hospedagem
- **Vitest** — testes automáticos

## Estrutura

```
supabase/migrations/   esquema do banco, permissões (RLS) e trilha de auditoria
supabase/seed.sql      dados fictícios para homologação
src/app/login          tela de entrada
src/app/(app)/         telas internas (lojas, segmentos, importação, histórico, usuários)
src/lib/formato.ts     R$ 1.234,56 · dd/mm/aaaa · fuso America/Fortaleza
src/lib/importacao-lojas/  leitura e validação linha a linha da planilha de lojas
src/lib/trilha.ts      descrição legível da trilha de auditoria
scripts/criar-admin.ts cria o primeiro Administrador de um projeto novo
test/unit              testes de regras (formatos, planilha, trilha)
test/db                testes de permissão no banco (cada perfil, trilha imutável…)
```

## Regras de segurança implementadas na Fase 1

- **Auditor** vê apenas LUC, nome, localização e segmento das lojas. Não recebe
  percentual, aluguel mínimo, 13º, trilha, importações nem dados de outros usuários.
- **Analista** cadastra lojas, vigências, 13º, segmentos e importa planilhas; vê o histórico.
- **Administrador** faz tudo do Analista e gerencia usuários.
- Usuário desativado não entra (login bloqueado) e não enxerga nada; o histórico dele é mantido.
- Ninguém altera o próprio perfil; o sistema nunca fica sem um Administrador ativo.
- Lojas e usuários não são apagados (só inativados).
- Toda alteração vai para a **trilha de auditoria** (quem, quando, valor anterior,
  valor novo). A trilha não pode ser alterada nem apagada — nem pelo dono do banco.
- Arquivos importados ficam em storage **privado**, sem substituição nem exclusão;
  o download usa link temporário de 60 segundos.

## Como rodar localmente

```bash
npm ci
cp .env.example .env.local   # preencha com os dados do projeto Supabase
npm run dev                  # http://localhost:3000
```

## Banco de dados (projeto Supabase novo)

1. Aplique as migrações de `supabase/migrations/` em ordem (`npx supabase db push`
   ou pelo SQL Editor do Supabase).
2. **Somente em homologação:** rode `supabase/seed.sql` (lojas fictícias).
3. Crie o primeiro Administrador:
   ```bash
   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... npm run criar-admin -- "Nome Completo" login.admin "SenhaForte123"
   ```

## Publicação na Vercel

1. Importe este repositório do GitHub na Vercel (framework: Next.js).
2. Em *Settings → Environment Variables*, cadastre:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (chave pública *anon* ou *publishable*)
   - `SUPABASE_SERVICE_ROLE_KEY` (chave **secreta** — necessária para criar,
     desativar e redefinir senha de usuários; nunca a coloque no código)
3. No Supabase, em *Authentication → URL Configuration*, informe o endereço da Vercel.

## Testes

```bash
npm test          # regras: formatos brasileiros, planilha de lojas, trilha
npm run test:db   # permissões no banco (precisa de um Postgres local; ver abaixo)
```

`test:db` cria um banco descartável e simula o ambiente do Supabase. Por padrão
usa `postgres://postgres@127.0.0.1:54329/postgres` (mude com `TEST_DATABASE_URL`).

## Decisões de negócio

Confirmadas com o setor comercial:

- **Lançamento (Fase 2):** o dia de hoje fica bloqueado (lança-se sempre o dia anterior);
  um lançamento por loja e dia; foto obrigatória (reduzida no aparelho); valor zero aceito
  com foto; em dia lançado por outro auditor aparece o cadeado e o nome, sem valor/fotos.
- **Sem internet:** o lançamento fica guardado no aparelho e é enviado sozinho; vale a hora
  digitada se chegar ao servidor em até 72 h; depois disso entra em análise do Analista.

- **Prazo de lançamento:** do dia 1 até o **dia 5** do mês seguinte, inclusive
  (substitui o "dia 4" da especificação original). A revisão do Analista começa no dia 6.
- **Fechamento automático:** às 23:59 do 5º dia útil do mês seguinte. Se o 5º dia útil
  for o próprio dia 5, o mês fecha às 23:59 do dia 5, sem período de revisão; o
  Analista/Administrador pode reabrir (com motivo) se precisar revisar.
- **Importação de lojas:** o usuário escolhe qual coluna da planilha corresponde a
  cada campo; campo não escolhido não é lido nem alterado.
- Lançamento feito sem internet vale pela **hora em que foi digitado** no aparelho,
  mesmo que chegue ao servidor depois do prazo (regra a implementar na Fase 2).

Tabela de decisões (confirmadas e provisórias):

| Tema | Como está | Fácil de mudar? |
|---|---|---|
| Login | nome de usuário (ex.: `joao.silva`) ou e-mail; senha redefinida pelo Administrador | sim |
| LUC | única entre lojas **ativas** (LUC de loja que saiu pode ser reaproveitada) | sim |
| Vigências | sempre a partir do dia 1º de um mês; percentual único — **confirmado: não existe percentual escalonado** | — |
| 13º não cadastrado | **confirmado: usa o aluguel mínimo padrão** (o sistema apenas sinaliza a falta) | — |
| Auditor | vê todas as lojas auditadas (sem designação por auditor) | sim |
| Planilha de lojas | colunas do modelo próprio; reimportar atualiza a loja pela LUC | sim |
| Segmento | lista mantida pelo Analista (a importação cria segmentos novos) | sim |
