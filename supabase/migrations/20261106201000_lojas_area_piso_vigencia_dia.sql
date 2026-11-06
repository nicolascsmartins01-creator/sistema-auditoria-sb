-- Cadastro de lojas: área (m²) e piso; vigência pode começar em qualquer dia.

-- 1) Novos campos da loja (informações físicas, visíveis a todos os perfis).
alter table public.lojas add column area_m2 numeric(12,2) check (area_m2 is null or area_m2 >= 0);
alter table public.lojas add column piso text;

-- 2) Vigência em qualquer dia (contratos negociados com início no meio do mês).
alter table public.loja_percentuais drop constraint loja_percentuais_vigencia_inicio_check;
alter table public.loja_alugueis_minimos drop constraint loja_alugueis_minimos_vigencia_inicio_check;

-- 3) Valores do mês: vale a vigência que começou até o ÚLTIMO dia do mês
--    (uma vigência iniciada em 15/09 já vale para setembro inteiro).
create or replace function public.valores_vigentes(p_loja_id uuid, p_ano integer, p_mes integer)
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
  with ref as (select (make_date(p_ano, p_mes, 1) + interval '1 month' - interval '1 day')::date as d),
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

-- 4) Importação: área e piso; loja nova sem nome é cadastrada com a LUC como nome.
create or replace function public.importar_lojas(
  p_arquivo_nome text, p_arquivo_path text, p_linhas jsonb, p_campos jsonb default '[]'::jsonb)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_importacao  uuid := gen_random_uuid();
  l             jsonb;
  v_loja        public.lojas;
  v_segmento    integer;
  v_nome        text;
  v_local       text;
  v_piso        text;
  v_area        numeric;
  v_seg         integer;
  v_aud         boolean;
  v_atv         boolean;
  v_vig         date;
  v_criadas     integer := 0;
  v_atualizadas integer := 0;
  v_vigencias   integer := 0;
  v_13          integer := 0;
  v_resumo      jsonb;
begin
  if not public.eh_analista() then
    raise exception 'Somente Analista ou Administrador pode importar lojas.';
  end if;

  perform set_config('app.importacao_id', v_importacao::text, true);

  for l in select * from jsonb_array_elements(p_linhas)
  loop
    v_segmento := null;
    if l ? 'segmento' and coalesce(btrim(l ->> 'segmento'), '') <> '' then
      select id into v_segmento from public.segmentos where lower(nome) = lower(btrim(l ->> 'segmento'));
      if v_segmento is null then
        insert into public.segmentos (nome) values (btrim(l ->> 'segmento')) returning id into v_segmento;
      end if;
    end if;

    select * into v_loja from public.lojas
     where luc = l ->> 'luc'
     order by ativa desc, atualizado_em desc
     limit 1;

    if v_loja.id is null then
      insert into public.lojas (luc, nome_fantasia, localizacao, piso, area_m2, segmento_id, auditada, ativa)
      values (l ->> 'luc', coalesce(nullif(btrim(l ->> 'nome_fantasia'), ''), l ->> 'luc'),
              nullif(l ->> 'localizacao', ''), nullif(l ->> 'piso', ''), (l ->> 'area_m2')::numeric, v_segmento,
              coalesce((l ->> 'auditada')::boolean, true), coalesce((l ->> 'ativa')::boolean, true))
      returning * into v_loja;
      v_criadas := v_criadas + 1;
    else
      v_nome  := coalesce(nullif(btrim(l ->> 'nome_fantasia'), ''), v_loja.nome_fantasia);
      v_local := case when l ? 'localizacao' then nullif(l ->> 'localizacao', '') else v_loja.localizacao end;
      v_piso  := case when l ? 'piso' then nullif(l ->> 'piso', '') else v_loja.piso end;
      v_area  := case when l ? 'area_m2' then (l ->> 'area_m2')::numeric else v_loja.area_m2 end;
      v_seg   := case when l ? 'segmento' then v_segmento else v_loja.segmento_id end;
      v_aud   := coalesce((l ->> 'auditada')::boolean, v_loja.auditada);
      v_atv   := coalesce((l ->> 'ativa')::boolean, v_loja.ativa);
      if (v_nome, v_local, v_piso, v_area, v_seg, v_aud, v_atv) is distinct from
         (v_loja.nome_fantasia, v_loja.localizacao, v_loja.piso, v_loja.area_m2, v_loja.segmento_id, v_loja.auditada, v_loja.ativa) then
        update public.lojas
           set nome_fantasia = v_nome, localizacao = v_local, piso = v_piso, area_m2 = v_area,
               segmento_id = v_seg, auditada = v_aud, ativa = v_atv
         where id = v_loja.id
        returning * into v_loja;
        v_atualizadas := v_atualizadas + 1;
      end if;
    end if;

    if l ->> 'percentual' is not null then
      v_vig := (l ->> 'percentual_vigencia')::date;
      if v_vig is null then
        update public.loja_percentuais set percentual = (l ->> 'percentual')::numeric
         where loja_id = v_loja.id and vigencia_inicio is null and percentual <> (l ->> 'percentual')::numeric;
        if found then v_vigencias := v_vigencias + 1;
        elsif not exists (select 1 from public.loja_percentuais where loja_id = v_loja.id and vigencia_inicio is null) then
          insert into public.loja_percentuais (loja_id, vigencia_inicio, percentual) values (v_loja.id, null, (l ->> 'percentual')::numeric);
          v_vigencias := v_vigencias + 1;
        end if;
      else
        insert into public.loja_percentuais (loja_id, vigencia_inicio, percentual)
        values (v_loja.id, v_vig, (l ->> 'percentual')::numeric)
        on conflict (loja_id, vigencia_inicio) do update set percentual = excluded.percentual
          where public.loja_percentuais.percentual <> excluded.percentual;
        if found then v_vigencias := v_vigencias + 1; end if;
      end if;
    end if;

    if l ->> 'aluguel_minimo' is not null then
      v_vig := (l ->> 'minimo_vigencia')::date;
      if v_vig is null then
        update public.loja_alugueis_minimos set valor = (l ->> 'aluguel_minimo')::numeric
         where loja_id = v_loja.id and vigencia_inicio is null and valor <> (l ->> 'aluguel_minimo')::numeric;
        if found then v_vigencias := v_vigencias + 1;
        elsif not exists (select 1 from public.loja_alugueis_minimos where loja_id = v_loja.id and vigencia_inicio is null) then
          insert into public.loja_alugueis_minimos (loja_id, vigencia_inicio, valor) values (v_loja.id, null, (l ->> 'aluguel_minimo')::numeric);
          v_vigencias := v_vigencias + 1;
        end if;
      else
        insert into public.loja_alugueis_minimos (loja_id, vigencia_inicio, valor)
        values (v_loja.id, v_vig, (l ->> 'aluguel_minimo')::numeric)
        on conflict (loja_id, vigencia_inicio) do update set valor = excluded.valor
          where public.loja_alugueis_minimos.valor <> excluded.valor;
        if found then v_vigencias := v_vigencias + 1; end if;
      end if;
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
    'alugueis_13_gravados', v_13,
    'campos', coalesce(p_campos, '[]'::jsonb));

  insert into public.importacoes (id, tipo, arquivo_nome, arquivo_path, resumo)
  values (v_importacao, 'lojas', p_arquivo_nome, p_arquivo_path, v_resumo);

  return v_resumo || jsonb_build_object('importacao_id', v_importacao);
end;
$$;
