-- =============================================================================
-- Fase 2: lançamento da venda auditada (valor digitado + fotos obrigatórias)
--
-- Regras (fixas, nenhum perfil altera):
--  * Venda de um dia só pode ser lançada a partir do dia seguinte (o dia de
--    hoje fica bloqueado) e até 23:59 do dia 5 do mês seguinte (Fortaleza).
--  * Um lançamento por loja e dia (exceto recusados).
--  * Pelo menos uma foto como comprovante. O valor que vale é o digitado.
--  * Lançamento feito sem internet vale pela hora em que foi digitado no
--    aparelho, desde que chegue ao servidor em até 72 horas; depois disso
--    entra "em análise" para o Analista.
--  * Lançamentos só são gravados pelas funções abaixo (nunca direto na tabela).
--  * Auditor vê só os próprios lançamentos e fotos; no calendário vê que outro
--    auditor lançou o dia, sem valor.
-- =============================================================================

create table public.lancamentos (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null unique,     -- gerado no aparelho: evita lançamento em dobro ao reenviar
  loja_id       uuid not null references public.lojas (id) on delete restrict,
  data_venda    date not null,
  valor         numeric(14,2) not null check (valor >= 0),
  auditor_id    uuid not null references public.usuarios (id),
  digitado_em   timestamptz not null,     -- hora no aparelho
  recebido_em   timestamptz not null default now(),
  situacao      text not null default 'valido' check (situacao in ('valido', 'em_analise', 'recusado')),
  atualizado_em timestamptz not null default now()
);
create unique index lancamentos_loja_dia_uk on public.lancamentos (loja_id, data_venda) where situacao <> 'recusado';
create index lancamentos_data_idx on public.lancamentos (data_venda);
create index lancamentos_auditor_idx on public.lancamentos (auditor_id);

create table public.lancamento_fotos (
  id            uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references public.lancamentos (id) on delete restrict,
  caminho       text not null unique,     -- caminho no storage privado "fotos"
  enviado_por   uuid references public.usuarios (id) default auth.uid(),
  criado_em     timestamptz not null default now()
);
create index lancamento_fotos_lanc_idx on public.lancamento_fotos (lancamento_id);

create trigger lancamentos_atualizado before update on public.lancamentos
  for each row execute function public.tocar_atualizado_em();
create trigger lancamentos_trilha after insert or update or delete on public.lancamentos
  for each row execute function public.registrar_trilha();
create trigger lancamento_fotos_trilha after insert or update or delete on public.lancamento_fotos
  for each row execute function public.registrar_trilha();

alter table public.lancamentos enable row level security;
alter table public.lancamento_fotos enable row level security;
revoke all on public.lancamentos, public.lancamento_fotos from anon;
revoke insert, update, delete, truncate on public.lancamentos, public.lancamento_fotos from authenticated;

create policy lancamentos_select on public.lancamentos for select to authenticated
  using (public.eh_analista() or (auditor_id = auth.uid() and public.eh_usuario_ativo()));
create policy lancamento_fotos_select on public.lancamento_fotos for select to authenticated
  using (public.eh_analista() or exists (
    select 1 from public.lancamentos l
     where l.id = lancamento_id and l.auditor_id = auth.uid() and public.eh_usuario_ativo()));

-- Storage privado das fotos: cada usuário envia na própria pasta (<id do usuário>/...).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy fotos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.eh_usuario_ativo() and split_part(name, '/', 1) = auth.uid()::text);
create policy fotos_select on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and (public.eh_analista() or (public.eh_usuario_ativo() and split_part(name, '/', 1) = auth.uid()::text)));
-- sem update/delete: foto enviada não é substituída nem apagada.

-- -----------------------------------------------------------------------------
-- Prazo: fim do dia 5 do mês seguinte, no horário de Fortaleza.
-- -----------------------------------------------------------------------------
create function public.prazo_lancamento(p_data date)
returns timestamptz
language sql stable set search_path = ''
as $$
  select ((date_trunc('month', p_data) + interval '1 month' + interval '5 days')::timestamp
          at time zone 'America/Fortaleza')
$$;

create function public.conferir_fotos(p_fotos text[])
returns void
language plpgsql stable security definer set search_path = ''
as $$
declare f text;
begin
  foreach f in array coalesce(p_fotos, '{}') loop
    if split_part(f, '/', 1) <> auth.uid()::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'fotos' and o.name = f) then
      raise exception 'Foto não encontrada no servidor. Tente enviar novamente.';
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Registrar lançamento (Auditor, Analista ou Administrador)
-- -----------------------------------------------------------------------------
create function public.registrar_lancamento(
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

-- -----------------------------------------------------------------------------
-- Calendário: dias lançados de uma loja num mês. O valor (e o id) só aparece
-- para quem lançou ou para Analista/Administrador.
-- -----------------------------------------------------------------------------
create function public.dias_lancados(p_loja_id uuid, p_ano integer, p_mes integer)
returns table (data_venda date, situacao text, auditor_nome text, proprio boolean, lancamento_id uuid, valor numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.eh_usuario_ativo() then raise exception 'Usuário sem permissão.'; end if;
  return query
    select l.data_venda, l.situacao, u.nome, l.auditor_id = auth.uid(),
           case when l.auditor_id = auth.uid() or public.eh_analista() then l.id end,
           case when l.auditor_id = auth.uid() or public.eh_analista() then l.valor end
      from public.lancamentos l
      join public.usuarios u on u.id = l.auditor_id
     where l.loja_id = p_loja_id
       and l.situacao <> 'recusado'
       and l.data_venda >= make_date(p_ano, p_mes, 1)
       and l.data_venda < (make_date(p_ano, p_mes, 1) + interval '1 month')::date
     order by l.data_venda;
end;
$$;

-- -----------------------------------------------------------------------------
-- Edição (Analista/Administrador), motivo obrigatório. Pode anexar fotos novas.
-- -----------------------------------------------------------------------------
create function public.editar_lancamento(p_id uuid, p_valor numeric, p_motivo text, p_fotos_novas text[] default '{}')
returns void
language plpgsql security definer set search_path = ''
as $$
declare f text;
begin
  if not public.eh_analista() then raise exception 'Somente Analista ou Administrador pode editar lançamentos.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo da edição.'; end if;
  if p_valor is null or p_valor < 0 then raise exception 'Informe o valor da venda.'; end if;
  if not exists (select 1 from public.lancamentos where id = p_id) then raise exception 'Lançamento não encontrado.'; end if;
  perform public.conferir_fotos(p_fotos_novas);
  perform set_config('app.motivo', btrim(p_motivo), true);
  update public.lancamentos set valor = round(p_valor, 2) where id = p_id and valor <> round(p_valor, 2);
  foreach f in array coalesce(p_fotos_novas, '{}') loop
    insert into public.lancamento_fotos (lancamento_id, caminho) values (p_id, f);
  end loop;
end;
$$;

-- Lançamento que chegou depois de 72 h: Analista aprova (vale) ou recusa.
create function public.analisar_lancamento(p_id uuid, p_aprovar boolean, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.eh_analista() then raise exception 'Somente Analista ou Administrador.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo.'; end if;
  perform set_config('app.motivo', btrim(p_motivo), true);
  update public.lancamentos set situacao = case when p_aprovar then 'valido' else 'recusado' end
   where id = p_id and situacao = 'em_analise';
  if not found then raise exception 'Lançamento não está em análise.'; end if;
end;
$$;

-- Loja com lançamentos não pode ser excluída (só inativada).
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
  if exists (select 1 from public.lancamentos where loja_id = p_loja_id) then
    raise exception 'Esta loja tem lançamentos de auditoria e não pode ser excluída. Desmarque "Ativa" para inativá-la.';
  end if;
  perform set_config('app.motivo', btrim(p_motivo), true);
  delete from public.loja_percentuais where loja_id = p_loja_id;
  delete from public.loja_alugueis_minimos where loja_id = p_loja_id;
  delete from public.loja_aluguel_dezembro where loja_id = p_loja_id;
  delete from public.lojas where id = p_loja_id;
end;
$$;

revoke execute on function public.prazo_lancamento(date) from anon, public;
revoke execute on function public.conferir_fotos(text[]) from anon, public, authenticated;
revoke execute on function public.registrar_lancamento(uuid, uuid, date, numeric, timestamptz, text[]) from anon, public;
revoke execute on function public.dias_lancados(uuid, integer, integer) from anon, public;
revoke execute on function public.editar_lancamento(uuid, numeric, text, text[]) from anon, public;
revoke execute on function public.analisar_lancamento(uuid, boolean, text) from anon, public;
grant execute on function public.prazo_lancamento(date) to authenticated;
grant execute on function public.registrar_lancamento(uuid, uuid, date, numeric, timestamptz, text[]) to authenticated;
grant execute on function public.dias_lancados(uuid, integer, integer) to authenticated;
grant execute on function public.editar_lancamento(uuid, numeric, text, text[]) to authenticated;
grant execute on function public.analisar_lancamento(uuid, boolean, text) to authenticated;
