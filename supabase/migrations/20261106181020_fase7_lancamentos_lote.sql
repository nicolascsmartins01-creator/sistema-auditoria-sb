-- =============================================================================
-- Fase 7: importação de lançamentos auditados em lote (planilha Excel/CSV)
--  * Somente Analista/Administrador.
--  * Respeita o ciclo: mês fechado não aceita; só dias anteriores a hoje;
--    um lançamento por loja e dia. Tudo ou nada.
--  * Lançamento de planilha não tem foto: o comprovante é a planilha original,
--    arquivada e ligada a cada lançamento (origem = 'planilha').
-- =============================================================================

alter table public.importacoes drop constraint importacoes_tipo_check;
alter table public.importacoes add constraint importacoes_tipo_check check (tipo in ('lojas', 'portal', 'lancamentos'));

alter table public.lancamentos add column origem text not null default 'app' check (origem in ('app', 'planilha'));
alter table public.lancamentos add column importacao_id uuid references public.importacoes (id);

create function public.importar_lancamentos(p_arquivo_nome text, p_arquivo_path text, p_linhas jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_importacao uuid := gen_random_uuid();
  l            jsonb;
  v_n          integer := 0;
  v_loja       public.lojas;
  v_data       date;
  v_valor      numeric;
  v_auditor    uuid;
  v_hoje       date := (now() at time zone 'America/Fortaleza')::date;
  v_total      numeric := 0;
  v_meses      jsonb := '{}'::jsonb;
begin
  if not public.eh_analista() then
    raise exception 'Somente Analista ou Administrador pode importar lançamentos.';
  end if;
  if jsonb_array_length(coalesce(p_linhas, '[]'::jsonb)) = 0 then
    raise exception 'Nenhuma linha para importar.';
  end if;

  perform set_config('app.importacao_id', v_importacao::text, true);
  insert into public.importacoes (id, tipo, arquivo_nome, arquivo_path, resumo)
  values (v_importacao, 'lancamentos', p_arquivo_nome, p_arquivo_path, '{}'::jsonb);

  for l in select * from jsonb_array_elements(p_linhas)
  loop
    v_n := v_n + 1;
    select * into v_loja from public.lojas where luc = l ->> 'luc' and ativa;
    if v_loja.id is null then raise exception 'Linha %: LUC % não encontrada entre as lojas ativas.', l ->> 'linha', l ->> 'luc'; end if;
    if not v_loja.auditada then raise exception 'Linha %: a loja % não está marcada como auditada.', l ->> 'linha', l ->> 'luc'; end if;
    v_data := (l ->> 'data')::date;
    if v_data >= v_hoje then raise exception 'Linha %: só é possível lançar dias anteriores a hoje.', l ->> 'linha'; end if;
    if public.situacao_mes(date_trunc('month', v_data)::date) = 'fechado' then
      raise exception 'Linha %: o mês %/% está fechado.', l ->> 'linha', to_char(v_data, 'MM'), to_char(v_data, 'YYYY');
    end if;
    v_valor := (l ->> 'valor')::numeric;
    if v_valor is null or v_valor < 0 then raise exception 'Linha %: valor inválido.', l ->> 'linha'; end if;
    if exists (select 1 from public.lancamentos where loja_id = v_loja.id and data_venda = v_data and situacao <> 'recusado') then
      raise exception 'Linha %: o dia %/%/% já foi lançado para a loja %.', l ->> 'linha',
        to_char(v_data, 'DD'), to_char(v_data, 'MM'), to_char(v_data, 'YYYY'), l ->> 'luc';
    end if;
    v_auditor := auth.uid();
    if coalesce(l ->> 'auditor', '') <> '' then
      select id into v_auditor from public.usuarios where login = lower(btrim(l ->> 'auditor')) and ativo;
      if v_auditor is null then raise exception 'Linha %: auditor "%" não encontrado ou desativado.', l ->> 'linha', l ->> 'auditor'; end if;
    end if;

    insert into public.lancamentos (cliente_id, loja_id, data_venda, valor, auditor_id, digitado_em, recebido_em, situacao, origem, importacao_id)
    values (gen_random_uuid(), v_loja.id, v_data, round(v_valor, 2), v_auditor, now(), now(), 'valido', 'planilha', v_importacao);
    v_total := v_total + round(v_valor, 2);
    v_meses := jsonb_set(v_meses, array[to_char(v_data, 'YYYY-MM')], to_jsonb(coalesce((v_meses ->> to_char(v_data, 'YYYY-MM'))::int, 0) + 1));
  end loop;

  update public.importacoes set resumo = jsonb_build_object('linhas', v_n, 'total', v_total, 'meses', v_meses) where id = v_importacao;
  return jsonb_build_object('importacao_id', v_importacao, 'linhas', v_n, 'total', v_total, 'meses', v_meses);
end;
$$;
revoke execute on function public.importar_lancamentos(text, text, jsonb) from anon, public;
grant execute on function public.importar_lancamentos(text, text, jsonb) to authenticated;
