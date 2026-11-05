import { exigirUsuario } from "@/lib/sessao";
import { ehAdmin, ehAnalista, NOMES_PERFIL } from "@/lib/perfis";
import { sair } from "@/app/login/actions";
import { Menu, type ItemMenu } from "./menu";
import { FaixaSincronizacao } from "@/components/faixa-sincronizacao";
import { RegistrarServiceWorker } from "@/components/registrar-sw";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const u = await exigirUsuario();
  const itens: ItemMenu[] = [
    { href: "/", texto: "Início" },
    { href: "/lancar", texto: "Lançar" },
    { href: "/lojas", texto: "Lojas" },
  ];
  if (ehAnalista(u.perfil)) {
    itens.push({ href: "/lancamentos", texto: "Lançamentos" });
    itens.push({ href: "/vendas-informadas", texto: "Informado" });
    itens.push({ href: "/segmentos", texto: "Segmentos" });
    itens.push({ href: "/importacao", texto: "Importação" });
    itens.push({ href: "/historico", texto: "Histórico" });
  }
  if (ehAdmin(u.perfil)) itens.push({ href: "/usuarios", texto: "Usuários" });

  return (
    <>
      <Menu itens={itens} nome={u.nome} perfil={NOMES_PERFIL[u.perfil]} sair={sair} />
      <FaixaSincronizacao />
      <RegistrarServiceWorker />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
