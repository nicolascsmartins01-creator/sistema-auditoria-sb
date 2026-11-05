-- Fase 5: bloqueio de mês fechado nas funções existentes + permissões

create or replace function public.registrar_lancamento(
  p_cliente_id uuid, p_loja_id uuid, p_data date, p_valor numeric,
  p_digitado_em timestamptz, p_fotos text[])
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_existente public.lancamentos;
  v_loja      public.lojas;
  v_agora     timestamptz := now();
  v_ref       timestamptz;
  v_situacao  text := 'valido';
  v_id        uuid;
  f           text;
begin
  if not public.eh_usuario_ativo() then
    raise exception 'Usuário sem permissão.';
  end if;

  -- reenvio do mesmo lançamento (ex.: internet caiu depois de gravar): devolve o que já existe
  select * into v_existente from public.lancamentos where cliente_id = p_cliente_id;
  if v_existente.id is not null then
    if v_existente.auditor_id <> auth.uid() then raise exception 'Identificador de lançamento inválido.'; end if;
    return jsonb_build_object('id', v_existente.id, 'situacao', v_existente.situacao, 'repetido', true);
  end if;

  select * into v_loja from public.lojas where id = p_loja_id;
  if v_loja.id is null or not v_loja.ativa then raise exception 'Loja não encontrada ou inativa.'; end if;
  if not v_loja.auditada then raise exception 'Esta loja não está marcada como auditada.'; end if;
  if p_valor is null or p_valor < 0 then raise exception 'Informe o valor da venda.'; end if;
  if coalesce(array_length(p_fotos, 1), 0) = 0 then raise exception 'Anexe pelo menos uma foto do comprovante.'; end if;
  perform public.conferir_fotos(p_fotos);

  -- hora de referência: a digitada no aparelho (relógio adiantado não vale)
  v_ref := least(coalesce(p_digitado_em, v_agora), v_agora);
  if v_agora - v_ref > interval '72 hours' then
    v_situacao := 'em_analise';
  end if;

  if p_data >= (v_ref at time zone 'America/Fortaleza')::date then
    raise exception 'Só é possível lançar dias anteriores ao dia do lançamento.';
  end if;
  if v_ref >= public.prazo_lancamento(p_data) then
    raise exception 'Prazo encerrado: lançamentos de %/% podiam ser feitos até 05/% às 23:59.',
      to_char(p_data, 'MM'), to_char(p_data, 'YYYY'),
      to_char(date_trunc('month', p_data) + interval '1 month', 'MM/YYYY');
  end if;
  if public.situacao_mes(date_trunc('month', p_data)::date) = 'fechado' then
    raise exception 'O mês %/% está fechado. Para alterar, reabra o mês (Analista/Administrador).', to_char(date_trunc('month', p_data)::date, 'MM'), to_char(date_trunc('month', p_data)::date, 'YYYY');
  end if;
  if exists (select 1 from public.lancamentos
              where loja_id = p_loja_id and data_venda = p_data and situacao <> 'recusado') then
    raise exception 'Este dia já foi lançado para esta loja.';
  end if;

  insert into public.lancamentos (cliente_id, loja_id, data_venda, valor, auditor_id, digitado_em, recebido_em, situacao)
  values (p_cliente_id, p_loja_id, p_data, round(p_valor, 2), auth.uid(), v_ref, v_agora, v_situacao)
  returning id into v_id;

  foreach f in array p_fotos loop
    insert into public.lancamento_fotos (lancamento_id, caminho) values (v_id, f);
  end loop;

  return jsonb_build_object('id', v_id, 'situacao', v_situacao, 'repetido', false);
end;
$$;

create or replace function public.editar_lancamento(p_id uuid, p_valor numeric, p_motivo text, p_fotos_novas text[] default '{}')
returns void
language plpgsql security definer set search_path = ''
as $$
declare f text;
begin
  if not public.eh_analista() then raise exception 'Somente Analista ou Administrador pode editar lançamentos.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo da edição.'; end if;
  if p_valor is null or p_valor < 0 then raise exception 'Informe o valor da venda.'; end if;
  if not exists (select 1 from public.lancamentos where id = p_id) then raise exception 'Lançamento não encontrado.'; end if;
  if public.situacao_mes((select date_trunc('month', data_venda)::date from public.lancamentos where id = p_id)) = 'fechado' then
    raise exception 'O mês deste lançamento está fechado. Reabra o mês para editar.';
  end if;
  perform public.conferir_fotos(p_fotos_novas);
  perform set_config('app.motivo', btrim(p_motivo), true);
  update public.lancamentos set valor = round(p_valor, 2) where id = p_id and valor <> round(p_valor, 2);
  foreach f in array coalesce(p_fotos_novas, '{}') loop
    insert into public.lancamento_fotos (lancamento_id, caminho) values (p_id, f);
  end loop;
end;
$$;

create or replace function public.analisar_lancamento(p_id uuid, p_aprovar boolean, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.eh_analista() then raise exception 'Somente Analista ou Administrador.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo.'; end if;
  if public.situacao_mes((select date_trunc('month', data_venda)::date from public.lancamentos where id = p_id)) = 'fechado' then
    raise exception 'O mês deste lançamento está fechado. Reabra o mês para analisar.';
  end if;
  perform set_config('app.motivo', btrim(p_motivo), true);
  update public.lancamentos set situacao = case when p_aprovar then 'valido' else 'recusado' end
   where id = p_id and situacao = 'em_analise';
  if not found then raise exception 'Lançamento não está em análise.'; end if;
end;
$$;

create or replace function public.importar_venda_informada(
  p_competencia date, p_arquivo_nome text, p_arquivo_path text,
  p_total numeric, p_linhas jsonb, p_substituir boolean, p_detalhes jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_importacao  uuid := gen_random_uuid();
  v_soma        numeric;
  v_existentes  integer;
  v_total_ant   numeric;
  v_sem_loja    integer;
  v_resumo      jsonb;
begin
  if not public.eh_analista() then
    raise exception 'Somente Analista ou Administrador pode importar a venda informada.';
  end if;
  if p_competencia is null or extract(day from p_competencia) <> 1 then
    raise exception 'Mês de referência inválido.';
  end if;
  if public.situacao_mes(p_competencia) = 'fechado' then
    raise exception 'O mês %/% está fechado. Para alterar, reabra o mês (Analista/Administrador).', to_char(p_competencia, 'MM'), to_char(p_competencia, 'YYYY');
  end if;
  if jsonb_array_length(coalesce(p_linhas, '[]'::jsonb)) = 0 then
    raise exception 'Nenhuma linha para importar.';
  end if;
  select sum((l ->> 'valor')::numeric) into v_soma from jsonb_array_elements(p_linhas) l;
  if v_soma <> p_total then
    raise exception 'A soma das linhas (%) não bate com o TOTAL do PDF (%). Importação recusada.', v_soma, p_total;
  end if;
  if exists (select 1 from jsonb_array_elements(p_linhas) l group by l ->> 'luc' having count(*) > 1) then
    raise exception 'LUC repetida no arquivo.';
  end if;

  select count(*), sum(valor) into v_existentes, v_total_ant from public.vendas_informadas where competencia = p_competencia;
  if v_existentes > 0 and not coalesce(p_substituir, false) then
    raise exception 'Já existe venda informada de %. Confirme a substituição para gravar.', to_char(p_competencia, 'MM/YYYY');
  end if;

  perform set_config('app.importacao_id', v_importacao::text, true);

  insert into public.importacoes (id, tipo, arquivo_nome, arquivo_path, competencia, resumo)
  values (v_importacao, 'portal', p_arquivo_nome, p_arquivo_path, p_competencia, '{}'::jsonb);

  if v_existentes > 0 then
    perform set_config('app.motivo', 'Substituída pela importação do arquivo ' || p_arquivo_nome, true);
    delete from public.vendas_informadas where competencia = p_competencia;
    perform set_config('app.motivo', '', true);
  end if;

  insert into public.vendas_informadas (competencia, luc, nome_pdf, loja_id, valor, importacao_id)
  select p_competencia, l ->> 'luc', l ->> 'nome', (
           select j.id from public.lojas j where j.luc = l ->> 'luc' order by j.ativa desc, j.atualizado_em desc limit 1),
         (l ->> 'valor')::numeric, v_importacao
    from jsonb_array_elements(p_linhas) l;

  select count(*) into v_sem_loja from public.vendas_informadas where importacao_id = v_importacao and loja_id is null;

  v_resumo := coalesce(p_detalhes, '{}'::jsonb) || jsonb_build_object(
    'competencia', p_competencia, 'linhas', jsonb_array_length(p_linhas), 'total', p_total,
    'sem_loja', v_sem_loja, 'substituiu', v_existentes > 0, 'total_anterior', v_total_ant);
  update public.importacoes set resumo = v_resumo where id = v_importacao;
  return v_resumo || jsonb_build_object('importacao_id', v_importacao);
end;
$$;
revoke execute on function public.quinto_dia_util(date) from anon, public;
revoke execute on function public.fechamento_automatico_em(date) from anon, public;
revoke execute on function public.situacao_mes(date, timestamptz) from anon, public;
revoke execute on function public.relatorio_conciliacao(date) from anon, public, authenticated;
revoke execute on function public.gravar_fechamento(date, text) from anon, public, authenticated;
revoke execute on function public.fechar_mes(date) from anon, public;
revoke execute on function public.reabrir_mes(date, text) from anon, public;
revoke execute on function public.fechar_meses_vencidos() from anon, public;
revoke execute on function public.estado_mes(date) from anon, public;
grant execute on function public.quinto_dia_util(date) to authenticated;
grant execute on function public.fechamento_automatico_em(date) to authenticated;
grant execute on function public.situacao_mes(date, timestamptz) to authenticated;
grant execute on function public.fechar_mes(date) to authenticated;
grant execute on function public.reabrir_mes(date, text) to authenticated;
grant execute on function public.fechar_meses_vencidos() to authenticated, service_role;
grant execute on function public.estado_mes(date) to authenticated;
