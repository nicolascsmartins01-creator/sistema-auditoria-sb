-- =============================================================================
-- Fase 6: cálculo do aluguel e exportações
--  * O relatório emitido passa a guardar o CONSOLIDADO de todas as lojas
--    (inclusive não auditadas): venda informada, auditoria e os valores
--    contratuais vigentes no mês (percentual; mínimo ou 13º em dezembro).
--    O cálculo do aluguel é feito a partir desses dados congelados
--    (src/lib/aluguel.ts), então a versão emitida nunca muda.
--  * Arquivos (Excel e PDF consolidado) ficam no storage privado "relatorios",
--    ligados à versão; não são substituídos nem apagados.
-- =============================================================================

create or replace function public.relatorio_conciliacao(p_competencia date)
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
  todas as (
    select j.id loja_id, j.luc, j.nome_fantasia nome, s.nome segmento, j.auditada, j.ativa,
           i.informado, coalesce(a.n, 0) n, coalesce(a.soma, 0) soma
      from public.lojas j
      left join public.segmentos s on s.id = j.segmento_id
      left join inf i on i.loja_id = j.id
      left join agg a on a.loja_id = j.id
     where j.ativa or i.informado is not null or a.n is not null
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
    'consolidado', coalesce((select jsonb_agg(jsonb_build_object(
        'loja_id', t.loja_id, 'luc', t.luc, 'nome', t.nome, 'segmento', t.segmento, 'auditada', t.auditada, 'ativa', t.ativa,
        'informado', t.informado, 'dias_auditados', t.n, 'auditado', t.soma,
        'projecao', case when t.n > 0 then round(t.soma / t.n * par.dias, 2) end,
        'diferenca', case when t.n > 0 and t.informado is not null then round(t.soma / t.n * par.dias, 2) - t.informado end,
        'percentual', v.percentual, 'aluguel_minimo', v.aluguel_minimo,
        'minimo_eh_13_aluguel', v.minimo_eh_13_aluguel, 'falta_13_aluguel', v.falta_13_aluguel
      ) order by t.nome)
      from todas t cross join par
      left join lateral public.valores_vigentes(t.loja_id, extract(year from par.c)::int, extract(month from par.c)::int) v on true), '[]'::jsonb),
    'totais', (select jsonb_build_object(
        'lojas_conciliadas', count(*), 'lojas_com_alerta', count(*) filter (where diferenca <> 0),
        'informado', coalesce(sum(informado), 0), 'projecao', coalesce(sum(projecao), 0),
        'diferenca_para_maior', coalesce(sum(diferenca) filter (where diferenca > 0), 0),
        'diferenca_para_menor', coalesce(sum(diferenca) filter (where diferenca < 0), 0)) from conc)
  )
$$;

-- Prévia (mês ainda não fechado): mesmo relatório, sem gravar versão.
create function public.previa_relatorio(p_competencia date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.eh_analista() then raise exception 'Somente Analista ou Administrador.'; end if;
  return public.relatorio_conciliacao(p_competencia);
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit)
values ('relatorios', 'relatorios', false, 20971520)
on conflict (id) do nothing;
create policy relatorios_select on storage.objects for select to authenticated
  using (bucket_id = 'relatorios' and public.eh_analista());
create policy relatorios_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'relatorios' and public.eh_analista());

create table public.fechamento_arquivos (
  id          uuid primary key default gen_random_uuid(),
  versao_id   uuid not null references public.fechamento_versoes (id),
  tipo        text not null check (tipo in ('excel', 'pdf')),
  caminho     text not null unique,
  gerado_em   timestamptz not null default now(),
  gerado_por  uuid references public.usuarios (id) default auth.uid(),
  unique (versao_id, tipo)
);
create trigger fechamento_arquivos_imutavel before update or delete on public.fechamento_arquivos
  for each row execute function public.bloquear_alteracao_trilha();
create trigger fechamento_arquivos_trilha after insert on public.fechamento_arquivos
  for each row execute function public.registrar_trilha();
alter table public.fechamento_arquivos enable row level security;
revoke all on public.fechamento_arquivos from anon;
revoke insert, update, delete, truncate on public.fechamento_arquivos from authenticated;
create policy fechamento_arquivos_select on public.fechamento_arquivos for select to authenticated using (public.eh_analista());

create function public.registrar_arquivo_fechamento(p_versao_id uuid, p_tipo text, p_caminho text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.eh_analista() then raise exception 'Somente Analista ou Administrador.'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'relatorios' and name = p_caminho) then
    raise exception 'Arquivo não encontrado no armazenamento.';
  end if;
  insert into public.fechamento_arquivos (versao_id, tipo, caminho) values (p_versao_id, p_tipo, p_caminho)
  on conflict (versao_id, tipo) do nothing;
end;
$$;

revoke execute on function public.relatorio_conciliacao(date) from anon, public, authenticated;
revoke execute on function public.previa_relatorio(date) from anon, public;
revoke execute on function public.registrar_arquivo_fechamento(uuid, text, text) from anon, public;
grant execute on function public.previa_relatorio(date) to authenticated;
grant execute on function public.registrar_arquivo_fechamento(uuid, text, text) to authenticated;
