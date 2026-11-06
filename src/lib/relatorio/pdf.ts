import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatarData, formatarDataHora, formatarMoeda, formatarPercentual } from "@/lib/formato";
import { NOME_CLASSIFICACAO } from "@/lib/conciliacao";
import { linhasConsolidadas, rotuloMes, rotuloVersao, totaisAluguel, type LinhaConsolidada, type Meta, type RelatorioEmitido } from "./dados";

const AZUL = rgb(0.12, 0.31, 0.47);
const CINZA = rgb(0.45, 0.45, 0.45);
const ZEBRA = rgb(0.95, 0.96, 0.98);
const VERMELHO = rgb(0.7, 0.1, 0.1);
const VERDE = rgb(0.05, 0.45, 0.2);

/** Remove caracteres que a fonte padrão do PDF não tem. */
function limpar(s: string): string {
  return s.replace(/→/g, "->").replace(/ /g, " ").replace(/[^\x20-\xFF—–•…€‘’“”]/g, "?");
}
const rs = (centavos: number | null | undefined) => (centavos === null || centavos === undefined ? "—" : formatarMoeda(centavos / 100));
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);

interface Col { titulo: string; largura: number; alinhar?: "dir"; }

class Documento {
  pdf!: PDFDocument; f!: PDFFont; b!: PDFFont;
  pagina!: PDFPage; y = 0;
  constructor(public largura: number, public altura: number, public meta: Meta, public subtitulo: string) {}
  async iniciar() {
    this.pdf = await PDFDocument.create();
    this.pdf.setTitle(limpar(`${this.subtitulo} — ${rotuloMes(this.meta.mes)}`));
    this.pdf.setCreator("Auditoria de Vendas — Shopping Benfica");
    this.f = await this.pdf.embedFont(StandardFonts.Helvetica);
    this.b = await this.pdf.embedFont(StandardFonts.HelveticaBold);
    this.novaPagina();
  }
  novaPagina() {
    this.pagina = this.pdf.addPage([this.largura, this.altura]);
    this.y = this.altura - 30;
    this.texto("SHOPPING BENFICA · AUDITORIA DE VENDAS", 28, this.y, 7, this.b, CINZA);
    this.texto(limpar(`${this.subtitulo} — ${rotuloMes(this.meta.mes)} · ${rotuloVersao(this.meta)}`), 28, this.y - 10, 7, this.f, CINZA);
    if (this.meta.versao === null) this.texto("PRÉVIA — NÃO EMITIDA", this.largura - 150, this.y, 9, this.b, VERMELHO);
    this.y -= 26;
  }
  texto(t: string, x: number, y: number, tam: number, fonte: PDFFont = this.f, cor = rgb(0.1, 0.1, 0.1)) {
    this.pagina.drawText(limpar(t), { x, y, size: tam, font: fonte, color: cor });
  }
  cortar(t: string, largura: number, tam: number, fonte: PDFFont = this.f): string {
    let s = limpar(t);
    while (s.length > 1 && fonte.widthOfTextAtSize(s, tam) > largura) s = s.slice(0, -2) + "…";
    return s;
  }
  garantir(espaco: number) { if (this.y - espaco < 40) this.novaPagina(); }
  linha(rotulo: string, valor: string, x = 28, larguraRot = 220, tam = 9) {
    this.garantir(14);
    this.texto(rotulo, x, this.y, tam, this.f, CINZA);
    this.texto(valor, x + larguraRot, this.y, tam, this.b);
    this.y -= 13;
  }
  titulo(t: string, tam = 11) { this.garantir(24); this.y -= 4; this.texto(t, 28, this.y, tam, this.b, AZUL); this.y -= tam + 6; }
  tabela(cols: Col[], linhas: string[][], tam = 6.8, cores?: ((i: number, c: number) => ReturnType<typeof rgb> | undefined)) {
    const alturaLinha = tam + 5;
    const cabecalho = () => {
      let x = 28;
      this.pagina.drawRectangle({ x: 26, y: this.y - 3, width: cols.reduce((s, c) => s + c.largura, 0) + 4, height: alturaLinha + 2, color: AZUL });
      for (const c of cols) {
        const t = this.cortar(c.titulo, c.largura - 3, tam, this.b);
        const w = this.b.widthOfTextAtSize(t, tam);
        this.texto(t, c.alinhar === "dir" ? x + c.largura - 3 - w : x, this.y, tam, this.b, rgb(1, 1, 1));
        x += c.largura;
      }
      this.y -= alturaLinha + 2;
    };
    cabecalho();
    linhas.forEach((l, i) => {
      if (this.y - alturaLinha < 40) { this.novaPagina(); cabecalho(); }
      if (i % 2 === 1) this.pagina.drawRectangle({ x: 26, y: this.y - 3, width: cols.reduce((s, c) => s + c.largura, 0) + 4, height: alturaLinha, color: ZEBRA });
      let x = 28;
      l.forEach((v, k) => {
        const c = cols[k];
        const t = this.cortar(v, c.largura - 3, tam);
        const w = this.f.widthOfTextAtSize(t, tam);
        this.texto(t, c.alinhar === "dir" ? x + c.largura - 3 - w : x, this.y, tam, l[0] === "TOTAL" ? this.b : this.f, cores?.(i, k));
        x += c.largura;
      });
      this.y -= alturaLinha;
    });
    this.y -= 6;
  }
  async finalizar(): Promise<Uint8Array> {
    const pgs = this.pdf.getPages();
    pgs.forEach((p, i) => {
      const rod = limpar(`Página ${i + 1} de ${pgs.length}${this.meta.emitidoEm ? ` · emitido em ${formatarDataHora(this.meta.emitidoEm)}` : ` · gerado em ${formatarDataHora(new Date())}`}`);
      p.drawText(rod, { x: 28, y: 20, size: 7, font: this.f, color: CINZA });
    });
    return this.pdf.save();
  }
}

const corDif = (v: number | null) => (v === null || v === 0 ? undefined : v > 0 ? VERDE : VERMELHO);

/** PDF consolidado do shopping (uma linha por loja). */
export async function gerarPdfConsolidado(rel: RelatorioEmitido, meta: Meta): Promise<Uint8Array> {
  const d = new Documento(842, 595, meta, "Relatório consolidado do shopping");
  await d.iniciar();
  const linhas = linhasConsolidadas(rel);
  const tot = totaisAluguel(linhas);
  d.titulo(`Relatório consolidado — ${rotuloMes(meta.mes)}`, 14);
  if (meta.emitidoEm) d.linha("Emissão", `${formatarDataHora(meta.emitidoEm)}${meta.emitidoPor ? ` por ${meta.emitidoPor}` : ""} · ${rotuloVersao(meta)}`, 28, 120);
  d.linha("Venda informada (base do aluguel)", rs(tot.informado), 28, 200);
  d.linha("Aluguel percentual · mínimo", `${rs(tot.aluguelPercentual)} · ${rs(tot.minimo)}`, 28, 200);
  d.linha("Aluguel complementar a cobrar", `${rs(tot.complementar)} (${tot.lojasComComplementar} loja/s)`, 28, 200);
  d.linha("Indicador (não cobrado) pela projeção", rs(tot.indicadorDiferenca), 28, 200);
  d.linha("Conciliação: lojas com alerta", `${rel.totais.lojas_com_alerta ?? 0} de ${rel.totais.lojas_conciliadas ?? 0} · para maior ${rs(Math.round(Number(rel.totais.diferenca_para_maior ?? 0) * 100))} · para menor ${rs(Math.round(Number(rel.totais.diferenca_para_menor ?? 0) * 100))}`, 28, 200);
  d.y -= 6;
  const cols: Col[] = [
    { titulo: "Nº LUC", largura: 60 }, { titulo: "Loja", largura: 118 }, { titulo: "Informado", largura: 64, alinhar: "dir" },
    { titulo: "Dias", largura: 24, alinhar: "dir" }, { titulo: "Projeção", largura: 64, alinhar: "dir" },
    { titulo: "Diferença", largura: 60, alinhar: "dir" }, { titulo: "Dif. %", largura: 38, alinhar: "dir" },
    { titulo: "% aluguel", largura: 36, alinhar: "dir" }, { titulo: "Aluguel %", largura: 58, alinhar: "dir" },
    { titulo: "Mínimo", largura: 58, alinhar: "dir" }, { titulo: "Complementar", largura: 60, alinhar: "dir" },
    { titulo: "P. equilíbrio", largura: 64, alinhar: "dir" }, { titulo: "Indicador", largura: 56, alinhar: "dir" },
  ];
  const dados = linhas.map((l) => [
    l.luc, l.nome + (l.auditada ? "" : " (não aud.)"), rs(l.informadoCentavos), String(l.diasAuditados), rs(l.projecaoCentavos),
    rs(l.diferencaCentavos), pct(l.diferencaPercentual), l.percentual === null ? "—" : formatarPercentual(l.percentual),
    rs(l.aluguel?.aluguelPercentualCentavos), rs(l.aluguel?.minimoCentavos) + (l.minimoEh13 ? "*" : ""),
    rs(l.aluguel?.complementarCentavos), rs(l.aluguel?.pontoEquilibrioCentavos), rs(l.aluguel?.indicador?.diferencaCentavos),
  ]);
  dados.push(["TOTAL", "", rs(tot.informado), "", "", "", "", "", rs(tot.aluguelPercentual), rs(tot.minimo), rs(tot.complementar), "", rs(tot.indicadorDiferenca)]);
  d.tabela(cols, dados, 6.8, (i, k) => (k === 5 && i < linhas.length ? corDif(linhas[i].diferencaCentavos) : undefined));
  d.texto("* mínimo de dezembro = 13º aluguel. Diferença = projeção auditada − informado. Indicador: complementar adicional se a base fosse o maior entre informado e projeção (não cobrado).", 28, d.y, 6.5, d.f, CINZA);
  d.y -= 14;
  const fora = [
    rel.informado_sem_loja.length ? `LUC do PDF sem cadastro: ${rel.informado_sem_loja.map((x) => `${x.luc} (${rs(Math.round(Number(x.valor) * 100))})`).join("; ")}` : "",
    linhas.some((l) => l.aluguel?.pendencias.length) ? `Pendências de cadastro: ${linhas.filter((l) => l.aluguel?.pendencias.length).map((l) => `${l.luc} (${l.aluguel!.pendencias.join(", ")})`).join("; ")}` : "",
  ].filter(Boolean);
  for (const t of fora) {
    for (let i = 0; i < t.length; i += 190) { d.garantir(10); d.texto(t.slice(i, i + 190), 28, d.y, 7); d.y -= 9; }
  }
  return d.finalizar();
}

/** PDF de uma loja: conciliação, cálculo do aluguel e dias auditados. */
export async function gerarPdfLoja(rel: RelatorioEmitido, meta: Meta, lojaId: string): Promise<Uint8Array | null> {
  const l: LinhaConsolidada | undefined = linhasConsolidadas(rel).find((x) => x.loja_id === lojaId);
  if (!l) return null;
  const d = new Documento(595, 842, meta, "Relatório da loja");
  await d.iniciar();
  d.titulo(l.nome, 15);
  d.texto(`Nº LUC ${l.luc}${l.segmento ? ` · ${l.segmento}` : ""} · ${rotuloMes(meta.mes)} (${rel.dias_no_mes} dias)${l.auditada ? "" : " · loja não auditada"}`, 28, d.y, 9, d.f, CINZA);
  d.y -= 20;

  d.titulo("Conciliação (venda informada × auditada)");
  d.linha("Venda informada no mês", rs(l.informadoCentavos));
  d.linha("Média diária informada", rs(l.mediaInformadaCentavos));
  d.linha("Dias auditados", `${l.diasAuditados} de ${rel.dias_no_mes}${l.diasAuditados > 0 && l.diasAuditados < 5 ? " (poucos dias: projeção menos confiável)" : ""}`);
  d.linha("Média diária auditada", rs(l.mediaAuditadaCentavos));
  d.linha("Projeção auditada do mês", rs(l.projecaoCentavos));
  d.linha("Diferença projetada", `${rs(l.diferencaCentavos)} ${l.diferencaPercentual !== null ? `(${pct(l.diferencaPercentual)})` : ""} ${l.classificacao ? "· " + NOME_CLASSIFICACAO[l.classificacao] : ""}`);

  d.titulo("Cálculo do aluguel (base: venda informada)");
  const a = l.aluguel;
  if (!a) d.linha("Situação", "sem venda informada no mês — aluguel não calculado");
  else {
    d.linha("Percentual vigente", l.percentual === null ? "—" : formatarPercentual(l.percentual));
    d.linha("Aluguel percentual", rs(a.aluguelPercentualCentavos));
    d.linha(l.minimoEh13 ? "Aluguel mínimo do mês (13º aluguel)" : "Aluguel mínimo do mês", rs(a.minimoCentavos) + (l.falta13 ? " (13º não cadastrado: mínimo padrão)" : ""));
    d.linha("Aluguel complementar", a.complementarCentavos === null ? "—" : a.temComplementar ? `${rs(a.complementarCentavos)} a pagar` : "sem complementar");
    d.linha("Ponto de equilíbrio (venda)", rs(a.pontoEquilibrioCentavos));
    if (a.indicador) {
      d.linha("Indicador: base (maior entre informado e projeção)", rs(a.indicador.baseCentavos));
      d.linha("Indicador: complementar (não cobrado)", `${rs(a.indicador.complementarCentavos)} · diferença ${rs(a.indicador.diferencaCentavos)}`);
    }
    if (a.pendencias.length) d.linha("Pendências", a.pendencias.join("; "));
  }

  if (l.dias.length) {
    d.titulo("Dias auditados × média diária informada (maior desvio primeiro)");
    d.tabela(
      [{ titulo: "Data", largura: 90 }, { titulo: "Venda auditada", largura: 110, alinhar: "dir" }, { titulo: "Média informada", largura: 110, alinhar: "dir" },
        { titulo: "Desvio (R$)", largura: 110, alinhar: "dir" }, { titulo: "Desvio (%)", largura: 80, alinhar: "dir" }],
      l.dias.map((x) => [formatarData(x.data), rs(x.valorCentavos), rs(l.mediaInformadaCentavos), rs(x.desvioCentavos),
        l.mediaInformadaCentavos ? pct(Math.round((x.desvioCentavos / l.mediaInformadaCentavos) * 10000) / 100) : "—"]),
      8, (i, k) => (k === 3 ? corDif(l.dias[i].desvioCentavos) : undefined),
    );
  }
  return d.finalizar();
}
