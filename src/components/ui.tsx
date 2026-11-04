import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variante = "primario" | "secundario" | "perigo" | "discreto";

const VARIANTES: Record<Variante, string> = {
  primario: "bg-azul text-white hover:bg-azul-escuro disabled:bg-gray-400",
  secundario: "bg-white text-azul border border-azul hover:bg-azul-claro disabled:text-gray-400 disabled:border-gray-300",
  perigo: "bg-white text-red-700 border border-red-300 hover:bg-red-50",
  discreto: "text-azul hover:underline px-0",
};

export function classesBotao(v: Variante = "primario", extra = "") {
  return `inline-flex items-center justify-center gap-2 rounded-lg px-4 min-h-11 font-medium transition-colors disabled:cursor-not-allowed ${VARIANTES[v]} ${extra}`;
}

export function Botao({ variante = "primario", className = "", ...p }: ComponentProps<"button"> & { variante?: Variante }) {
  return <button {...p} className={classesBotao(variante, className)} />;
}

export function LinkBotao({ variante = "primario", className = "", ...p }: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link {...p} className={classesBotao(variante, className)} />;
}

export function Cartao({ titulo, acoes, children, className = "" }: { titulo?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {(titulo || acoes) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {titulo && <h2 className="text-lg font-semibold text-gray-900">{titulo}</h2>}
          {acoes}
        </div>
      )}
      {children}
    </section>
  );
}

export function Titulo({ children, voltar, acoes }: { children: ReactNode; voltar?: { href: string; texto: string }; acoes?: ReactNode }) {
  return (
    <div className="mb-5">
      {voltar && (
        <Link href={voltar.href} className="mb-1 inline-block text-sm text-azul hover:underline">
          ← {voltar.texto}
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{children}</h1>
        {acoes}
      </div>
    </div>
  );
}

export function Campo({ rotulo, erro, ajuda, children }: { rotulo: string; erro?: string; ajuda?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{rotulo}</span>
      {children}
      {ajuda && !erro && <span className="mt-1 block text-xs text-gray-500">{ajuda}</span>}
      {erro && <span className="mt-1 block text-sm text-red-700">{erro}</span>}
    </label>
  );
}

export const classesInput =
  "block w-full rounded-lg border border-gray-300 bg-white px-3 min-h-11 text-base text-gray-900 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/30 disabled:bg-gray-100";

export function Entrada(p: ComponentProps<"input">) {
  return <input {...p} className={`${classesInput} ${p.className ?? ""}`} />;
}

export function Selecao(p: ComponentProps<"select">) {
  return <select {...p} className={`${classesInput} ${p.className ?? ""}`} />;
}

type TipoAviso = "erro" | "sucesso" | "alerta" | "info";
const AVISOS: Record<TipoAviso, string> = {
  erro: "border-red-300 bg-red-50 text-red-800",
  sucesso: "border-green-300 bg-green-50 text-green-800",
  alerta: "border-amber-300 bg-amber-50 text-amber-900",
  info: "border-blue-200 bg-blue-50 text-blue-900",
};

export function Aviso({ tipo = "info", children, className = "" }: { tipo?: TipoAviso; children: ReactNode; className?: string }) {
  return (
    <div role={tipo === "erro" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${AVISOS[tipo]} ${className}`}>
      {children}
    </div>
  );
}

type CorEtiqueta = "cinza" | "verde" | "vermelho" | "azul" | "amarelo";
const ETIQUETAS: Record<CorEtiqueta, string> = {
  cinza: "bg-gray-100 text-gray-700",
  verde: "bg-green-100 text-green-800",
  vermelho: "bg-red-100 text-red-800",
  azul: "bg-blue-100 text-blue-800",
  amarelo: "bg-amber-100 text-amber-900",
};

export function Etiqueta({ cor = "cinza", children }: { cor?: CorEtiqueta; children: ReactNode }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ETIQUETAS[cor]}`}>{children}</span>;
}
