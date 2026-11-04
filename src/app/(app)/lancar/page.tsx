import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { ehAnalista } from "@/lib/perfis";
import { AppLancamento, type LojaLanc } from "./app-lancamento";

export const metadata = { title: "Lançar venda — Auditoria Benfica" };

export default async function PaginaLancar() {
  const u = await exigirUsuario();
  const sb = await criarClienteServidor();
  const { data } = await sb.from("lojas").select("id, luc, nome_fantasia, localizacao")
    .eq("ativa", true).eq("auditada", true).order("nome_fantasia");
  const lojas: LojaLanc[] = (data ?? []).map((l) => ({ id: l.id, luc: l.luc, nome: l.nome_fantasia, localizacao: l.localizacao }));
  return <AppLancamento lojas={lojas} podeEditar={ehAnalista(u.perfil)} />;
}
