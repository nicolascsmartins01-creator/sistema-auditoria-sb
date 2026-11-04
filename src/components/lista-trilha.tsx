import { descreverRegistro, type Contexto, type RegistroTrilha } from "@/lib/trilha";
import { formatarDataHora } from "@/lib/formato";

/** Lista de registros da trilha de auditoria (quem, quando, o quê). */
export function ListaTrilha({ registros, usuarios, ctx, extra }: {
  registros: RegistroTrilha[];
  usuarios: Map<string, string>;
  ctx?: Contexto;
  extra?: (r: RegistroTrilha) => React.ReactNode;
}) {
  if (!registros.length) return <p className="text-sm text-gray-500">Nenhum registro.</p>;
  return (
    <ol className="space-y-3">
      {registros.map((r) => {
        const d = descreverRegistro(r, ctx);
        return (
          <li key={r.id} className="border-l-2 border-azul/30 pl-3">
            <p className="text-sm">
              <span className="font-medium text-gray-900">{d.titulo}</span>
              {extra?.(r)}
            </p>
            <p className="text-xs text-gray-500">
              {formatarDataHora(r.ocorrido_em)} · {r.usuario_id ? usuarios.get(r.usuario_id) ?? "usuário removido" : "sistema"}
            </p>
            {d.detalhes.length > 0 && (
              <ul className="mt-1 text-sm text-gray-700">
                {d.detalhes.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            )}
            {r.motivo && <p className="mt-1 text-sm italic text-gray-700">Motivo: {r.motivo}</p>}
          </li>
        );
      })}
    </ol>
  );
}
