/* app.js — App-Schale: Navigation, Service-Worker, Refresh, Match-Detail, Toasts. */
(function (WM) {
  'use strict';
  var U = WM.util;
  var current = 'live';
  var refreshing = false;

  var TABS = {
    live:        { label: 'Live',       icon: '🔴', render: function (h) { WM.live.render(h); } },
    spielplan:   { label: 'Spielplan',  icon: '📅', render: function (h) { WM.schedule.render(h); } },
    tabellen:    { label: 'Tabellen',   icon: '📊', render: function (h) { WM.standings.render(h); } },
    statistik:   { label: 'Statistik',  icon: '⚽', render: function (h) { WM.stats.render(h); } },
    ko:          { label: 'K.-o.',      icon: '🏆', render: function (h) { WM.knockout.render(h); } },
    einstellungen:{ label: 'Mehr',      icon: '⚙️', render: function (h) { WM.settings.render(h); } }
  };

  function $(sel) { return document.querySelector(sel); }
  function view() { return $('#view'); }

  function buildNav() {
    var nav = $('#nav');
    nav.innerHTML = Object.keys(TABS).map(function (k) {
      return '<button class="nav-btn" data-tab="' + k + '">' +
        '<span class="nav-ico">' + TABS[k].icon + '</span>' +
        '<span class="nav-lbl">' + TABS[k].label + '</span></button>';
    }).join('');
    nav.querySelectorAll('.nav-btn').forEach(function (b) {
      b.addEventListener('click', function () { go(b.getAttribute('data-tab')); });
    });
  }

  function go(tab) {
    current = tab;
    $('#nav').querySelectorAll('.nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });
    $('#title').textContent = TABS[tab].label;
    view().scrollTop = 0;
    rerender();
  }

  function rerender() {
    try { TABS[current].render(view()); }
    catch (e) { view().innerHTML = '<p class="empty">Fehler beim Anzeigen: ' + U.esc(e.message) + '</p>'; }
  }

  function setBusy(b) {
    refreshing = b;
    var btn = $('#refresh-btn');
    if (btn) btn.classList.toggle('spin', b);
  }

  function updateStatusDot() {
    var live = WM.store.getLive();
    var dot = $('#live-dot');
    if (!dot) return;
    var anyLive = Object.keys(live.byMatchId || {}).some(function (id) { return live.byMatchId[id].live; });
    dot.className = 'live-dot ' + (anyLive ? 'on' : (live.ok ? 'ok' : 'off'));
    dot.title = anyLive ? 'Live-Spiele laufen' : (live.ok ? 'Daten aktuell' : 'keine Live-Daten');
  }

  function refresh(force) {
    if (refreshing) return Promise.resolve();
    setBusy(true);
    return WM.api.refreshAll(force).then(function (live) {
      setBusy(false);
      diffAndNotifyGoals();
      updateStatusDot();
      rerender();
      if (live.error) toast(live.error);
    }).catch(function (e) {
      setBusy(false);
      toast('Aktualisierung fehlgeschlagen: ' + (e && e.message ? e.message : e));
    });
  }

  // ---- Match-Detail-Dialog ---------------------------------------------------

  // Eine Zeile im Spielverlauf des Match-Detail-Dialogs (Tor oder Platzverweis).
  function eventLine(g) {
    var t = g.team ? WM.teams.info(g.team) : null;
    var flag = t ? '<span class="flag">' + t.flag + '</span> ' : '';
    if (g.type === 'red') {
      return '<li><span class="min">' + U.esc(g.minute) + "'</span> " + flag +
        '<span class="rcard" title="Platzverweis"></span> <b>' + U.esc(g.player || 'Platzverweis') + '</b></li>';
    }
    var tag = g.detail === 'Penalty' ? ' (Elfmeter)' : g.detail === 'Own Goal' ? ' (Eigentor)' : '';
    var assist = g.assist ? ' <span class="assist">Vorlage: ' + U.esc(g.assist) + '</span>' : '';
    return '<li><span class="min">' + U.esc(g.minute) + "'</span> " + flag +
      '<span class="tick-ball">⚽</span> <b>' + U.esc(g.player || 'Tor') + '</b>' + tag + assist + '</li>';
  }

  function openMatch(id) {
    var m = WM.store.matches().filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    var live = (WM.store.getLive().byMatchId || {})[id];
    var info1 = WM.teams.info(live && live.homeKey ? live.homeKey : m.team1);
    var info2 = WM.teams.info(live && live.awayKey ? live.awayKey : m.team2);
    var heading = m.phase === 'group' ? ('Gruppe ' + m.group) : U.roundDe(m.round);
    var score = (live && live.hg != null && live.ag != null) ? (live.hg + ' : ' + live.ag) : '–';
    var status = live ? U.statusLabel(live.statusShort, live.elapsed) : '';
    var localIso = (WM.store.getLive().localKickoff || {})[id];
    var localStr = localIso ? U.localTime(localIso) : '';
    var ortszeit = (localStr && localStr !== U.time(m.kickoffUtc)) ? ('<br>' + localStr + ' (Ortszeit)') : '';

    var overlay = U.el('<div class="modal-bg"></div>');
    overlay.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true">' +
        '<button class="modal-x" aria-label="Schließen">×</button>' +
        '<div class="modal-body">' +
          '<div class="modal-meta">' + U.esc(heading) + ' · ' + U.esc(m.ground || '') + '</div>' +
          '<div class="modal-when">' + U.fullDate(m.kickoffUtc) + '<br>' + U.time(m.kickoffUtc) + ' (dt. Zeit)' + ortszeit + '</div>' +
          '<div class="modal-score">' +
            '<span class="ms-team"><span class="flag big">' + info1.flag + '</span>' + U.esc(info1.name) + '</span>' +
            '<span class="ms-val">' + U.esc(score) + (status ? '<small>' + U.esc(status) + '</small>' : '') + '</span>' +
            '<span class="ms-team"><span class="flag big">' + info2.flag + '</span>' + U.esc(info2.name) + '</span>' +
          '</div>' +
          '<div class="modal-goals" id="modal-goals"></div>' +
        '</div>' +
      '</div>';

    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('.modal-x').addEventListener('click', close);
    document.body.appendChild(overlay);

    var goalsEl = overlay.querySelector('#modal-goals');
    if (live && (live.finished || live.live)) {
      WM.api.fetchEvents(id).then(function (events) {
        if (events.length) goalsEl.innerHTML = '<h4>Spielverlauf</h4><ul class="goals">' + events.map(eventLine).join('') + '</ul>';
      });
    }
  }

  // ---- Toast -----------------------------------------------------------------
  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3500);
  }

  // ---- Auto-Refresh (adaptives Polling) --------------------------------------
  var LIVE_INTERVAL = 20 * 1000;    // bei laufenden Spielen
  var SOON_INTERVAL = 60 * 1000;    // < 1 h vor Anstoß: Countdown aktualisieren, Anpfiff schnell erkennen
  var IDLE_INTERVAL = 120 * 1000;   // sonst – fängt Anpfiff / neue Live-Spiele
  var pollTimer = null;

  function anyLive() {
    var byId = WM.store.getLive().byMatchId || {};
    return Object.keys(byId).some(function (id) { return byId[id].live; });
  }

  function anySoon() {
    var now = Date.now();
    return WM.store.matches().some(function (m) {
      var diff = new Date(m.kickoffUtc).getTime() - now;
      return diff > 0 && diff <= 60 * 60 * 1000;
    });
  }

  function scheduleNext() {
    clearTimeout(pollTimer);
    if (document.hidden) return;     // im Hintergrund pausieren
    var delay = anyLive() ? LIVE_INTERVAL : anySoon() ? SOON_INTERVAL : IDLE_INTERVAL;
    pollTimer = setTimeout(function () {
      // bei Live-Spielen force=true, um die 55-s-TTL in api.js zu umgehen.
      refresh(anyLive()).then(scheduleNext, scheduleNext);
    }, delay);
  }

  function startPolling() { scheduleNext(); }

  // ---- Tor-Benachrichtigung --------------------------------------------------
  var NOTIFY_LS = 'wm:notify';
  var knownGoalKeys = null;          // null = Baseline noch nicht gesetzt

  function notifyEnabled() {
    try { return localStorage.getItem(NOTIFY_LS) === '1'; } catch (e) { return false; }
  }
  // Schlüssel = Spiel + Team + laufende Tornummer des Teams. Bleibt stabil,
  // wenn das geschätzte Protokoll (goalLog) später durch FIFA-Ereignisse mit
  // echter Minute und Namen ersetzt wird — sonst gäbe es doppelte Hinweise.
  function goalKeysFor(id, goals) {
    var perTeam = {};
    return goals.map(function (g) {
      var n = perTeam[g.teamKey] = (perTeam[g.teamKey] || 0) + 1;
      return id + '|' + g.teamKey + '|' + n;
    });
  }

  function announceGoal(id, g) {
    var live = WM.store.getLive();
    var b = (live.byMatchId || {})[id] || {};
    var m = WM.store.matches().filter(function (x) { return x.id === id; })[0] || {};
    var i1 = WM.teams.info(b.homeKey || m.team1);
    var i2 = WM.teams.info(b.awayKey || m.team2);
    var scorer = WM.teams.info(g.teamKey);
    var score = (b.hg != null && b.ag != null) ? (b.hg + ':' + b.ag) : '';
    var head = '⚽ TOR – ' + i1.name + ' ' + score + ' ' + i2.name;
    var body = g.minute + "' " + (g.player || 'Tor') + ' (' + scorer.name + ')' +
               (g.isPenalty ? ' – Elfmeter' : g.isOwnGoal ? ' – Eigentor' : '');
    toast(head + ' · ' + body);
    if (notifyEnabled() && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification(head, { body: body, tag: 'wm-goal-' + id, icon: 'assets/icons/icon-192.png' }); }
      catch (e) {}
    }
  }

  // Neue Tore gegenüber der Baseline finden; nur für laufende Spiele melden.
  function diffAndNotifyGoals() {
    var live = WM.store.getLive();
    var gbm = live.goalsByMatch || {};
    var byId = live.byMatchId || {};
    if (knownGoalKeys === null) {            // erster Aufruf: nur Baseline, kein Hinweis
      knownGoalKeys = {};
      Object.keys(gbm).forEach(function (id) {
        goalKeysFor(id, gbm[id]).forEach(function (k) { knownGoalKeys[k] = 1; });
      });
      return;
    }
    Object.keys(gbm).forEach(function (id) {
      var isLive = !!(byId[id] && byId[id].live);
      var keys = goalKeysFor(id, gbm[id]);
      gbm[id].forEach(function (g, i) {
        var k = keys[i];
        if (knownGoalKeys[k]) return;
        knownGoalKeys[k] = 1;
        if (isLive) announceGoal(id, g);
      });
    });
  }

  // ---- Init ------------------------------------------------------------------

  function registerSW() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('service-worker.js').catch(function () {});
      });
    }
  }

  function init() {
    buildNav();
    $('#refresh-btn').addEventListener('click', function () { refresh(true); });
    go('live');

    WM.store.loadTournament().then(function () {
      // Eingebauten Cache sofort einspielen (Offline-Anzeige), dann live aktualisieren.
      WM.api.refreshAll(false).then(function () {
        diffAndNotifyGoals();   // Baseline der bereits gefallenen Tore setzen (kein Hinweis)
        updateStatusDot();
        rerender();
        startPolling();         // adaptives Auto-Refresh starten
      });
      rerender();
    }).catch(function (e) {
      view().innerHTML = '<p class="empty">Konnte Turnierdaten nicht laden: ' + U.esc(e.message) + '</p>';
    });

    // Im Hintergrund Polling pausieren, beim Zurückkehren sofort auffrischen.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') refresh(false).then(scheduleNext, scheduleNext);
      else clearTimeout(pollTimer);
    });

    registerSW();
  }

  WM.app = { go: go, refresh: refresh, rerender: rerender, openMatch: openMatch, toast: toast };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.WM = window.WM || {});
