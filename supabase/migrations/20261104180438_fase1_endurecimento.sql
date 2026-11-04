-- Ajustes apontados pelo verificador de segurança do Supabase.
-- 1) search_path fixo nas funções de gatilho restantes.
alter function public.bloquear_alteracao_trilha() set search_path = '';
alter function public.tocar_atualizado_em() set search_path = '';

-- 2) Funções de gatilho não precisam ser chamáveis pela API (os gatilhos
--    continuam funcionando: a permissão só é conferida na criação do gatilho).
revoke execute on function public.registrar_trilha() from authenticated, anon, public;
revoke execute on function public.proteger_usuarios() from authenticated, anon, public;
revoke execute on function public.bloquear_alteracao_trilha() from authenticated, anon, public;
revoke execute on function public.tocar_atualizado_em() from authenticated, anon, public;

-- Observação: eh_admin(), eh_analista(), eh_usuario_ativo() e perfil_atual()
-- continuam executáveis por usuários logados de propósito: são usadas pelas
-- políticas de RLS e só revelam o perfil do próprio usuário. registrar_evento()
-- confere a permissão internamente.
