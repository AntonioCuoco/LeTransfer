// Logica della stanza isolata per Cloudflare Turnstile. Vedi captcha.html.
//
// ⚠️ Sta in un file a parte, NON inline in captcha.html: la CSP di produzione di
// /captcha è `script-src 'self' https://challenges.cloudflare.com`, senza
// 'unsafe-inline', e uno <script> inline verrebbe bloccato (in dev no, perché il
// server Vite manda solo `frame-ancestors` — ed è per questo che in locale "funziona").
// Un hash sha256 nella CSP sarebbe l'alternativa, ma andrebbe rigenerato a ogni
// modifica di una virgola: il file esterno non si rompe.
(function () {
  'use strict';

  // Origini autorizzate a incorporare questa pagina e a ricevere il token.
  //
  // ⚠️ È il gate vero sul token: qualunque origine elencata qui può incorniciare il
  // widget e incassare il risultato della verifica. Si aggiunge solo ciò che è nostro.
  //
  // ⚠️ Le prime due sono di SVILUPPO e vanno tolte nel build di produzione: in dev
  // l'app gira su localhost mentre questa pagina è servita dall'IP della LAN (due
  // origini distinte, che è il punto). In produzione devono restare solo i domini
  // ufficiali. Le varianti `www` ci sono perché per il browser sono origini diverse.
  // Origine unica di produzione: `novren.it` e le varianti `www` fanno 301 verso
  // `novren.net`, quindi il browser arriva qui sempre e solo da quell'origine.
  // Un redirect non è un'origine: dopo il 301 la pagina è servita da novren.net,
  // ed è quello che il browser dichiara come `parent`.
  // Le ultime due sono le origini di STAGING: senza, il widget compare ma il token
  // non esce, e l'invio senza account fallisce appena il captcha e' attivo.
  var ALLOWED_PARENTS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://novren.net',
    'https://novren-staging.pages.dev',
    'https://staging.novren.net'
  ];

  var params = new URLSearchParams(location.search);
  var sitekey = params.get('sitekey') || '';
  var parentOrigin = params.get('parent') || '';

  // Il token esce solo verso un'origine nota: mai postMessage con '*'.
  if (ALLOWED_PARENTS.indexOf(parentOrigin) === -1) {
    document.getElementById('fallback').hidden = false;
    document.getElementById('fallback').textContent = 'Origine non autorizzata.';
    return;
  }

  function send(type, token) {
    parent.postMessage({ source: 'letransfer-captcha', type: type, token: token || null }, parentOrigin);
  }

  function showFallback() {
    document.getElementById('fallback').hidden = false;
    send('error');
  }

  if (!sitekey) { showFallback(); return; }

  window.onTurnstileReady = function () {
    if (!window.turnstile) { showFallback(); return; }
    var id = window.turnstile.render('#widget', {
      sitekey: sitekey,
      callback: function (token) { send('token', token); },
      'error-callback': function () { send('error'); },
      'expired-callback': function () { send('expired'); },
      'timeout-callback': function () { send('error'); }
    });

    // Il token è monouso: il genitore chiede un widget fresco dopo ogni invio.
    window.addEventListener('message', function (event) {
      if (event.origin !== parentOrigin) return;
      if (event.data && event.data.type === 'reset') {
        try { window.turnstile.reset(id); } catch (e) { /* il widget si rigenera al reload */ }
      }
    });
  };

  var script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileReady';
  script.async = true;
  script.defer = true;
  script.onerror = showFallback;
  document.head.appendChild(script);
})();
