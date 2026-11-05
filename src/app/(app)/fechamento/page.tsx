import Link from "next/link";
import { exigirUsuario, PERFIS_ANALISTA } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { estadoMes, NOMES_SITUACAO, processarFechamentosAutomaticos } from "@/lib/dados/fechamento";
import { formatarData, formatarDataHora, hojeFortaleza, MESES } from "@/lib/formato";
import { mesAnterior } from "@/lib/prazos";
import { Cartao, Etiqueta, Titulo } from "@/components/ui";

export default async function PaginaFechamento() {
  await exigirUsuario(PERFIS_ANALISTA);
  const sb = await criarClienteServidor();
  await processarFechamentosAutomaticos(sb);
  let m = hojeFortaleza().slice(0, 7);
  const meses: string[] = [];
  for (let i = 0; i < 6; i++) { meses.push(m); m = mesAnterior(m); }
  const [estados, { data: versoes }] = await Promise.all([
    Promise.all(meses.map((x) => estadoMes(sb, x))),
    sb.from("fechamento_versoes").select("competencia, versao, tipo, gerado_em").order("versao", { ascending: false }),
  ]);
  const porMes = new Map<string, { versao: number; tipo: string; gerado_em: string }[]>();
  for (const v of versoes ?? []) porMes.set(v.competencia.slice(0, 7), [...(porMes.get(v.competencia.slice(0, 7)) ?? []), v]);

  return (
    <>
      <Titulo>Fechamento mensal</Titulo>
      <Cartao className="mb-5">
        <ul className="space-y-1 text-sm text-gray-700">
          <li>• Lançamentos do mês: até <strong>23:59 do dia 5</strong> do mês seguinte.</li>
          <li>• Do dia 6 até o fechamento: <strong>revisão</strong> — o auditor não lança; o Analista ainda pode editar.</li>
          <li>• Fechamento automático: <strong>23:59 do 5º dia útil</strong> do mês seguinte (segunda a sexta, exceto <Link href="/feriados" className="text-azul underline">feriados</Link>).</li>
          <li>• O fechamento antecipado encerra o mês na hora. Reabertura só com motivo; ao refechar, nova versão do relatório.</li>
        </ul>
      </Cartao>
      <div className="space-y-3">
        {estados.map((e) => {
          const mes = e.competencia.slice(0, 7);
          const [a, mm] = mes.split("-").map(Number);
          const vs = porMes.get(mes) ?? [];
          const s = NOMES_SITUACAO[e.situacao];
          return (
            <Cartao key={mes}>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="w-40 text-lg font-semibold">{MESES[mm - 1][0].toUpperCase() + MESES[mm - 1].slice(1)}/{a}</h2>
                <Etiqueta cor={s.cor}>{s.nome}</Etiqueta>
                <span className="text-sm text-gray-600">Lançamentos até {formatarData(hojeFortaleza(new Date(e.prazo_lancamento)))} · fechamento automático em {formatarData(e.quinto_dia_util)} às 23:59</span>
                <Link href={`/fechamento/${mes}`} className="ml-auto text-sm font-semibold text-azul hover:underline">
                  {e.situacao === "fechado" ? "Ver / reabrir" : "Realizar fechamento"} →
                </Link>
              </div>
              {vs.length > 0 && (
                <p className="mt-2 text-sm text-gray-600">
                  Relatórios emitidos: {vs.map((v, i) => (
                    <span key={v.versao}>{i > 0 && " · "}<Link href={`/fechamento/${mes}/v/${v.versao}`} className="text-azul hover:underline">
                      versão {v.versao}</Link> ({v.tipo === "automatico" ? "automático" : v.tipo === "antecipado" ? "antecipado" : "refechamento"}, {formatarDataHora(v.gerado_em)})</span>
                  ))}
                </p>
              )}
            </Cartao>
          );
        })}
      </div>
    </>
  );
}
