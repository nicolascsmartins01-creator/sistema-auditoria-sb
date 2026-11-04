"use client";

/**
 * Fila de lançamentos guardada no aparelho (IndexedDB).
 *
 * Todo lançamento confirmado entra primeiro na fila (assim nada se perde se a
 * internet cair ou o celular desligar) e é enviado em seguida. Sem internet,
 * fica guardado e é enviado sozinho quando a conexão voltar. Cada lançamento
 * tem um identificador gerado no aparelho, então reenviar nunca duplica.
 * Vale a hora em que foi digitado (o servidor confere o limite de 72 h).
 */
import { clienteNavegador } from "@/lib/supabase/navegador";

export interface ItemFila {
  cliente_id: string;
  loja_id: string;
  loja_nome: string;
  loja_luc: string;
  data_venda: string;     // aaaa-mm-dd
  valor: number;          // em reais
  digitado_em: string;    // ISO, hora do aparelho
  fotos: Blob[];
  tentativas: number;
  erro?: string;          // recusado pelo servidor (ex.: prazo); fica para o usuário ver
}

const BANCO = "auditoria-benfica";
const LOJA = "fila-lancamentos";
export const EVENTO_FILA = "fila-lancamentos-mudou";

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const req = indexedDB.open(BANCO, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(LOJA, { keyPath: "cliente_id" });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falha(req.error);
  });
}

async function transacao<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  return new Promise((ok, falha) => {
    const tx = db.transaction(LOJA, modo);
    const req = fn(tx.objectStore(LOJA));
    tx.oncomplete = () => { ok(req.result); db.close(); };
    tx.onerror = () => { falha(tx.error); db.close(); };
  });
}

function avisar() {
  window.dispatchEvent(new Event(EVENTO_FILA));
}

export async function listarFila(): Promise<ItemFila[]> {
  if (typeof indexedDB === "undefined") return [];
  return transacao("readonly", (s) => s.getAll() as IDBRequest<ItemFila[]>);
}

export async function adicionarNaFila(item: ItemFila): Promise<void> {
  await transacao("readwrite", (s) => s.put(item));
  avisar();
}

export async function removerDaFila(clienteId: string): Promise<void> {
  await transacao("readwrite", (s) => s.delete(clienteId));
  avisar();
}

async function atualizar(item: ItemFila) {
  await transacao("readwrite", (s) => s.put(item));
  avisar();
}

/** Erro de rede (tentar de novo depois) × erro de regra (o servidor recusou). */
function ehErroDeRede(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? e);
  return !navigator.onLine || /fetch|network|Failed to|Load failed|timeout|NetworkError/i.test(m);
}

export type ResultadoEnvio = { ok: true; id: string; situacao: string } | { ok: false; rede: boolean; mensagem: string };

export async function enviarItem(item: ItemFila): Promise<ResultadoEnvio> {
  const sb = clienteNavegador();
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return { ok: false, rede: false, mensagem: "Sessão expirada. Entre novamente para enviar." };
    const uid = session.user.id;
    const caminhos: string[] = [];
    for (let i = 0; i < item.fotos.length; i++) {
      const caminho = `${uid}/${item.cliente_id}-${i + 1}.jpg`;
      const { error } = await sb.storage.from("fotos").upload(caminho, item.fotos[i], { contentType: "image/jpeg", upsert: false });
      // já enviada numa tentativa anterior: segue
      if (error && !/exists|duplicate/i.test(error.message)) throw error;
      caminhos.push(caminho);
    }
    const { data, error } = await sb.rpc("registrar_lancamento", {
      p_cliente_id: item.cliente_id, p_loja_id: item.loja_id, p_data: item.data_venda,
      p_valor: item.valor, p_digitado_em: item.digitado_em, p_fotos: caminhos,
    });
    if (error) {
      if (ehErroDeRede(error)) return { ok: false, rede: true, mensagem: error.message };
      return { ok: false, rede: false, mensagem: error.message };
    }
    return { ok: true, id: data.id, situacao: data.situacao };
  } catch (e) {
    return { ok: false, rede: ehErroDeRede(e), mensagem: String((e as Error)?.message ?? e) };
  }
}

let processando = false;

/** Tenta enviar tudo o que está na fila. Devolve quantos foram enviados. */
export async function processarFila(): Promise<number> {
  if (processando || typeof navigator === "undefined" || !navigator.onLine) return 0;
  processando = true;
  let enviados = 0;
  try {
    for (const item of await listarFila()) {
      if (item.erro) continue; // recusado: aguarda o usuário
      const r = await enviarItem(item);
      if (r.ok) {
        await removerDaFila(item.cliente_id);
        enviados++;
      } else if (r.rede) {
        await atualizar({ ...item, tentativas: item.tentativas + 1 });
        break; // sem conexão: tenta tudo de novo mais tarde
      } else {
        await atualizar({ ...item, tentativas: item.tentativas + 1, erro: r.mensagem });
      }
    }
  } finally {
    processando = false;
  }
  if (enviados) window.dispatchEvent(new CustomEvent("lancamentos-enviados", { detail: enviados }));
  return enviados;
}
