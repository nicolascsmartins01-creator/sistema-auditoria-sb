import { usuarioAtual } from "@/lib/sessao";
import { gerarModeloLojas } from "@/lib/importacao-lojas/modelo";

export async function GET() {
  if (!(await usuarioAtual())) return new Response("Não autorizado", { status: 401 });
  const buf = await gerarModeloLojas();
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-cadastro-lojas.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
