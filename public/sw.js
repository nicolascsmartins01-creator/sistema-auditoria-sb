/*
 * Service worker — Auditoria de Vendas.
 * Permite abrir a tela de lançamento sem internet (depois de aberta uma vez com
 * internet). Os lançamentos feitos offline ficam guardados pelo próprio app
 * (IndexedDB) e são enviados quando a conexão volta; este arquivo só guarda as
 * páginas e arquivos do sistema. Dados do Supabase NUNCA são guardados aqui.
 */
const VERSAO = "v1";
const CACHE_PAGINAS = `paginas-${VERSAO}`;
const CACHE_ARQUIVOS = `arquivos-${VERSAO}`;
const PAGINA_OFFLINE = "/lancar";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const nome of await caches.keys()) {
      if (![CACHE_PAGINAS, CACHE_ARQUIVOS].includes(nome)) await caches.delete(nome);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return; // Supabase e envios: sempre direto
  if (url.pathname.startsWith("/importacao/") || url.pathname.startsWith("/api/")) return;

  // Arquivos estáticos do Next (nome muda a cada versão): cache primeiro
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icones/")) {
    e.respondWith(caches.open(CACHE_ARQUIVOS).then(async (c) => {
      const salvo = await c.match(req);
      if (salvo) return salvo;
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    }));
    return;
  }

  // Páginas: rede primeiro; sem internet, a última versão guardada
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const c = await caches.open(CACHE_PAGINAS);
      try {
        const r = await fetch(req);
        if (r.ok && !r.redirected && (url.pathname === "/lancar" || url.pathname === "/")) c.put(req, r.clone());
        return r;
      } catch {
        return (await c.match(req)) || (await c.match(PAGINA_OFFLINE)) ||
          new Response("<meta charset=utf-8><p style='font:16px sans-serif;padding:2em'>Sem internet. Abra o app uma vez com internet para usar o lançamento offline.</p>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })());
  }
});
