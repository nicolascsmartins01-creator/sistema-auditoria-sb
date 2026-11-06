import { criarClienteServidor } from "@/lib/supabase/servidor";
import { usuarioAtual } from "@/lib/sessao";
import { ehAnalista } from "@/lib/perfis";
import { gerarArquivo, MIME, nomeArquivo } from "@/lib/relatorio/arquivos";
import { gerarPdfLoja } from "@/lib/relatorio/pdf";
import type { Meta, RelatorioEmitido } from "@/lib/relatorio/dados";

/** PRÉVIA (mês ainda não fechado ou conferência): gerada na hora, não é guardada nem oficial. */
export async function GET(req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const u = await usuarioAtual();
  if (!u || !ehAnalista(u.perfil)) return new Response("Não autorizado", { status: 403 });
  const { tipo } = await params;
  const url = new URL(req.url);
  const mes = url.searchParams.get("mes") ?? "";
  const loja = url.searchParams.get("loja");
  if (!/^\d{4}-\d{2}$/.test(mes) || !["excel", "pdf"].includes(tipo)) return new Response("Parâmetros inválidos", { status: 400 });
  const sb = await criarClienteServidor();
  const { data, error } = await sb.rpc("previa_relatorio", { p_competencia: mes + "-01" });
  if (error) return new Response(error.message, { status: 500 });
  const meta: Meta = { mes, versao: null, tipo: null, emitidoEm: null, emitidoPor: u.nome };
  if (loja && tipo === "pdf") {
    const pdf = await gerarPdfLoja(data as RelatorioEmitido, meta, loja);
    if (!pdf) return new Response("Loja sem dados no mês", { status: 404 });
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": MIME.pdf, "Content-Disposition": `inline; filename="${nomeArquivo(meta, "pdf", "loja")}"` } });
  }
  const bytes = await gerarArquivo(tipo as "excel" | "pdf", data as RelatorioEmitido, meta);
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": MIME[tipo as "excel" | "pdf"], "Content-Disposition": `${tipo === "pdf" ? "inline" : "attachment"}; filename="${nomeArquivo(meta, tipo as "excel" | "pdf")}"` },
  });
}
