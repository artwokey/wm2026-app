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

  // Eine Ticker-Zeile (Tor oder Platzverweis) – analog eventLine in app.js.
  function eventTick(e) {
    var t = e.teamKey ? WM.teams.info(e.teamKey) : null;
    var flag = t ? '<span class="flag">' + t.flag + '</span>' : '';
    if (e.type === 'red') {
      return '<li class="tick">' +
        '<span class="tick-min">' + U.esc(e.minute) + "'</span>" + flag +
        '<span class="rcard" title="Platzverweis"></span>' +
        '<b class="tick-player">' + U.esc(e.player || 'Platzverweis') + '</b>' +
        '</li>';
    }
    var tag = e.isPenalty ? ' <i class="gt-tag">(Elfmeter)</i>'
            : e.isOwnGoal ? ' <i class="gt-tag">(Eigentor)</i>' : '';
    var assist = e.assist ? ' <i class="gt-tag">Vorlage: ' + U.esc(e.assist) + '</i>' : '';
    return '<li class="tick">' +
      '<span class="tick-min">' + U.esc(e.minute) + "'</span>" + flag +
      '<span class="tick-ball">⚽</span>' +
      '<b class="tick-player">' + U.esc(e.player || 'Tor') + '</b>' + tag + assist +
      '</li>';
  }

  // Tore + Platzverweise eines Spiels chronologisch zusammenführen.
  function mergeEvents(goals, reds) {
    var ev = (goals || []).map(function (g) {
      return { type: 'goal', minute: g.minute, player: g.player, teamKey: g.teamKey,
               isPenalty: g.isPenalty, isOwnGoal: g.isOwnGoal, assist: g.assist };
    }).concat((reds || []).map(function (r) {
      return { type: 'red', minute: r.minute, player: r.player, teamKey: r.teamKey };
    }));
    ev.sort(function (a, b) { return U.minuteVal(a.minute) - U.minuteVal(b.minute); });
    return ev;
  }

  function liveCard(m, live, goals, reds) {
    var hg = live.hg != null ? live.hg : '–';
    var ag = live.ag != null ? live.ag : '–';
    var clock = U.statusLabel(live.statusShort, live.elapsed);
    var events = mergeEvents(goals, reds);
    // Ohne Protokoll: Tore können vor dem App-Start gefallen sein (kein Verlauf verfügbar).
    var ticker = events.length
      ? '<ul class="ticker">' + events.map(eventTick).join('') + '</ul>'
      : '<p class="tick-empty">' + ((live.hg > 0 || live.ag > 0)
          ? 'Tor-Ticker läuft ab jetzt mit – bisherige Tore ohne Verlauf.'
          : 'Noch keine Tore.') + '</p>';
    return '<div class="live-card" data-mid="' + m.id + '">' +
      '<div class="lc-top">' +
        '<span class="badge ' + (m.phase === 'group' ? 'grp' : 'ko') + '">' + U.esc(heading(m)) + '</span>' +
        '<span class="lc-live"><span class="lc-dot"></span>' + (clock ? U.esc(clock) : 'LIVE') + '</span>' +
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

  // Karte für Spiele kurz vor dem Anstoß („Livemodus" mit Countdown).
  function soonCard(m, now) {
    var mins = Math.max(1, Math.round((new Date(m.kickoffUtc).getTime() - now) / 60000));
    return '<div class="live-card soon-card" data-mid="' + m.id + '">' +
      '<div class="lc-top">' +
        '<span class="badge ' + (m.phase === 'group' ? 'grp' : 'ko') + '">' + U.esc(heading(m)) + '</span>' +
        '<span class="lc-soon">⏱ in ' + mins + ' Min</span>' +
      '</div>' +
      '<div class="lc-main">' +
        teamCol(m.team1, 'home') +
        '<span class="lc-score lc-vs">' + U.time(m.kickoffUtc).replace(' Uhr', '') + '</span>' +
        teamCol(m.team2, 'away') +
      '</div>' +
      (m.ground ? '<div class="lc-venue">' + U.esc(m.ground) + '</div>' : '') +
      '<p class="tick-empty">Spiel beginnt in ' + mins + ' Minute' + (mins === 1 ? '' : 'n') +
        ' – der Live-Ticker startet hier automatisch.</p>' +
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

  // Fenster, ab dem ein anstehendes Spiel als Countdown-Karte erscheint.
  var SOON_MS = 60 * 60 * 1000;

  function render(host) {
    var L = WM.store.getLive();
    var byId = L.byMatchId || {};
    var goalsByMatch = L.goalsByMatch || {};
    var redsByMatch = L.redsByMatch || {};
    var todayK = U.todayKey();
    var now = Date.now();

    var all = WM.store.matches().slice().sort(function (a, b) {
      return new Date(a.kickoffUtc) - new Date(b.kickoffUtc);
    });

    var liveMatches = all.filter(function (m) { var b = byId[m.id]; return b && b.live; });
    var soon = all.filter(function (m) {
      var b = byId[m.id];
      var diff = new Date(m.kickoffUtc).getTime() - now;
      return diff > 0 && diff <= SOON_MS && !(b && (b.live || b.finished));
    });
    var upcoming = all.filter(function (m) {
      var b = byId[m.id];
      return U.dayKey(m.kickoffUtc) === todayK &&
        new Date(m.kickoffUtc).getTime() > now + SOON_MS &&
        !(b && (b.live || b.finished));
    });
    var finishedToday = all.filter(function (m) {
      var b = byId[m.id];
      return b && b.finished && U.dayKey(m.kickoffUtc) === todayK;
    });

    var html = '';
    if (liveMatches.length || soon.length) {
      html += '<div class="live-section live-now">' +
        liveMatches.map(function (m) { return liveCard(m, byId[m.id], goalsByMatch[m.id], redsByMatch[m.id]); }).join('') +
        soon.map(function (m) { return soonCard(m, now); }).join('') +
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
