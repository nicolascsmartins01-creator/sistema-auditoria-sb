import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Agendamento diário (Vercel Cron, 00:05 em Fortaleza): grava o relatório dos
 * meses que passaram do 5º dia útil. O bloqueio do mês já vale pela data mesmo
 * antes desta rotina rodar; ela só emite a versão "automática".
 * Protegido pelo segredo CRON_SECRET (a Vercel envia no cabeçalho).
 */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return new NextResponse("Não autorizado", { status: 401 });
  }
  const { data, error } = await criarClienteAdmin().rpc("fechar_meses_vencidos");
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, mesesFechados: data });
}
