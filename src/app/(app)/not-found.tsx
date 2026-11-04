import Link from "next/link";
export default function NaoEncontrado() {
  return <div className="py-10 text-center"><p className="text-lg">Página não encontrada.</p><Link href="/" className="text-azul underline">Voltar ao início</Link></div>;
}
