-- =============================================================================
-- Fase 5: ciclo mensal, feriados, fechamento automático/antecipado, reabertura
--
-- Regras FIXAS (nenhum perfil altera; só a tabela de feriados é mantida pelo
-- Administrador):
--  * Lançamentos de um mês: até 23:59 do dia 5 do mês seguinte.
--  * Do dia 6 até o fechamento: "revisão" (auditor não lança; Analista edita).
--  * Fechamento automático: 23:59 do 5º dia útil do mês seguinte.
--    Dia útil = segunda a sexta, exceto feriados (nacionais, CE e Fortaleza).
--    Se o 5º dia útil for o próprio dia 5, fecha às 23:59 do dia 5.
--  * Fechamento antecipado pelo Analista/Admin encerra o mês na hora.
--  * Fechado = sem lançamentos, edições ou importação do informado.
--  * Reabertura só por Analista/Admin, com motivo. Ao refechar, nova versão do
--    relatório; versões anteriores ficam consultáveis e não mudam.
-- =============================================================================

create table public.feriados (
  data       date primary key,
  descricao  text not null check (length(btrim(descricao)) > 0),
  esfera     text not null check (esfera in ('nacional', 'estadual', 'municipal')),
  criado_em  timestamptz not null default now(),
  criado_por uuid references public.usuarios (id) default auth.uid()
);
create trigger feriados_trilha after insert or update or delete on public.feriados
  for each row execute function public.registrar_trilha();
alter table public.feriados enable row level security;
revoke all on public.feriados from anon;
create policy feriados_select on public.feriados for select to authenticated using (public.eh_usuario_ativo());
create policy feriados_admin on public.feriados for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- Feriados de 2026 e 2027 (conferir e completar pelo Administrador).
insert into public.feriados (data, descricao, esfera) values
  ('2026-01-01', 'Confraternização Universal', 'nacional'),
  ('2026-03-19', 'São José (Ceará)', 'estadual'),
  ('2026-03-25', 'Data Magna do Ceará', 'estadual'),
  ('2026-04-03', 'Paixão de Cristo', 'nacional'),
  ('2026-04-21', 'Tiradentes', 'nacional'),
  ('2026-05-01', 'Dia do Trabalho', 'nacional'),
  ('2026-06-04', 'Corpus Christi (Fortaleza)', 'municipal'),
  ('2026-08-15', 'Nossa Senhora da Assunção (Fortaleza)', 'municipal'),
  ('2026-09-07', 'Independência do Brasil', 'nacional'),
  ('2026-10-12', 'Nossa Senhora Aparecida', 'nacional'),
  ('2026-11-02', 'Finados', 'nacional'),
  ('2026-11-15', 'Proclamação da República', 'nacional'),
  ('2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional'),
  ('2026-12-25', 'Natal', 'nacional'),
  ('2027-01-01', 'Confraternização Universal', 'nacional'),
  ('2027-03-19', 'São José (Ceará)', 'estadual'),
  ('2027-03-25', 'Data Magna do Ceará', 'estadual'),
  ('2027-03-26', 'Paixão de Cristo', 'nacional'),
  ('2027-04-21', 'Tiradentes', 'nacional'),
  ('2027-05-01', 'Dia do Trabalho', 'nacional'),
  ('2027-05-27', 'Corpus Christi (Fortaleza)', 'municipal'),
  ('2027-08-15', 'Nossa Senhora da Assunção (Fortaleza)', 'municipal'),
  ('2027-09-07', 'Independência do Brasil', 'nacional'),
  ('2027-10-12', 'Nossa Senhora Aparecida', 'nacional'),
  ('2027-11-02', 'Finados', 'nacional'),
  ('2027-11-15', 'Proclamação da República', 'nacional'),
  ('2027-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional'),
  ('2027-12-25', 'Natal', 'nacional')
on conflict (data) do nothing;

-- 5º dia útil do mês seguinte à competência.
create function public.quinto_dia_util(p_competencia date)
returns date
language plpgsql stable set search_path = ''
as $$
declare
  d date := (date_trunc('month', p_competencia) + interval '1 month')::date;
  n integer := 0;
begin
  loop
    if extract(isodow from d) < 6 and not exists (select 1 from public.feriados f where f.data = d) then
      n := n + 1;
      if n = 5 then return d; end if;
    end if;
    d := d + 1;
  end loop;
end;
$$;

-- Momento do fechamento automático: fim (23:59:59) do 5º dia útil, em Fortaleza.
create function public.fechamento_automatico_em(p_competencia date)
returns timestamptz
language sql stable set search_path = ''
as $$ select ((public.quinto_dia_util(p_competencia) + 1)::timestamp at time zone 'America/Fortaleza') $$;

-- Controle do mês (sem linha = segue o ciclo normal).
create table public.meses (
  competencia   date primary key check (extract(day from competencia) = 1),
  situacao      text not null check (situacao in ('fechado', 'reaberto')),
  versao_atual  integer not null default 0,
  atualizado_em timestamptz not null default now()
);
create trigger meses_atualizado before update on public.meses
  for each row execute function public.tocar_atualizado_em();
create trigger meses_trilha after insert or update or delete on public.meses
  for each row execute function public.registrar_trilha();
alter table public.meses enable row level security;
revoke all on public.meses from anon;
revoke insert, update, delete, truncate on public.meses from authenticated;
create policy meses_select on public.meses for select to authenticated using (public.eh_usuario_ativo());

-- Situação efetiva do mês: aberto | revisao | fechado | reaberto
create function public.situacao_mes(p_competencia date, p_agora timestamptz default now())
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare v text;
begin
  select situacao into v from public.meses where competencia = date_trunc('month', p_competencia)::date;
  if v is not null then return v; end if;
  if p_agora >= public.fechamento_automatico_em(p_competencia) then return 'fechado'; end if;
  if p_agora >= public.prazo_lancamento(p_competencia) then return 'revisao'; end if;
  return 'aberto';
end;
$$;

-- Versões do relatório emitido no fechamento (imutáveis).
create table public.fechamento_versoes (
  id           uuid primary key default gen_random_uuid(),
  competencia  date not null check (extract(day from competencia) = 1),
  versao       integer not null,
  tipo         text not null check (tipo in ('automatico', 'antecipado', 'refechamento')),
  gerado_em    timestamptz not null default now(),
  gerado_por   uuid references public.usuarios (id),
  dados        jsonb not null,
  unique (competencia, versao)
);
create trigger fechamento_versoes_imutavel before update or delete on public.fechamento_versoes
  for each row execute function public.bloquear_alteracao_trilha();
create trigger fechamento_versoes_trilha after insert on public.fechamento_versoes
  for each row execute function public.registrar_trilha();
alter table public.fechamento_versoes enable row level security;
revoke all on public.fechamento_versoes from anon;
revoke insert, update, delete, truncate on public.fechamento_versoes from authenticated;
create policy fechamento_versoes_select on public.fechamento_versoes for select to authenticated using (public.eh_analista());

-- -----------------------------------------------------------------------------
-- Relatório da conciliação calculado no banco (a mesma regra de
-- src/lib/conciliacao.ts), para que a versão emitida não dependa da tela.
-- -----------------------------------------------------------------------------
create function public.relatorio_conciliacao(p_competencia date)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with par as (
    select p_competencia c, (p_competencia + interval '1 month')::date f,
           extract(day from (p_competencia + interval '1 month' - interval '1 day'))::int dias
  ),
  inf as (
    select v.loja_id, sum(v.valor) informado from public.vendas_informadas v, par
     where v.competencia = par.c and v.loja_id is not null group by v.loja_id
  ),
  lan as (
    select l.loja_id, l.id, l.data_venda, l.valor from public.lancamentos l, par
     where l.situacao = 'valido' and l.data_venda >= par.c and l.data_venda < par.f
  ),
  agg as (select loja_id, count(*) n, sum(valor) soma from lan group by loja_id),
  base as (
    select j.id loja_id, j.luc, j.nome_fantasia nome, i.informado, coalesce(a.n, 0) n, coalesce(a.soma, 0) soma
      from public.lojas j
      left join inf i on i.loja_id = j.id
      left join agg a on a.loja_id = j.id
     where (j.auditada and j.ativa) or a.n is not null
  ),
  conc as (
    select b.*, par.dias,
           round(b.informado / par.dias, 2) media_inf,
           round(b.soma / b.n, 2) media_aud,
           round(b.soma / b.n * par.dias, 2) projecao,
           round(b.soma / b.n * par.dias, 2) - b.informado diferenca,
           case when b.informado = 0 then null else round((round(b.soma / b.n * par.dias, 2) - b.informado) / b.informado * 100, 2) end pct,
           (select to_jsonb(v) from public.valores_vigentes(b.loja_id, extract(year from par.c)::int, extract(month from par.c)::int) v) vigentes
      from base b, par
     where b.informado is not null and b.n > 0
  )
  select jsonb_build_object(
    'competencia', (select c from par),
    'dias_no_mes', (select dias from par),
    'calculado_em', now(),
    'lojas', coalesce((select jsonb_agg(jsonb_build_object(
        'loja_id', c.loja_id, 'luc', c.luc, 'nome', c.nome, 'dias_auditados', c.n,
        'informado', c.informado, 'auditado', c.soma, 'media_informada', c.media_inf, 'media_auditada', c.media_aud,
        'projecao', c.projecao, 'diferenca', c.diferenca, 'diferenca_percentual', c.pct,
        'classificacao', case when c.diferenca > 0 then 'para_maior' when c.diferenca < 0 then 'para_menor' else 'sem_diferenca' end,
        'percentual_vigente', c.vigentes ->> 'percentual', 'aluguel_minimo_vigente', c.vigentes ->> 'aluguel_minimo',
        'dias', (select jsonb_agg(jsonb_build_object('lancamento_id', l.id, 'data', l.data_venda, 'valor', l.valor,
                   'desvio', round(l.valor - c.informado / c.dias, 2)) order by abs(l.valor - c.informado / c.dias) desc, l.data_venda)
                 from lan l where l.loja_id = c.loja_id)
      ) order by abs(c.diferenca) desc, c.nome) from conc c), '[]'::jsonb),
    'sem_informado', coalesce((select jsonb_agg(jsonb_build_object('loja_id', b.loja_id, 'luc', b.luc, 'nome', b.nome, 'dias_auditados', b.n) order by b.nome)
                      from base b where b.informado is null and b.n > 0), '[]'::jsonb),
    'sem_auditoria', coalesce((select jsonb_agg(jsonb_build_object('loja_id', b.loja_id, 'luc', b.luc, 'nome', b.nome, 'informado', b.informado) order by b.nome)
                      from base b where b.informado is not null and b.n = 0), '[]'::jsonb),
    'informado_sem_loja', coalesce((select jsonb_agg(jsonb_build_object('luc', v.luc, 'nome', v.nome_pdf, 'valor', v.valor) order by v.luc)
                      from public.vendas_informadas v, par where v.competencia = par.c and v.loja_id is null), '[]'::jsonb),
    'totais', (select jsonb_build_object(
        'lojas_conciliadas', count(*), 'lojas_com_alerta', count(*) filter (where diferenca <> 0),
        'informado', coalesce(sum(informado), 0), 'projecao', coalesce(sum(projecao), 0),
        'diferenca_para_maior', coalesce(sum(diferenca) filter (where diferenca > 0), 0),
        'diferenca_para_menor', coalesce(sum(diferenca) filter (where diferenca < 0), 0)) from conc)
  )
$$;

-- Grava uma nova versão e marca o mês como fechado (uso interno).
create function public.gravar_fechamento(p_competencia date, p_tipo text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_versao integer;
begin
  select coalesce(max(versao), 0) + 1 into v_versao from public.fechamento_versoes where competencia = p_competencia;
  insert into public.fechamento_versoes (competencia, versao, tipo, gerado_por, dados)
  values (p_competencia, v_versao, p_tipo, auth.uid(), public.relatorio_conciliacao(p_competencia));
  insert into public.meses (competencia, situacao, versao_atual) values (p_competencia, 'fechado', v_versao)
  on conflict (competencia) do update set situacao = 'fechado', versao_atual = v_versao;
  return v_versao;
end;
$$;

-- Fechamento pelo Analista/Admin: antecipado (antes do automático) ou refechamento (após reabertura).
create function public.fechar_mes(p_competencia date)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_sit  text;
  v_tipo text;
  v_ver  integer;
begin
  if not public.eh_analista() then raise exception 'Somente Analista ou Administrador pode realizar o fechamento.'; end if;
  if p_competencia is null or extract(day from p_competencia) <> 1 then raise exception 'Mês inválido.'; end if;
  if p_competencia > date_trunc('month', now() at time zone 'America/Fortaleza')::date then
    raise exception 'Não é possível fechar um mês que ainda não começou.';
  end if;
  v_sit := public.situacao_mes(p_competencia);
  if v_sit = 'fechado' then
    if exists (select 1 from public.fechamento_versoes where competencia = p_competencia) then
      raise exception 'O mês já está fechado.';
    end if;
    v_tipo := 'automatico';  -- passou do 5º dia útil e o fechamento automático ainda não tinha sido registrado
  elsif v_sit = 'reaberto' then
    v_tipo := 'refechamento';
  else
    v_tipo := 'antecipado';
  end if;
  v_ver := public.gravar_fechamento(p_competencia, v_tipo);
  return jsonb_build_object('versao', v_ver, 'tipo', v_tipo);
end;
$$;

-- Reabertura: Analista/Admin, motivo obrigatório (fica na trilha).
create function public.reabrir_mes(p_competencia date, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.eh_analista() then raise exception 'Somente Analista ou Administrador pode reabrir o mês.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo da reabertura.'; end if;
  if public.situacao_mes(p_competencia) <> 'fechado' then raise exception 'O mês não está fechado.'; end if;
  -- fechado pelo prazo, mas a versão automática ainda não foi gravada: grava antes de reabrir
  if not exists (select 1 from public.fechamento_versoes where competencia = p_competencia) then
    perform public.gravar_fechamento(p_competencia, 'automatico');
  end if;
  perform set_config('app.motivo', btrim(p_motivo), true);
  update public.meses set situacao = 'reaberto' where competencia = p_competencia;
end;
$$;

-- Fechamento automático: grava a versão de cada mês que passou do 5º dia útil
-- e ainda não tem versão. Idempotente; chamado pelo agendamento diário e pelo
-- sistema ao abrir as telas (o bloqueio em si já vale pela data, mesmo antes).
create function public.fechar_meses_vencidos()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  c date;
  n integer := 0;
begin
  if not (public.eh_usuario_ativo()
          or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
          or auth.uid() is null and current_user in ('postgres', 'service_role')) then
    raise exception 'Sem permissão.';
  end if;
  for c in
    select distinct m from (
      select date_trunc('month', data_venda)::date m from public.lancamentos
      union select competencia from public.vendas_informadas
    ) x
     where not exists (select 1 from public.meses mm where mm.competencia = x.m)
       and now() >= public.fechamento_automatico_em(x.m)
     order by 1
  loop
    perform public.gravar_fechamento(c, 'automatico');
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Estado do mês para as telas (calendário do auditor, fechamento).
create function public.estado_mes(p_competencia date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.eh_usuario_ativo() then raise exception 'Usuário sem permissão.'; end if;
  return jsonb_build_object(
    'competencia', p_competencia,
    'situacao', public.situacao_mes(p_competencia),
    'prazo_lancamento', (public.prazo_lancamento(p_competencia) - interval '1 second'),
    'quinto_dia_util', public.quinto_dia_util(p_competencia),
    'fechamento_automatico', (public.fechamento_automatico_em(p_competencia) - interval '1 second'),
    'versao_atual', (select versao_atual from public.meses where competencia = p_competencia));
end;
$$;
