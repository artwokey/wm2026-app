/* settings.js — Datenquelle-Info, Daten aktualisieren, Cache leeren, Status.
   Livescore-Version: zusätzlich Karte „Live & Benachrichtigungen". */
(function (WM) {
  'use strict';
  var U = WM.util;
  var NOTIFY_LS = 'wm:notify';

  function lastUpdate() {
    var ts = (WM.store.getLive().ts) || {};
    if (!ts.matches) return 'noch nie';
    try {
      return new Intl.DateTimeFormat('de-DE', { timeZone: U.TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(ts.matches)) + ' Uhr';
    } catch (e) { return '—'; }
  }

  function notifySupported() { return typeof Notification !== 'undefined'; }
  function notifyOn() { try { return localStorage.getItem(NOTIFY_LS) === '1'; } catch (e) { return false; } }
  function setNotifyOn(v) { try { localStorage.setItem(NOTIFY_LS, v ? '1' : '0'); } catch (e) {} }

  function notifyCard() {
    var statusTxt, btnHtml = '';
    if (!notifySupported()) {
      statusTxt = 'vom Browser nicht unterstützt';
    } else if (Notification.permission === 'denied') {
      statusTxt = 'im Browser/System blockiert';
      btnHtml = '<p class="hint warn">Benachrichtigungen sind blockiert – bitte in den Browser- bzw. App-Einstellungen erlauben.</p>';
    } else if (Notification.permission === 'granted') {
      statusTxt = notifyOn() ? 'aktiv' : 'erlaubt, aber ausgeschaltet';
      btnHtml = '<button id="do-notify" class="btn primary" type="button">' +
        (notifyOn() ? 'Benachrichtigungen ausschalten' : 'Benachrichtigungen einschalten') + '</button>';
    } else {
      statusTxt = 'nicht aktiviert';
      btnHtml = '<button id="do-notify" class="btn primary" type="button">Tor-Benachrichtigungen aktivieren</button>';
    }
    return '<section class="card">' +
        '<h3>Live &amp; Benachrichtigungen</h3>' +
        '<p class="hint">Bei laufenden Spielen aktualisiert sich der Live-Score automatisch (ca. alle 20&nbsp;Sekunden). ' +
        'Kurze Tor-Hinweise (Einblendung) erscheinen immer. Zusätzlich lassen sich System-Benachrichtigungen einschalten.</p>' +
        (btnHtml ? '<div class="row">' + btnHtml + '</div>' : '') +
        '<ul class="kv"><li><span>System-Benachrichtigungen</span><b>' + U.esc(statusTxt) + '</b></li></ul>' +
        '<p class="hint">Hinweis: In der einfachen APK (WebView) sind System-Benachrichtigungen evtl. nicht verfügbar – die Einblendungen funktionieren dort trotzdem.</p>' +
      '</section>';
  }

  function render(host) {
    var live = WM.store.getLive();

    host.innerHTML =
      '<div class="settings">' +
        '<section class="card">' +
          '<h3>Datenquellen</h3>' +
          '<p class="hint"><b>football-data.org</b> – liefert Live-Spielstände, Torschützen und die offiziellen ' +
          'Gruppentabellen; die Weißen Westen werden daraus berechnet. ' +
          '<b>FIFA-API</b> – liefert die Ereignisse pro Spiel: Tore und Platzverweise mit Spielername und Minute. ' +
          'Spielplan, Gruppen und Anstoßzeiten sind fest eingebaut und funktionieren offline.</p>' +
          '<p class="hint">Hinweis: Sind die FIFA-Ereignisse vorübergehend nicht erreichbar, erkennt der Tor-Ticker ' +
          'Tore an Spielstand-Änderungen (Minute geschätzt, mit „~" markiert, ohne Schützenname).</p>' +
        '</section>' +

        notifyCard() +

        '<section class="card">' +
          '<h3>Daten</h3>' +
          '<div class="row">' +
            '<button id="do-refresh" class="btn primary" type="button">Jetzt aktualisieren</button>' +
            '<button id="do-clear" class="btn ghost" type="button">Cache leeren</button>' +
          '</div>' +
          '<ul class="kv">' +
            '<li><span>Status</span><b>' + (live.ok ? 'OK' : (live.error ? U.esc(live.error) : 'keine Daten')) + '</b></li>' +
            '<li><span>Zuletzt aktualisiert</span><b>' + lastUpdate() + '</b></li>' +
            '<li><span>Quellen</span><b>api.football-data.org · api.fifa.com</b></li>' +
          '</ul>' +
        '</section>' +

        '<section class="card">' +
          '<h3>Über</h3>' +
          '<p class="hint">WM 2026 Spielplan &amp; Live · Live-Ticker mit automatisch aktualisiertem Score, Tor-Ticker und ' +
          'Tor-Benachrichtigungen – dazu Spielplan, Anstoßzeiten (deutsche Zeit), alle Gruppentabellen und Statistik. ' +
          'Daten: eingebauter Spielplan (openfootball) + Live von football-data.org und der FIFA-API.</p>' +
          '<p class="hint">Inoffizielle, werbefreie Fan-App. Nicht mit der FIFA oder offiziellen Veranstaltern ' +
          'verbunden. Alle Marken gehören ihren Inhabern.</p>' +
        '</section>' +

        '<section class="card">' +
          '<h3>Rechtliches</h3>' +
          '<p class="hint">Pflichtangaben und Hinweise zum Datenschutz.</p>' +
          '<div class="row">' +
            '<a class="btn ghost" style="text-decoration:none;display:inline-block" href="datenschutz.html">Datenschutz</a>' +
            '<a class="btn ghost" style="text-decoration:none;display:inline-block" href="impressum.html">Impressum</a>' +
          '</div>' +
        '</section>' +
      '</div>';

    host.querySelector('#do-refresh').addEventListener('click', function () { WM.app.refresh(true); });
    host.querySelector('#do-clear').addEventListener('click', function () {
      WM.store.clearCache(); WM.app.toast('Cache geleert.'); WM.app.rerender(); render(host);
    });

    var nb = host.querySelector('#do-notify');
    if (nb) nb.addEventListener('click', function () {
      if (Notification.permission === 'granted') {
        setNotifyOn(!notifyOn());
        WM.app.toast(notifyOn() ? 'Tor-Benachrichtigungen aktiv.' : 'Tor-Benachrichtigungen aus.');
        render(host);
      } else {
        Notification.requestPermission().then(function (p) {
          if (p === 'granted') { setNotifyOn(true); WM.app.toast('Tor-Benachrichtigungen aktiv.'); }
          else { WM.app.toast('Benachrichtigungen nicht erlaubt.'); }
          render(host);
        });
      }
    });
  }

  WM.settings = { render: render };
})(window.WM = window.WM || {});
