/* ============================================================
   EVVO — Service Worker mínimo
   Existe só pra habilitar o botão "Instalar app" dos navegadores
   (Chrome/Edge exigem um service worker ativo com handler de fetch
   pra considerar o site instalável). NÃO faz cache de nada — o Evvo
   depende de dado sempre atualizado (Supabase), cachear resposta
   antiga aqui seria perigoso num sistema financeiro.
   ============================================================ */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Sempre busca da rede, sem cache — só existe pra satisfazer o
  // requisito de instalabilidade do navegador.
  event.respondWith(fetch(event.request));
});
