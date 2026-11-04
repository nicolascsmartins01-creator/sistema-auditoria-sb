import Link from "next/link";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { ehAnalista } from "@/lib/perfis";
import { listarLojas, vigentesPorLoja } from "@/lib/dados/lojas";
import { hojeFortaleza, inicioMesAtualFortaleza } from "@/lib/formato";
import { Aviso, Cartao } from "@/components/ui";

export default async function Inicio({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const u = await exigirUsuario();
  const { aviso } = await searchParams;
  const primeiroNome = u.nome.split(" ")[0];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Olá, {primeiroNome}</h1>
      {aviso === "sem-permissao" && <Aviso tipo="alerta">Você não tem permissão para acessar aquela página.</Aviso>}
      {ehAnalista(u.perfil) ? <PainelAnalista /> : <PainelAuditor />}
    </div>
  );
}

function PainelAuditor() {
  return (
    <Cartao titulo="Lançamento de vendas auditadas">
      <p className="text-gray-700">
        O lançamento diário (busca da loja, calendário, valor e fotos) estará disponível na próxima etapa do sistema.
      </p>
      <p className="mt-3"><Link href="/lojas" className="text-azul underline">Consultar lojas</Link></p>
    </Cartao>
  );
}

async function PainelAnalista() {
  const sb = await criarClienteServidor();
  const mes = inicioMesAtualFortaleza();
  const ano = Number(hojeFortaleza().slice(0, 4));
  const [lojas, vigentes, dez, pendPct, pendMin] = await Promise.all([
    listarLojas(sb),
    vigentesPorLoja(sb, mes),
    sb.from("loja_aluguel_dezembro").select("loja_id").eq("ano", ano),
    sb.from("loja_percentuais").select("loja_id").is("vigencia_inicio", null),
    sb.from("loja_alugueis_minimos").select("loja_id").is("vigencia_inicio", null),
  ]);
  const comPendente = new Set([...(pendPct.data ?? []), ...(pendMin.data ?? [])].map((x) => x.loja_id));
  const ativas = lojas.filter((l) => l.ativa);
  const com13 = new Set((dez.data ?? []).map((d) => d.loja_id));
  const semPct = ativas.filter((l) => vigentes.get(l.id)?.percentual == null);
  const semMin = ativas.filter((l) => vigentes.get(l.id)?.minimo == null);
  const sem13 = ativas.filter((l) => !com13.has(l.id));

  const numeros = [
    { rotulo: "Lojas ativas", valor: ativas.length, href: "/lojas" },
    { rotulo: "Auditadas", valor: ativas.filter((l) => l.auditada).length, href: "/lojas?auditada=sim" },
    { rotulo: "Inativas", valor: lojas.length - ativas.length, href: "/lojas?situacao=inativas" },
  ];
  const pendencias = [
    { qtd: lojas.filter((l) => comPendente.has(l.id)).length, texto: "loja(s) com percentual ou mínimo de vigência a definir", href: "/lojas?pendencia=a-definir" },
    { qtd: semPct.length, texto: "loja(s) ativa(s) sem percentual vigente neste mês", href: "/lojas?pendencia=percentual" },
    { qtd: semMin.length, texto: "loja(s) ativa(s) sem aluguel mínimo vigente neste mês", href: "/lojas?pendencia=minimo" },
    { qtd: sem13.length, texto: `loja(s) ativa(s) sem 13º aluguel de ${ano} cadastrado`, href: "/lojas?pendencia=13" },
  ].filter((p) => p.qtd > 0);

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {numeros.map((n) => (
          <Link key={n.rotulo} href={n.href} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-azul">
            <span className="block text-3xl font-bold text-azul">{n.valor}</span>
            <span className="text-sm text-gray-600">{n.rotulo}</span>
          </Link>
        ))}
      </div>
      <Cartao titulo="Pendências do cadastro">
        {pendencias.length === 0 ? (
          <p className="text-gray-600">Nenhuma pendência. Todas as lojas ativas têm percentual, mínimo e 13º aluguel cadastrados.</p>
        ) : (
          <ul className="space-y-2">
            {pendencias.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 hover:border-amber-400">
                  <span className="text-xl font-bold text-amber-800">{p.qtd}</span>
                  <span className="text-amber-900">{p.texto}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
      <Cartao titulo="Em construção">
        <p className="text-sm text-gray-600">
          Alertas de divergência, conciliação mensal e fechamento aparecerão aqui nas próximas etapas.
        </p>
      </Cartao>
    </>
  );
}
