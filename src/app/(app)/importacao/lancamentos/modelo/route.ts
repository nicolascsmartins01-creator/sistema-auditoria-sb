import { usuarioAtual } from "@/lib/sessao";
import { gerarModeloLancamentos } from "@/lib/importacao-lancamentos/modelo";

export async function GET() {
  if (!(await usuarioAtual())) return new Response("Não autorizado", { status: 401 });
  return new Response(new Uint8Array(await gerarModeloLancamentos()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-lancamentos-em-lote.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
