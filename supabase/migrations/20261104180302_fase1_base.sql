-- =============================================================================
-- Sistema de Auditoria de Vendas — Shopping Benfica
-- Fase 1: usuários e perfis, cadastro de lojas (vigências e 13º aluguel),
--         importações e trilha de auditoria.
--
-- Princípios:
--  * Toda permissão é validada AQUI (Row Level Security), não só na tela.
--  * Dados financeiros (percentual, aluguel mínimo, 13º) ficam em tabelas
--    separadas do cadastro básico — o Auditor enxerga a loja, nunca os valores.
--  * Nada é apagado de verdade: lojas e usuários são inativados.
--  * Toda alteração gera registro na trilha_auditoria por gatilho (trigger),
--    que não pode ser editada nem apagada por ninguém.
--  * Valores em R$: numeric(14,2). Percentual: numeric(7,4) em pontos
--    percentuais (6,5% é gravado como 6.5000).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Perfis e usuários
-- -----------------------------------------------------------------------------
create type public.perfil_usuario as enum ('auditor', 'analista', 'administrador');

create table public.usuarios (
  id            uuid primary key references auth.users (id) on delete restrict,
  nome          text not null check (length(btrim(nome)) > 0),
  login         text not null check (login = lower(btrim(login)) and length(login) >= 3),
  perfil        public.perfil_usuario not null default 'auditor',
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  criado_por    uuid references public.usuarios (id),
  atualizado_em timestamptz not null default now()
);
create unique index usuarios_login_uk on public.usuarios (login);
comment on table public.usuarios is
  'Usuários do sistema. Nunca são apagados: desativar = ativo false (o histórico continua apontando para eles).';

-- Funções auxiliares usadas nas políticas. SECURITY DEFINER para poderem ler
-- a tabela usuarios sem depender das políticas dela (evita recursão).
create function public.perfil_atual()
returns public.perfil_usuario
language sql stable security definer set search_path = ''
as $$
  select u.perfil from public.usuarios u where u.id = auth.uid() and u.ativo
$$;

create function public.eh_usuario_ativo()
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.perfil_atual() is not null $$;

create function public.eh_analista()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.perfil_atual() in ('analista', 'administrador'), false) $$;

create function public.eh_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.perfil_atual() = 'administrador', false) $$;

-- -----------------------------------------------------------------------------
-- Segmentos (lista mantida pelo Analista)
-- -----------------------------------------------------------------------------
create table public.segmentos (
  id            integer generated always as identity primary key,
  nome          text not null check (length(btrim(nome)) > 0 and nome = btrim(nome)),
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);
create unique index segmentos_nome_uk on public.segmentos (lower(nome));

-- -----------------------------------------------------------------------------
-- Lojas (cadastro básico — visível a todos os perfis)
-- -----------------------------------------------------------------------------
create table public.lojas (
  id             uuid primary key default gen_random_uuid(),
  -- Nº LUC exatamente como o portal escreve (ex.: "LJ 101/102/102A", "Q 001C", "T1").
  -- Só removemos espaços nas pontas e espaços repetidos.
  luc            text not null check (length(luc) > 0 and luc = regexp_replace(btrim(luc), '\s+', ' ', 'g')),
  nome_fantasia  text not null check (length(btrim(nome_fantasia)) > 0),
  localizacao    text,
  segmento_id    integer references public.segmentos (id),
  auditada       boolean not null default true,
  ativa          boolean not null default true,
  criado_em      timestamptz not null default now(),
  criado_por     uuid references public.usuarios (id) default auth.uid(),
  atualizado_em  timestamptz not null default now()
);
-- A LUC é única entre as lojas ATIVAS (permite reaproveitar a LUC de uma loja
-- que saiu, mantendo o histórico da anterior).
create unique index lojas_luc_ativa_uk on public.lojas (luc) where ativa;
create index lojas_luc_idx on public.lojas (luc);
create index lojas_nome_idx on public.lojas (lower(nome_fantasia));

-- -----------------------------------------------------------------------------
-- Valores contratuais com vigência (somente Analista/Administrador)
-- Vigência sempre começa no dia 1º de um mês: o cálculo é mensal.
-- -----------------------------------------------------------------------------
create table public.loja_percentuais (
  id               uuid primary key default gen_random_uuid(),
  loja_id          uuid not null references public.lojas (id) on delete restrict,
  vigencia_inicio  date not null check (extract(day from vigencia_inicio) = 1),
  percentual       numeric(7,4) not null check (percentual > 0 and percentual <= 100),
  criado_em        timestamptz not null default now(),
  criado_por       uuid references public.usuarios (id) default auth.uid(),
  unique (loja_id, vigencia_inicio)
);
comment on column public.loja_percentuais.percentual is 'Pontos percentuais: 6,5% = 6.5000';

create table public.loja_alugueis_minimos (
  id               uuid primary key default gen_random_uuid(),
  loja_id          uuid not null references public.lojas (id) on delete restrict,
  vigencia_inicio  date not null check (extract(day from vigencia_inicio) = 1),
  valor            numeric(14,2) not null check (valor >= 0),
  criado_em        timestamptz not null default now(),
  criado_por       uuid references public.usuarios (id) default auth.uid(),
  unique (loja_id, vigencia_inicio)
);

-- 13º aluguel: substitui o aluguel mínimo em dezembro do ano informado.
create table public.loja_aluguel_dezembro (
  id          uuid primary key default gen_random_uuid(),
  loja_id     uuid not null references public.lojas (id) on delete restrict,
  ano         integer not null check (ano between 2000 and 2100),
  valor       numeric(14,2) not null check (valor >= 0),
  criado_em   timestamptz not null default now(),
  criado_por  uuid references public.usuarios (id) default auth.uid(),
  unique (loja_id, ano)
);

-- Valores vigentes de uma loja num mês. Única porta de entrada para os
-- cálculos das próximas fases. SECURITY INVOKER: respeita as políticas
-- (o Auditor não recebe nada).
--   * falta_13_aluguel = true quando é dezembro e não há 13º cadastrado
--     para o ano; nesse caso aluguel_minimo traz o mínimo padrão e quem
--     calcula decide o que fazer (regra pendente de definição).
create function public.valores_vigentes(p_loja_id uuid, p_ano integer, p_mes integer)
returns table (
  percentual                 numeric,
  percentual_vigencia_inicio date,
  aluguel_minimo             numeric,
  minimo_vigencia_inicio     date,
  minimo_eh_13_aluguel       boolean,
  falta_13_aluguel           boolean
)
language sql stable security invoker set search_path = ''
as $$
  with ref as (select make_date(p_ano, p_mes, 1) as d),
  pct as (
    select p.percentual, p.vigencia_inicio
      from public.loja_percentuais p, ref
     where p.loja_id = p_loja_id and p.vigencia_inicio <= ref.d
     order by p.vigencia_inicio desc limit 1
  ),
  minimo as (
    select m.valor, m.vigencia_inicio
      from public.loja_alugueis_minimos m, ref
     where m.loja_id = p_loja_id and m.vigencia_inicio <= ref.d
     order by m.vigencia_inicio desc limit 1
  ),
  dez as (
    select d.valor from public.loja_aluguel_dezembro d
     where p_mes = 12 and d.loja_id = p_loja_id and d.ano = p_ano
  )
  select
    (select percentual from pct),
    (select vigencia_inicio from pct),
    coalesce((select valor from dez), (select valor from minimo)),
    case when exists (select 1 from dez) then null else (select vigencia_inicio from minimo) end,
    exists (select 1 from dez),
    (p_mes = 12 and not exists (select 1 from dez))
$$;

-- -----------------------------------------------------------------------------
-- Importações (Central de importação)
-- -----------------------------------------------------------------------------
create table public.importacoes (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in ('lojas')),
  arquivo_nome   text not null,
  arquivo_path   text not null,
  resumo         jsonb not null default '{}'::jsonb,
  criado_em      timestamptz not null default now(),
  criado_por     uuid references public.usuarios (id) default auth.uid()
);

-- -----------------------------------------------------------------------------
-- Trilha de auditoria (somente inclusão)
-- -----------------------------------------------------------------------------
create table public.trilha_auditoria (
  id                bigint generated always as identity primary key,
  ocorrido_em       timestamptz not null default now(),
  usuario_id        uuid,
  acao              text not null,          -- INSERT | UPDATE | DELETE
  tabela            text not null,
  registro_id       text,
  dados_anteriores  jsonb,
  dados_novos       jsonb,
  motivo            text,
  importacao_id     uuid
);
create index trilha_registro_idx on public.trilha_auditoria (tabela, registro_id, ocorrido_em desc);
create index trilha_quando_idx on public.trilha_auditoria (ocorrido_em desc);
comment on table public.trilha_auditoria is
  'Quem, quando, valor anterior, valor novo e motivo de toda alteração. Não pode ser alterada nem apagada.';

-- Gatilho genérico: grava a alteração. O motivo e a importação vêm de
-- variáveis da transação (set_config('app.motivo', ...)) definidas pelas
-- funções de negócio que exigem motivo.
create function public.registrar_trilha()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_id  text;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  if tg_op = 'UPDATE' then
    -- ignora atualizações que não mudam nada além do carimbo de data
    if (v_old - 'atualizado_em') = (v_new - 'atualizado_em') then return new; end if;
  end if;
  v_id := coalesce(v_new ->> 'id', v_old ->> 'id');
  insert into public.trilha_auditoria
    (usuario_id, acao, tabela, registro_id, dados_anteriores, dados_novos, motivo, importacao_id)
  values
    (auth.uid(), tg_op, tg_table_name, v_id, v_old, v_new,
     nullif(current_setting('app.motivo', true), ''),
     nullif(current_setting('app.importacao_id', true), '')::uuid);
  return coalesce(new, old);
end;
$$;

create function public.bloquear_alteracao_trilha()
returns trigger
language plpgsql
as $$
begin
  raise exception 'A trilha de auditoria não pode ser alterada nem apagada.';
end;
$$;
create trigger trilha_imutavel
  before update or delete on public.trilha_auditoria
  for each row execute function public.bloquear_alteracao_trilha();
create trigger trilha_imutavel_truncate
  before truncate on public.trilha_auditoria
  for each statement execute function public.bloquear_alteracao_trilha();

create function public.tocar_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger usuarios_atualizado before update on public.usuarios
  for each row execute function public.tocar_atualizado_em();
create trigger lojas_atualizado before update on public.lojas
  for each row execute function public.tocar_atualizado_em();

do $$
declare t text;
begin
  foreach t in array array['usuarios','segmentos','lojas','loja_percentuais',
                           'loja_alugueis_minimos','loja_aluguel_dezembro','importacoes']
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.registrar_trilha()', t || '_trilha', t);
  end loop;
end;
$$;

-- Proteções de usuários: ninguém altera o próprio perfil/situação, e o
-- sistema nunca fica sem um Administrador ativo.
create function public.proteger_usuarios()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.id = auth.uid() and (new.perfil <> old.perfil or new.ativo <> old.ativo) then
    raise exception 'Você não pode alterar o seu próprio perfil ou desativar a si mesmo.';
  end if;
  if new.login <> old.login then
    raise exception 'O login não pode ser alterado.';
  end if;
  if old.perfil = 'administrador' and old.ativo
     and (new.perfil <> 'administrador' or not new.ativo)
     and not exists (select 1 from public.usuarios
                      where perfil = 'administrador' and ativo and id <> old.id) then
    raise exception 'O sistema precisa de pelo menos um Administrador ativo.';
  end if;
  return new;
end;
$$;
create trigger usuarios_protecao before update on public.usuarios
  for each row execute function public.proteger_usuarios();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.usuarios              enable row level security;
alter table public.segmentos             enable row level security;
alter table public.lojas                 enable row level security;
alter table public.loja_percentuais      enable row level security;
alter table public.loja_alugueis_minimos enable row level security;
alter table public.loja_aluguel_dezembro enable row level security;
alter table public.importacoes           enable row level security;
alter table public.trilha_auditoria      enable row level security;

-- Visitante não autenticado não acessa nada.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated, service_role;

-- Nenhum perfil apaga registros (inativação no lugar de exclusão), exceto
-- correção de vigências pelo Analista (registrada na trilha).
revoke delete, truncate on public.usuarios, public.segmentos, public.lojas,
  public.importacoes, public.trilha_auditoria from authenticated;
revoke update, delete, truncate on public.trilha_auditoria from authenticated, service_role;
revoke update, delete on public.importacoes from authenticated;

-- usuarios: cada um vê a si mesmo; Analista/Admin veem todos (nomes na trilha);
-- só o Administrador cria e altera.
create policy usuarios_select on public.usuarios for select to authenticated
  using (id = auth.uid() or public.eh_analista());
create policy usuarios_insert on public.usuarios for insert to authenticated
  with check (public.eh_admin());
create policy usuarios_update on public.usuarios for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- segmentos e lojas: leitura por qualquer usuário ativo; escrita pelo Analista.
create policy segmentos_select on public.segmentos for select to authenticated
  using (public.eh_usuario_ativo());
create policy segmentos_insert on public.segmentos for insert to authenticated
  with check (public.eh_analista());
create policy segmentos_update on public.segmentos for update to authenticated
  using (public.eh_analista()) with check (public.eh_analista());

create policy lojas_select on public.lojas for select to authenticated
  using (public.eh_usuario_ativo());
create policy lojas_insert on public.lojas for insert to authenticated
  with check (public.eh_analista());
create policy lojas_update on public.lojas for update to authenticated
  using (public.eh_analista()) with check (public.eh_analista());

-- valores contratuais: somente Analista/Admin, em qualquer operação.
create policy percentuais_analista on public.loja_percentuais for all to authenticated
  using (public.eh_analista()) with check (public.eh_analista());
create policy minimos_analista on public.loja_alugueis_minimos for all to authenticated
  using (public.eh_analista()) with check (public.eh_analista());
create policy dezembro_analista on public.loja_aluguel_dezembro for all to authenticated
  using (public.eh_analista()) with check (public.eh_analista());

create policy importacoes_select on public.importacoes for select to authenticated
  using (public.eh_analista());
create policy importacoes_insert on public.importacoes for insert to authenticated
  with check (public.eh_analista());

create policy trilha_select on public.trilha_auditoria for select to authenticated
  using (public.eh_analista());
-- (sem política de insert: só os gatilhos, que rodam como dono, gravam)

-- -----------------------------------------------------------------------------
-- Storage privado para arquivos importados
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('importacoes', 'importacoes', false)
on conflict (id) do nothing;

create policy importacoes_arquivos_select on storage.objects for select to authenticated
  using (bucket_id = 'importacoes' and public.eh_analista());
create policy importacoes_arquivos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'importacoes' and public.eh_analista());
-- sem update/delete: arquivo arquivado não é substituído nem apagado.

-- -----------------------------------------------------------------------------
-- Importação da planilha de lojas (tudo ou nada, numa única transação)
-- p_linhas: array de objetos já validados pela aplicação; o banco revalida
-- pelas próprias restrições e políticas.
--   { luc, nome_fantasia, localizacao, segmento, auditada, ativa,
--     percentual, percentual_vigencia, aluguel_minimo, minimo_vigencia,
--     ano_13, valor_13 }
-- -----------------------------------------------------------------------------
create function public.importar_lojas(p_arquivo_nome text, p_arquivo_path text, p_linhas jsonb)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_importacao uuid := gen_random_uuid();
  l            jsonb;
  v_loja       public.lojas;
  v_segmento   integer;
  v_criadas    integer := 0;
  v_atualizadas integer := 0;
  v_vigencias  integer := 0;
  v_13         integer := 0;
  v_resumo     jsonb;
begin
  if not public.eh_analista() then
    raise exception 'Somente Analista ou Administrador pode importar lojas.';
  end if;

  perform set_config('app.importacao_id', v_importacao::text, true);

  for l in select * from jsonb_array_elements(p_linhas)
  loop
    -- segmento (cria se não existir)
    v_segmento := null;
    if coalesce(btrim(l ->> 'segmento'), '') <> '' then
      select id into v_segmento from public.segmentos where lower(nome) = lower(btrim(l ->> 'segmento'));
      if v_segmento is null then
        insert into public.segmentos (nome) values (btrim(l ->> 'segmento')) returning id into v_segmento;
      end if;
    end if;

    -- localiza a loja pela LUC: primeiro a ativa, senão a inativa mais recente
    select * into v_loja from public.lojas
     where luc = l ->> 'luc'
     order by ativa desc, atualizado_em desc
     limit 1;

    if v_loja.id is null then
      insert into public.lojas (luc, nome_fantasia, localizacao, segmento_id, auditada, ativa)
      values (l ->> 'luc', l ->> 'nome_fantasia', nullif(l ->> 'localizacao', ''), v_segmento,
              coalesce((l ->> 'auditada')::boolean, true), coalesce((l ->> 'ativa')::boolean, true))
      returning * into v_loja;
      v_criadas := v_criadas + 1;
    else
      update public.lojas set
        nome_fantasia = l ->> 'nome_fantasia',
        localizacao   = nullif(l ->> 'localizacao', ''),
        segmento_id   = v_segmento,
        auditada      = coalesce((l ->> 'auditada')::boolean, v_loja.auditada),
        ativa         = coalesce((l ->> 'ativa')::boolean, v_loja.ativa)
      where id = v_loja.id
        and (nome_fantasia, localizacao, segmento_id, auditada, ativa) is distinct from
            (l ->> 'nome_fantasia', nullif(l ->> 'localizacao', ''), v_segmento,
             coalesce((l ->> 'auditada')::boolean, v_loja.auditada),
             coalesce((l ->> 'ativa')::boolean, v_loja.ativa));
      if found then v_atualizadas := v_atualizadas + 1; end if;
    end if;

    if l ->> 'percentual' is not null then
      insert into public.loja_percentuais (loja_id, vigencia_inicio, percentual)
      values (v_loja.id, (l ->> 'percentual_vigencia')::date, (l ->> 'percentual')::numeric)
      on conflict (loja_id, vigencia_inicio) do update set percentual = excluded.percentual
        where public.loja_percentuais.percentual <> excluded.percentual;
      if found then v_vigencias := v_vigencias + 1; end if;
    end if;

    if l ->> 'aluguel_minimo' is not null then
      insert into public.loja_alugueis_minimos (loja_id, vigencia_inicio, valor)
      values (v_loja.id, (l ->> 'minimo_vigencia')::date, (l ->> 'aluguel_minimo')::numeric)
      on conflict (loja_id, vigencia_inicio) do update set valor = excluded.valor
        where public.loja_alugueis_minimos.valor <> excluded.valor;
      if found then v_vigencias := v_vigencias + 1; end if;
    end if;

    if l ->> 'valor_13' is not null then
      insert into public.loja_aluguel_dezembro (loja_id, ano, valor)
      values (v_loja.id, (l ->> 'ano_13')::integer, (l ->> 'valor_13')::numeric)
      on conflict (loja_id, ano) do update set valor = excluded.valor
        where public.loja_aluguel_dezembro.valor <> excluded.valor;
      if found then v_13 := v_13 + 1; end if;
    end if;
  end loop;

  v_resumo := jsonb_build_object(
    'linhas', jsonb_array_length(p_linhas),
    'lojas_criadas', v_criadas,
    'lojas_atualizadas', v_atualizadas,
    'vigencias_gravadas', v_vigencias,
    'alugueis_13_gravados', v_13);

  insert into public.importacoes (id, tipo, arquivo_nome, arquivo_path, resumo)
  values (v_importacao, 'lojas', p_arquivo_nome, p_arquivo_path, v_resumo);

  return v_resumo || jsonb_build_object('importacao_id', v_importacao);
end;
$$;
revoke execute on function public.importar_lojas(text, text, jsonb) from anon, public;
grant execute on function public.importar_lojas(text, text, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Eventos sem alteração de tabela (ex.: redefinição de senha) também vão para
-- a trilha. Só tipos conhecidos; quem chama precisa ter permissão para o evento.
-- -----------------------------------------------------------------------------
create function public.registrar_evento(p_acao text, p_tabela text, p_registro_id text, p_motivo text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_acao = 'SENHA_REDEFINIDA' then
    if not public.eh_admin() then raise exception 'Sem permissão.'; end if;
  elsif p_acao = 'SENHA_ALTERADA' then
    if not public.eh_usuario_ativo() or p_registro_id <> auth.uid()::text then raise exception 'Sem permissão.'; end if;
  else
    raise exception 'Evento desconhecido: %', p_acao;
  end if;
  insert into public.trilha_auditoria (usuario_id, acao, tabela, registro_id, motivo)
  values (auth.uid(), p_acao, p_tabela, p_registro_id, p_motivo);
end;
$$;
revoke execute on function public.registrar_evento(text, text, text, text) from anon, public;
grant execute on function public.registrar_evento(text, text, text, text) to authenticated;
