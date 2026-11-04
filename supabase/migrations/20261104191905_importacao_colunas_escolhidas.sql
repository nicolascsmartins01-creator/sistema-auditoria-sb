-- Importação de lojas com escolha de colunas: só os campos PRESENTES em cada
-- linha são alterados. Campo ausente = mantém o valor do cadastro.
-- p_campos: descrição dos campos lidos (guardada no resumo da importação).
drop function if exists public.importar_lojas(text, text, jsonb);

create function public.importar_lojas(
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
  v_seg         integer;
  v_aud         boolean;
  v_atv         boolean;
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
    -- segmento (cria se não existir), só se o campo veio na linha
    v_segmento := null;
    if l ? 'segmento' and coalesce(btrim(l ->> 'segmento'), '') <> '' then
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
      if coalesce(btrim(l ->> 'nome_fantasia'), '') = '' then
        raise exception 'Loja nova sem nome fantasia (LUC %).', l ->> 'luc';
      end if;
      insert into public.lojas (luc, nome_fantasia, localizacao, segmento_id, auditada, ativa)
      values (l ->> 'luc', l ->> 'nome_fantasia', nullif(l ->> 'localizacao', ''), v_segmento,
              coalesce((l ->> 'auditada')::boolean, true), coalesce((l ->> 'ativa')::boolean, true))
      returning * into v_loja;
      v_criadas := v_criadas + 1;
    else
      v_nome  := case when l ? 'nome_fantasia' then l ->> 'nome_fantasia' else v_loja.nome_fantasia end;
      v_local := case when l ? 'localizacao' then nullif(l ->> 'localizacao', '') else v_loja.localizacao end;
      v_seg   := case when l ? 'segmento' then v_segmento else v_loja.segmento_id end;
      v_aud   := coalesce((l ->> 'auditada')::boolean, v_loja.auditada);
      v_atv   := coalesce((l ->> 'ativa')::boolean, v_loja.ativa);
      if (v_nome, v_local, v_seg, v_aud, v_atv) is distinct from
         (v_loja.nome_fantasia, v_loja.localizacao, v_loja.segmento_id, v_loja.auditada, v_loja.ativa) then
        update public.lojas
           set nome_fantasia = v_nome, localizacao = v_local, segmento_id = v_seg, auditada = v_aud, ativa = v_atv
         where id = v_loja.id;
        v_atualizadas := v_atualizadas + 1;
      end if;
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
    'alugueis_13_gravados', v_13,
    'campos', coalesce(p_campos, '[]'::jsonb));

  insert into public.importacoes (id, tipo, arquivo_nome, arquivo_path, resumo)
  values (v_importacao, 'lojas', p_arquivo_nome, p_arquivo_path, v_resumo);

  return v_resumo || jsonb_build_object('importacao_id', v_importacao);
end;
$$;
revoke execute on function public.importar_lojas(text, text, jsonb, jsonb) from anon, public;
grant execute on function public.importar_lojas(text, text, jsonb, jsonb) to authenticated;
