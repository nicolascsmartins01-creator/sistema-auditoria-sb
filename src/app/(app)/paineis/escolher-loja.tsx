"use client";
import { useRouter } from "next/navigation";

export function EscolherLoja({ lojas, atual, base }: { lojas: { id: string; texto: string }[]; atual: string; base: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-gray-600">Loja:</span>
      <select value={atual} aria-label="Escolher loja"
        onChange={(e) => router.push(`${base}&loja=${e.target.value}#loja`, { scroll: false })}
        className="min-h-11 max-w-[18rem] rounded-lg border border-gray-300 bg-white px-3">
        {lojas.map((l) => <option key={l.id} value={l.id}>{l.texto}</option>)}
      </select>
    </label>
  );
}
