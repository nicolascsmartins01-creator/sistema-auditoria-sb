import { criarClienteServidor } from "@/lib/supabase/servidor";
import { usuarioAtual } from "@/lib/sessao";
import { ehAnalista } from "@/lib/perfis";
import { carregarVersao, nomeArquivo } from "@/lib/relatorio/arquivos";
import { gerarPdfLoja } from "@/lib/relatorio/pdf";

/** PDF de uma loja, gerado a partir dos dados congelados da versão (sempre igual). */
export async function GET(_: Request, { params }: { params: Promise<{ mes: string; versao: string; lojaId: string }> }) {
  const u = await usuarioAtual();
  if (!u || !ehAnalista(u.perfil)) return new Response("Não autorizado", { status: 403 });
  const { mes, versao, lojaId } = await params;
  const sb = await criarClienteServidor();
  const v = await carregarVersao(sb, mes, Number(versao));
  if (!v) return new Response("Versão não encontrada", { status: 404 });
  const pdf = await gerarPdfLoja(v.dados, v.meta, lojaId);
  if (!pdf) return new Response("Loja não consta nesta versão", { status: 404 });
  const luc = v.dados.consolidado?.find((l) => l.loja_id === lojaId)?.luc ?? v.dados.lojas.find((l) => l.loja_id === lojaId)?.luc ?? "loja";
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${nomeArquivo(v.meta, "pdf", luc.replace(/[^\w-]+/g, "_"))}"` },
  });
}
