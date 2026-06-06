/* live.js — Live-Tab der Livescore-Version: laufende Spiele groß mit Tor-Ticker,
   dazu kompakt „Demnächst heute" und „Heute beendet". Auto-Refresh und
   Tor-Benachrichtigung stecken in app.js; hier wird nur aus dem Store gerendert. */
(function (WM) {
  'use strict';
  var U = WM.util;

  function heading(m) {
    return m.phase === 'group' ? ('Gruppe ' + m.group) : U.roundDe(m.round);
  }

  function teamCol(key, side) {
    var t = WM.teams.info(key);
    return '<span class="lc-team lc-' + side + '">' +
      '<span class="flag big">' + t.flag + '</span>' +
      '<span class="lc-name">' + U.esc(t.name) + '</span></span>';
  }

  // Eine Ticker-Zeile (ein Tor) – analog goalLine in app.js.
  function goalTick(g) {
    var t = WM.teams.info(g.teamKey);
    var tag = g.isPenalty ? ' <i class="gt-tag">(Elfmeter)</i>'
            : g.isOwnGoal ? ' <i class="gt-tag">(Eigentor)</i>' : '';
    return '<li class="tick">' +
      '<span class="tick-min">' + U.esc(g.minute) + "'</span>" +
      '<span class="flag">' + t.flag + '</span>' +
      '<b class="tick-player">' + U.esc(g.player || '–') + '</b>' + tag +
      '</li>';
  }

  function liveCard(m, live, goals) {
    var hg = live.hg != null ? live.hg : '–';
    var ag = live.ag != null ? live.ag : '–';
    var ticker = (goals && goals.length)
      ? '<ul class="ticker">' + goals.map(goalTick).join('') + '</ul>'
      : '<p class="tick-empty">Noch keine Tore.</p>';
    return '<div class="live-card" data-mid="' + m.id + '">' +
      '<div class="lc-top">' +
        '<span class="badge ' + (m.phase === 'group' ? 'grp' : 'ko') + '">' + U.esc(heading(m)) + '</span>' +
        '<span class="lc-live"><span class="lc-dot"></span>LIVE</span>' +
      '</div>' +
      '<div class="lc-main">' +
        teamCol(live.homeKey || m.team1, 'home') +
        '<span class="lc-score">' + hg + '<i>:</i>' + ag + '</span>' +
        teamCol(live.awayKey || m.team2, 'away') +
      '</div>' +
      (m.ground ? '<div class="lc-venue">' + U.esc(m.ground) + '</div>' : '') +
      ticker +
    '</div>';
  }

  // Kompakte Zeile für „Demnächst" (Anstoßzeit) bzw. „Heute beendet" (Endstand).
  function compactRow(m, live, mode) {
    var i1 = WM.teams.info(m.team1), i2 = WM.teams.info(m.team2);
    var mid = (mode === 'finished' && live && live.hg != null && live.ag != null)
      ? '<span class="cr-score">' + live.hg + ':' + live.ag + '</span>'
      : '<span class="cr-time">' + U.time(m.kickoffUtc).replace(' Uhr', '') + '</span>';
    return '<div class="live-row" data-mid="' + m.id + '">' +
      '<span class="cr-team cr-home"><span class="flag">' + i1.flag + '</span>' + U.esc(i1.name) + '</span>' +
      mid +
      '<span class="cr-team cr-away">' + U.esc(i2.name) + '<span class="flag">' + i2.flag + '</span></span>' +
    '</div>';
  }

  function emptyState(all, now) {
    var next = all.filter(function (m) { return new Date(m.kickoffUtc).getTime() > now; })[0];
    var hint = '';
    if (next) {
      var i1 = WM.teams.info(next.team1), i2 = WM.teams.info(next.team2);
      hint = '<div class="le-next">' +
        '<div class="le-next-lbl">Nächstes Spiel</div>' +
        '<div class="le-next-teams">' +
          '<span class="flag">' + i1.flag + '</span>' + U.esc(i1.name) +
          '<span class="le-vs">–</span>' +
          U.esc(i2.name) + '<span class="flag">' + i2.flag + '</span>' +
        '</div>' +
        '<div class="le-next-when">' + U.fullDate(next.kickoffUtc) + ' · ' + U.time(next.kickoffUtc) + '</div>' +
      '</div>';
    }
    return '<div class="live-empty">' +
      '<div class="le-icon">🔴</div>' +
      '<h3>Aktuell läuft kein Spiel</h3>' +
      '<p>Sobald ein WM-Spiel angepfiffen wird, erscheint es hier automatisch – mit Live-Score und Tor-Ticker.</p>' +
      hint +
    '</div>';
  }

  function render(host) {
    var L = WM.store.getLive();
    var byId = L.byMatchId || {};
    var goalsByMatch = L.goalsByMatch || {};
    var todayK = U.todayKey();
    var now = Date.now();

    var all = WM.store.matches().slice().sort(function (a, b) {
      return new Date(a.kickoffUtc) - new Date(b.kickoffUtc);
    });

    var liveMatches = all.filter(function (m) { var b = byId[m.id]; return b && b.live; });
    var upcoming = all.filter(function (m) {
      var b = byId[m.id];
      return U.dayKey(m.kickoffUtc) === todayK &&
        new Date(m.kickoffUtc).getTime() > now &&
        !(b && (b.live || b.finished));
    });
    var finishedToday = all.filter(function (m) {
      var b = byId[m.id];
      return b && b.finished && U.dayKey(m.kickoffUtc) === todayK;
    });

    var html = '';
    if (liveMatches.length) {
      html += '<div class="live-section live-now">' +
        liveMatches.map(function (m) { return liveCard(m, byId[m.id], goalsByMatch[m.id]); }).join('') +
        '</div>';
    } else {
      html += emptyState(all, now);
    }
    if (upcoming.length) {
      html += '<div class="live-section"><h3 class="live-h">Demnächst heute</h3>' +
        upcoming.map(function (m) { return compactRow(m, byId[m.id], 'upcoming'); }).join('') + '</div>';
    }
    if (finishedToday.length) {
      html += '<div class="live-section"><h3 class="live-h">Heute beendet</h3>' +
        finishedToday.map(function (m) { return compactRow(m, byId[m.id], 'finished'); }).join('') + '</div>';
    }

    host.innerHTML = html;

    host.querySelectorAll('[data-mid]').forEach(function (el) {
      el.addEventListener('click', function () {
        WM.app.openMatch(parseInt(el.getAttribute('data-mid'), 10));
      });
    });
  }

  WM.live = { render: render };
})(window.WM = window.WM || {});
