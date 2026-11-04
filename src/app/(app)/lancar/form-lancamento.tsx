"use client";

import { useEffect, useRef, useState } from "react";
import { reduzirFoto } from "@/lib/fotos";
import { adicionarNaFila, enviarItem, removerDaFila, type ItemFila } from "@/lib/offline/fila";
import { formatarData, formatarMoeda, formatarValor } from "@/lib/formato";
import { Aviso } from "@/components/ui";
import type { LojaLanc } from "./app-lancamento";

const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const diaSemana = (d: string) => DIAS_SEMANA[new Date(d + "T12:00:00Z").getUTCDay()];

interface Foto { id: string; blob: Blob; url: string }

/** Passo 3: valor (teclado numérico já aberto) + fotos → confirmação → envio. */
export function FormLancamento({ loja, dia, onCancelar, onConcluido }: {
  loja: LojaLanc; dia: string; onCancelar: () => void; onConcluido: (aviso: string) => void;
}) {
  const [centavos, setCentavos] = useState(0);
  const [digitou, setDigitou] = useState(false);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const valorRef = useRef<HTMLInputElement>(null);

  useEffect(() => { valorRef.current?.focus(); }, []);
  useEffect(() => () => fotos.forEach((f) => URL.revokeObjectURL(f.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function anexar(lista: FileList | null) {
    if (!lista?.length) return;
    setProcessandoFoto(true);
    const novas: Foto[] = [];
    for (const arq of Array.from(lista)) {
      const blob = await reduzirFoto(arq);
      novas.push({ id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob) });
    }
    setFotos((f) => [...f, ...novas]);
    setProcessandoFoto(false);
  }

  function remover(id: string) {
    setFotos((f) => {
      const x = f.find((y) => y.id === id);
      if (x) URL.revokeObjectURL(x.url);
      return f.filter((y) => y.id !== id);
    });
  }

  async function confirmar() {
    setEnviando(true);
    setErro(null);
    const item: ItemFila = {
      cliente_id: crypto.randomUUID(), loja_id: loja.id, loja_nome: loja.nome, loja_luc: loja.luc,
      data_venda: dia, valor: centavos / 100, digitado_em: new Date().toISOString(),
      fotos: fotos.map((f) => f.blob), tentativas: 0,
    };
    // 1º guarda no aparelho (nada se perde), 2º tenta enviar
    await adicionarNaFila(item);
    const r = await enviarItem(item);
    if (r.ok) {
      await removerDaFila(item.cliente_id);
      onConcluido(r.situacao === "em_analise"
        ? `Lançamento de ${formatarData(dia)} recebido e enviado para análise do Analista.`
        : `Lançamento de ${formatarData(dia)} registrado: ${formatarMoeda(item.valor)}.`);
    } else if (r.rede) {
      onConcluido(`Guardado no aparelho: o lançamento de ${formatarData(dia)} será enviado automaticamente quando a internet voltar.`);
    } else {
      await removerDaFila(item.cliente_id);
      setErro(traduzir(r.mensagem));
      setEnviando(false);
    }
  }

  const valido = digitou && fotos.length > 0 && !processandoFoto;

  if (confirmando) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">Confira o lançamento</h1>
        <dl className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 text-lg shadow-sm">
          <div><dt className="text-sm text-gray-500">Loja</dt><dd className="font-semibold">{loja.nome} <span className="text-sm font-normal text-gray-500">({loja.luc})</span></dd></div>
          <div><dt className="text-sm text-gray-500">Data da venda</dt><dd className="font-semibold">{formatarData(dia)} <span className="text-sm font-normal text-gray-500">({diaSemana(dia)})</span></dd></div>
          <div><dt className="text-sm text-gray-500">Venda líquida</dt><dd className="text-3xl font-bold text-azul">{formatarMoeda(centavos / 100)}</dd></div>
          <div><dt className="text-sm text-gray-500">Fotos</dt><dd>{fotos.length} anexada(s)</dd></div>
        </dl>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <button onClick={confirmar} disabled={enviando}
          className="min-h-14 w-full rounded-xl bg-green-700 text-lg font-semibold text-white shadow disabled:bg-gray-400">
          {enviando ? "Enviando…" : "Confirmar lançamento"}
        </button>
        <button onClick={() => { setConfirmando(false); setErro(null); }} disabled={enviando}
          className="min-h-12 w-full rounded-xl border border-gray-300 bg-white text-base">Corrigir</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <p className="text-sm text-gray-500">{loja.nome} · {loja.luc}</p>
        <h1 className="text-2xl font-bold">Venda de {formatarData(dia)}</h1>
        <p className="text-sm text-gray-500">{diaSemana(dia)[0].toUpperCase() + diaSemana(dia).slice(1)}</p>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Venda líquida (R$)</span>
        <div className="flex items-center rounded-xl border-2 border-azul bg-white px-4 shadow-sm">
          <span className="mr-2 text-2xl text-gray-500">R$</span>
          <input ref={valorRef} inputMode="numeric" pattern="[0-9]*" autoComplete="off" aria-label="Valor da venda líquida"
            value={digitou ? formatarValor(centavos / 100) : ""} placeholder="0,00"
            onChange={(e) => {
              const digitos = e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 12);
              setCentavos(Number(digitos || "0"));
              setDigitou(e.target.value.replace(/\D/g, "") !== "");
            }}
            className="min-h-16 w-full bg-transparent text-right text-3xl font-bold outline-none" />
        </div>
        <span className="mt-1 block text-xs text-gray-500">Digite só os números: 123456 vira 1.234,56.</span>
      </label>

      <div className="space-y-3">
        <span className="block text-sm font-medium text-gray-700">Fotos do comprovante (uma por caixa) — obrigatório</span>
        {fotos.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {fotos.map((f) => (
              <li key={f.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt="Foto anexada" className="aspect-square w-full rounded-lg object-cover" />
                <button onClick={() => remover(f.id)} aria-label="Remover foto"
                  className="absolute right-1 top-1 h-8 w-8 rounded-full bg-black/60 text-white">✕</button>
              </li>
            ))}
          </ul>
        )}
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => { anexar(e.target.files); e.target.value = ""; }} />
        <input ref={galeria} type="file" accept="image/*" multiple hidden
          onChange={(e) => { anexar(e.target.files); e.target.value = ""; }} />
        <button onClick={() => camera.current?.click()} disabled={processandoFoto}
          className="min-h-14 w-full rounded-xl border-2 border-dashed border-azul bg-azul-claro text-lg font-semibold text-azul">
          {processandoFoto ? "Processando foto…" : fotos.length ? "📷 Anexar outra foto" : "📷 Anexar foto"}
        </button>
        <button onClick={() => galeria.current?.click()} disabled={processandoFoto} className="w-full text-sm text-azul underline">
          Escolher da galeria
        </button>
      </div>

      {!valido && <p className="text-sm text-gray-500">{!digitou ? "Informe o valor." : fotos.length === 0 ? "Anexe pelo menos uma foto." : ""}</p>}
      <button onClick={() => setConfirmando(true)} disabled={!valido}
        className="min-h-14 w-full rounded-xl bg-azul text-lg font-semibold text-white shadow disabled:bg-gray-300">
        Continuar
      </button>
      <button onClick={onCancelar} className="min-h-12 w-full text-base text-gray-600">Cancelar</button>
    </div>
  );
}

function traduzir(m: string): string {
  if (/já foi lançado/.test(m)) return "Este dia já foi lançado para esta loja (talvez por outro auditor). Volte ao calendário.";
  return m.replace(/^.*?ERROR:\s*/, "");
}
