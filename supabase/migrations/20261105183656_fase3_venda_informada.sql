-- =============================================================================
-- Fase 3: venda INFORMADA pelos lojistas (PDF mensal do portal)
--  * Uma linha por LUC e mês, exatamente como veio no PDF. A loja é ligada pela
--    LUC (LUC não cadastrada fica guardada sem loja e aparece como aviso).
--  * A soma das linhas precisa bater com o TOTAL do PDF (conferido de novo aqui).
--  * Mês já importado só é substituído com confirmação explícita; a versão
--    anterior fica na trilha de auditoria.
--  * Somente Analista/Administrador vê ou grava (o Auditor nunca vê o informado).
-- =============================================================================

alter table public.importacoes drop constraint importacoes_tipo_check;
alter table public.importacoes add constraint importacoes_tipo_check check (tipo in ('lojas', 'portal'));
alter table public.importacoes add column competencia date check (competencia is null or extract(day from competencia) = 1);

create table public.vendas_informadas (
  id             uuid primary key default gen_random_uuid(),
  competencia    date not null check (extract(day from competencia) = 1),
  luc            text not null,
  nome_pdf       text,
  loja_id        uuid references public.lojas (id) on delete restrict,
  valor          numeric(14,2) not null,
  importacao_id  uuid not null references public.importacoes (id),
  criado_em      timestamptz not null default now(),
  unique (competencia, luc)
);
create index vendas_informadas_loja_idx on public.vendas_informadas (loja_id, competencia);

create trigger vendas_informadas_trilha after insert or update or delete on public.vendas_informadas
  for each row execute function public.registrar_trilha();

alter table public.vendas_informadas enable row level security;
revoke all on public.vendas_informadas from anon;
revoke insert, update, delete, truncate on public.vendas_informadas from authenticated;
create policy vendas_informadas_select on public.vendas_informadas for select to authenticated
  using (public.eh_analista());

create function public.importar_venda_informada(
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
revoke execute on function public.importar_venda_informada(date, text, text, numeric, jsonb, boolean, jsonb) from anon, public;
grant execute on function public.importar_venda_informada(date, text, text, numeric, jsonb, boolean, jsonb) to authenticated;

-- Loja cadastrada depois: liga as vendas informadas que vieram só com a LUC.
create function public.ligar_vendas_sem_loja()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.ativa then
    update public.vendas_informadas set loja_id = new.id where luc = new.luc and loja_id is null;
  end if;
  return new;
end;
$$;
revoke execute on function public.ligar_vendas_sem_loja() from anon, public, authenticated;
create trigger lojas_ligar_vendas after insert or update of luc, ativa on public.lojas
  for each row execute function public.ligar_vendas_sem_loja();

-- Loja com venda informada também não pode ser excluída.
create or replace function public.excluir_loja(p_loja_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.eh_admin() then
    raise exception 'Somente o Administrador pode excluir lojas.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da exclusão.';
  end if;
  if not exists (select 1 from public.lojas where id = p_loja_id) then
    raise exception 'Loja não encontrada.';
  end if;
  if exists (select 1 from public.lancamentos where loja_id = p_loja_id)
     or exists (select 1 from public.vendas_informadas where loja_id = p_loja_id) then
    raise exception 'Esta loja tem lançamentos ou vendas informadas e não pode ser excluída. Desmarque "Ativa" para inativá-la.';
  end if;
  perform set_config('app.motivo', btrim(p_motivo), true);
  delete from public.loja_percentuais where loja_id = p_loja_id;
  delete from public.loja_alugueis_minimos where loja_id = p_loja_id;
  delete from public.loja_aluguel_dezembro where loja_id = p_loja_id;
  delete from public.lojas where id = p_loja_id;
end;
$$;
