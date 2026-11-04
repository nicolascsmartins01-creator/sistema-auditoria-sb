"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clienteNavegador } from "@/lib/supabase/navegador";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato";
import { Aviso, Etiqueta } from "@/components/ui";
import type { InfoDia, LojaLanc } from "./app-lancamento";

interface Detalhe { valor: number; digitado_em: string; recebido_em: string; situacao: string; auditor: string; fotos: string[] }

/** Toque num dia lançado: valor e fotos (só para quem lançou e para Analista/Administrador). */
export function DetalheDia({ loja, dia, info, podeEditar, onVoltar }: {
  loja: LojaLanc; dia: string; info: InfoDia; podeEditar: boolean; onVoltar: () => void;
}) {
  const [d, setD] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!info.lancamento_id) return;
    const sb = clienteNavegador();
    (async () => {
      const { data: l, error } = await sb.from("lancamentos")
        .select("valor, digitado_em, recebido_em, situacao, usuarios!lancamentos_auditor_id_fkey(nome)").eq("id", info.lancamento_id!).single();
      if (error || !l) throw error ?? new Error();
      const { data: fs } = await sb.from("lancamento_fotos").select("caminho").eq("lancamento_id", info.lancamento_id!).order("criado_em");
      const caminhos = (fs ?? []).map((f) => f.caminho);
      const { data: urls } = caminhos.length ? await sb.storage.from("fotos").createSignedUrls(caminhos, 600) : { data: [] };
      setD({
        valor: Number(l.valor), digitado_em: l.digitado_em, recebido_em: l.recebido_em, situacao: l.situacao,
        auditor: (l.usuarios as unknown as { nome: string } | null)?.nome ?? "—",
        fotos: (urls ?? []).flatMap((u) => (u.signedUrl ? [u.signedUrl] : [])),
      });
    })().catch(() => setErro("Não foi possível carregar o lançamento (verifique a internet)."));
  }, [info.lancamento_id]);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <button onClick={onVoltar} className="text-sm text-azul">← Voltar ao calendário</button>
      <div>
        <p className="text-sm text-gray-500">{loja.nome} · {loja.luc}</p>
        <h1 className="text-2xl font-bold">🔒 Venda de {formatarData(dia)}</h1>
      </div>

      {info.situacao === "pendente_envio" && (
        <Aviso tipo="alerta">
          Lançamento de {formatarMoeda(info.valor)} guardado neste aparelho, aguardando internet para ser enviado.
        </Aviso>
      )}

      {info.situacao !== "pendente_envio" && !info.lancamento_id && (
        <Aviso tipo="info">
          Dia já lançado por <strong>{info.auditor_nome}</strong>. O valor e as fotos ficam visíveis apenas para quem lançou e para a análise.
        </Aviso>
      )}

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {info.lancamento_id && !d && !erro && <p className="text-gray-500">Carregando…</p>}

      {d && (
        <>
          <dl className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div><dt className="text-sm text-gray-500">Venda líquida</dt><dd className="text-3xl font-bold text-azul">{formatarMoeda(d.valor)}</dd></div>
            <div><dt className="text-sm text-gray-500">Lançado por</dt><dd>{d.auditor}</dd></div>
            <div><dt className="text-sm text-gray-500">Digitado em</dt><dd>{formatarDataHora(d.digitado_em)}{d.recebido_em.slice(0, 16) !== d.digitado_em.slice(0, 16) && <span className="text-sm text-gray-500"> (recebido em {formatarDataHora(d.recebido_em)})</span>}</dd></div>
            {d.situacao === "em_analise" && <div><Etiqueta cor="amarelo">Em análise pelo Analista</Etiqueta></div>}
          </dl>
          <div className="grid grid-cols-2 gap-2">
            {d.fotos.map((u, i) => (
              <a key={i} href={u} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt={`Foto ${i + 1}`} className="aspect-square w-full rounded-lg border object-cover" />
              </a>
            ))}
          </div>
          {podeEditar && (
            <Link href={`/lancamentos/${info.lancamento_id}`}
              className="flex min-h-12 w-full items-center justify-center rounded-xl border border-azul bg-white font-semibold text-azul">
              Editar lançamento
            </Link>
          )}
        </>
      )}
    </div>
  );
}
