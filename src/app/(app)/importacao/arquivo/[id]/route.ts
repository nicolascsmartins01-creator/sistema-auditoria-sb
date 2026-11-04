import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { usuarioAtual } from "@/lib/sessao";
import { ehAnalista } from "@/lib/perfis";

/** Baixa o arquivo original de uma importação (link temporário de 60 s; o storage é privado). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await usuarioAtual();
  if (!u || !ehAnalista(u.perfil)) return new Response("Não autorizado", { status: 403 });
  const { id } = await params;
  const sb = await criarClienteServidor();
  const { data } = await sb.from("importacoes").select("arquivo_path, arquivo_nome").eq("id", id).maybeSingle();
  if (!data) return new Response("Não encontrado", { status: 404 });
  const { data: assinado, error } = await sb.storage.from("importacoes")
    .createSignedUrl(data.arquivo_path, 60, { download: data.arquivo_nome });
  if (error || !assinado) return new Response("Arquivo indisponível", { status: 404 });
  return NextResponse.redirect(assinado.signedUrl);
}
