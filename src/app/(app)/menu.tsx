"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export interface ItemMenu { href: string; texto: string }

/** Menu principal: barra no computador, gaveta no celular. */
export function Menu({ itens, nome, perfil, sair }: { itens: ItemMenu[]; nome: string; perfil: string; sair: () => Promise<void> }) {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  const ativo = (href: string) => (href === "/" ? caminho === "/" : caminho.startsWith(href));

  return (
    <header className="sticky top-0 z-20 bg-azul text-white shadow">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2">
        <Link href="/" className="mr-2 font-bold leading-tight" onClick={() => setAberto(false)}>
          Auditoria<span className="block text-xs font-normal opacity-80">Shopping Benfica</span>
        </Link>
        <nav className="hidden flex-1 flex-wrap gap-0.5 md:flex">
          {itens.map((i) => (
            <Link key={i.href} href={i.href}
              className={`rounded-md px-2.5 py-2 text-sm ${ativo(i.href) ? "bg-white/20 font-semibold" : "hover:bg-white/10"}`}>
              {i.texto}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-3 text-sm md:flex">
          <Link href="/minha-conta" className="text-right leading-tight hover:underline">
            {nome}<span className="block text-xs opacity-80">{perfil}</span>
          </Link>
          <form action={sair}><button className="rounded-md border border-white/40 px-3 py-1.5 hover:bg-white/10">Sair</button></form>
        </div>
        <button className="ml-auto min-h-11 min-w-11 rounded-md text-2xl md:hidden" aria-label="Abrir menu" aria-expanded={aberto}
          onClick={() => setAberto(!aberto)}>{aberto ? "✕" : "☰"}</button>
      </div>
      {aberto && (
        <nav className="border-t border-white/20 px-4 pb-4 md:hidden">
          <p className="py-3 text-sm opacity-80">{nome} · {perfil}</p>
          {[...itens, { href: "/minha-conta", texto: "Minha conta" }].map((i) => (
            <Link key={i.href} href={i.href} onClick={() => setAberto(false)}
              className={`block rounded-md px-3 py-3 text-base ${ativo(i.href) ? "bg-white/20 font-semibold" : ""}`}>
              {i.texto}
            </Link>
          ))}
          <form action={sair}><button className="mt-2 w-full rounded-md border border-white/40 px-3 py-3 text-left">Sair</button></form>
        </nav>
      )}
    </header>
  );
}
