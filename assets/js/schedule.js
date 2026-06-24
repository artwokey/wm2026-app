/* schedule.js — Spielplan: alle Spiele nach Tag, Anstoß in deutscher Zeit,
   Filter (Gruppe/Phase, Team), Live-Score-Overlay, „Heute“-Markierung. */
(function (WM) {
  'use strict';
  var U = WM.util;
  var filterScope = 'all';   // 'all' | 'A'..'L' | 'ko'
  var filterTeam  = 'all';   // canonical key | 'all'
  var decided = {};          // Slot-Token ('1A'/'2B'…) -> echter Team-Key (aus decidedSlots())

  // realKey: sobald football-data die Gruppenposition/KO-Begegnung aufgelöst
  // hat (live.homeKey/awayKey), den echten Team-Key statt des Platzhalters
  // ("1A", "W49" …) anzeigen.
  function teamChip(name, side, redCount, realKey) {
    var t = WM.teams.info(realKey || name);
    var marks = '';
    for (var i = 0; i < (redCount || 0); i++) marks += '<span class="rcard"></span>';
    if (marks) marks = '<span class="rcards" title="Platzverweis">' + marks + '</span>';
    return '<span class="team team-' + side + '">' +
      '<span class="flag">' + t.flag + '</span>' +
      '<span class="tname">' + U.esc(t.name) + marks + '</span></span>';
  }

  function badge(m) {
    if (m.phase === 'group') return '<span class="badge grp">Gr. ' + m.group + '</span>';
    return '<span class="badge ko">' + U.esc(U.roundDe(m.round)) + '</span>';
  }

  function centerCell(m, live) {
    if (live && (live.finished || live.live) && live.hg != null && live.ag != null) {
      var cls = live.live ? 'score live' : 'score';
      return '<span class="' + cls + '">' + live.hg + '<i>:</i>' + live.ag + '</span>';
    }
    return '<span class="ko-time">' + U.time(m.kickoffUtc).replace(' Uhr', '') + '</span>';
  }

  function statusCell(m, live) {
    if (live) {
      var lbl = U.statusLabel(live.statusShort, live.elapsed);
      if (lbl) return '<span class="mstatus ' + (live.live ? 'is-live' : '') + '">' + U.esc(lbl) + '</span>';
    }
    return '<span class="mstatus">' + U.dayHeader(m.kickoffUtc) + '</span>';
  }

  // Platzverweise je Seite zählen (für die roten Karten-Symbole am Teamnamen).
  function redCounts(m, live, reds) {
    var out = { home: 0, away: 0 };
    if (!reds || !reds.length) return out;
    var hk = (live && live.homeKey) || WM.teams.canonical(m.team1);
    var ak = (live && live.awayKey) || WM.teams.canonical(m.team2);
    reds.forEach(function (r) {
      if (r.teamKey === hk) out.home++;
      else if (r.teamKey === ak) out.away++;
    });
    return out;
  }

  function matchRow(m, live, todayK, reds) {
    var isToday = U.dayKey(m.kickoffUtc) === todayK;
    var cls = 'match' + (live && live.live ? ' is-live' : '') + (isToday ? ' is-today' : '');
    var rc = redCounts(m, live, reds);
    // Echtes Team zeigen, sobald die Live-Paarung steht ODER der Gruppenplatz
    // rechnerisch entschieden ist (gleiche Logik wie im K.-o.-Baum).
    var rkHome = (live && live.homeKey) || decided[m.team1];
    var rkAway = (live && live.awayKey) || decided[m.team2];
    return '<div class="' + cls + '" data-mid="' + m.id + '">' +
      '<div class="m-top">' + badge(m) + statusCell(m, live) + '</div>' +
      '<div class="m-main">' +
        teamChip(m.team1, 'home', rc.home, rkHome) +
        centerCell(m, live) +
        teamChip(m.team2, 'away', rc.away, rkAway) +
      '</div></div>';
  }

  function applyFilters(list) {
    return list.filter(function (m) {
      if (filterScope === 'ko' && m.phase !== 'ko') return false;
      if (/^[A-L]$/.test(filterScope) && !(m.phase === 'group' && m.group === filterScope)) return false;
      if (filterTeam !== 'all') {
        var t1 = WM.teams.canonical(m.team1), t2 = WM.teams.canonical(m.team2);
        if (t1 !== filterTeam && t2 !== filterTeam) return false;
      }
      return true;
    });
  }

  function buildFilterBar() {
    var groups = WM.store.GROUP_LETTERS.map(function (g) {
      return '<option value="' + g + '"' + (filterScope === g ? ' selected' : '') + '>Gruppe ' + g + '</option>';
    }).join('');
    var teamKeys = Object.keys(WM.teams.META).sort(function (a, b) {
      return WM.teams.META[a].de.localeCompare(WM.teams.META[b].de, 'de');
    });
    var teamOpts = '<option value="all">Alle Teams</option>' + teamKeys.map(function (k) {
      return '<option value="' + k + '"' + (filterTeam === k ? ' selected' : '') + '>' +
        U.esc(WM.teams.META[k].de) + '</option>';
    }).join('');

    return '<div class="filterbar">' +
      '<select id="f-scope" aria-label="Phase/Gruppe">' +
        '<option value="all"' + (filterScope === 'all' ? ' selected' : '') + '>Alle Spiele</option>' +
        groups +
        '<option value="ko"' + (filterScope === 'ko' ? ' selected' : '') + '>K.-o.-Runden</option>' +
      '</select>' +
      '<select id="f-team" aria-label="Team">' + teamOpts + '</select>' +
      '<button id="f-today" class="btn-mini" type="button">Heute</button>' +
    '</div>';
  }

  function render(host) {
    var live = WM.store.getLive();
    decided = (WM.standings && WM.standings.decidedSlots) ? WM.standings.decidedSlots() : {};
    var byId = live.byMatchId || {};
    var redsBy = live.redsByMatch || {};
    var todayK = U.todayKey();

    var list = applyFilters(WM.store.matches().slice().sort(function (a, b) {
      return new Date(a.kickoffUtc) - new Date(b.kickoffUtc);
    }));

    var html = buildFilterBar();
    if (!list.length) {
      html += '<p class="empty">Keine Spiele für diese Auswahl.</p>';
    } else {
      var curDay = null;
      list.forEach(function (m) {
        var dk = U.dayKey(m.kickoffUtc);
        if (dk !== curDay) {
          curDay = dk;
          var todayTag = (dk === todayK) ? ' <span class="today-tag">HEUTE</span>' : '';
          html += '<h3 class="day-h" id="day-' + dk + '">' + U.fullDate(m.kickoffUtc) + todayTag + '</h3>';
        }
        html += matchRow(m, byId[m.id], todayK, redsBy[m.id]);
      });
    }
    host.innerHTML = html;

    host.querySelector('#f-scope').addEventListener('change', function (e) { filterScope = e.target.value; render(host); });
    host.querySelector('#f-team').addEventListener('change', function (e) { filterTeam = e.target.value; render(host); });
    host.querySelector('#f-today').addEventListener('click', function () {
      var elDay = host.querySelector('#day-' + todayK);
      if (elDay) { elDay.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      // Kein Spiel heute -> zum nächsten anstehenden Spieltag springen.
      var now = Date.now();
      var next = list.filter(function (m) { return new Date(m.kickoffUtc).getTime() >= now; })[0];
      if (next) {
        var nd = host.querySelector('#day-' + U.dayKey(next.kickoffUtc));
        if (nd) { nd.scrollIntoView({ behavior: 'smooth', block: 'start' }); WM.app.toast('Heute kein Spiel – springe zum nächsten Spieltag.'); return; }
      }
      WM.app.toast('Keine anstehenden Spiele.');
    });

    // Tippen auf ein Spiel -> Detail (Torschützen, falls vorhanden).
    host.querySelectorAll('.match').forEach(function (row) {
      row.addEventListener('click', function () { WM.app.openMatch(parseInt(row.getAttribute('data-mid'), 10)); });
    });
  }

  WM.schedule = { render: render };
})(window.WM = window.WM || {});
