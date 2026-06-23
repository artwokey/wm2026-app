/* knockout.js — K.-o.-Baum von Sechzehntelfinale bis Finale.
   Die feste Zuteilung ist hinterlegt: R32 über Gruppenplätze (Sieger Gr. A …),
   spätere Runden über Sieger/Verlierer früherer Spiele (W##/L##) – diese werden in
   lesbare Labels aufgelöst (z. B. „Sieger Achtelfinale 1“). Echte Mannschaften
   ersetzen die Platzhalter, sobald die Paarungen via Live-Daten feststehen. */
(function (WM) {
  'use strict';
  var U = WM.util;

  var ORDER = ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Match for third place', 'Final'];
  var ROUND_SHORT = {
    'Round of 32': 'Sechzehntelfinale',
    'Round of 16': 'Achtelfinale',
    'Quarter-final': 'Viertelfinale',
    'Semi-final': 'Halbfinale'
  };
  // Kompakte Kürzel für K.-o.-Platzhalter (z. B. "Sieger AF 1") — die ausgeschriebenen
  // Runden-Namen sind auf schmalen Handy-Displays zu lang und überlagern sich.
  var ROUND_TAG = {
    'Round of 32': 'S16',
    'Round of 16': 'AF',
    'Quarter-final': 'VF',
    'Semi-final': 'HF'
  };

  var koIndex = {};   // matchId -> 1-basierter Index innerhalb seiner Runde
  var koById = {};    // matchId -> match
  var decided = {};   // '1X'/'2X' -> echter Team-Schlüssel (lokal entschieden)

  function buildMeta() {
    koIndex = {}; koById = {};
    var byRound = {};
    WM.store.koMatches().forEach(function (m) {
      koById[m.id] = m;
      (byRound[m.round] = byRound[m.round] || []).push(m);
    });
    Object.keys(byRound).forEach(function (r) {
      byRound[r].sort(function (a, b) { return a.id - b.id; })
        .forEach(function (m, i) { koIndex[m.id] = i + 1; });
    });
  }

  // Platzhalter -> lesbares deutsches Label.
  function resolveSlot(token) {
    var mw = /^W(\d+)$/.exec(token), ml = /^L(\d+)$/.exec(token);
    if (mw || ml) {
      var id = parseInt((mw || ml)[1], 10);
      var ref = koById[id];
      if (ref) {
        var lbl = (ROUND_TAG[ref.round] || ROUND_SHORT[ref.round] || ref.round) + ' ' + (koIndex[id] || '');
        return (mw ? 'Sieger ' : 'Verlierer ') + lbl.trim();
      }
    }
    return WM.teams.placeholderLabel(token);   // Gruppenplätze: Sieger Gr. A, 3. Gr. …
  }

  function teamSide(m, side, live) {
    var token = side === 'home' ? m.team1 : m.team2;
    var realKey = live ? (side === 'home' ? live.homeKey : live.awayKey) : null;
    // Steht die offizielle Live-Paarung noch nicht, aber der Gruppenplatz ist
    // lokal schon entschieden (Sieger/Zweiter), echtes Team statt Platzhalter zeigen.
    if (!realKey && decided[token]) realKey = decided[token];
    if (realKey) {
      var t = WM.teams.info(realKey);
      return '<span class="ko-team"><span class="flag">' + t.flag + '</span>' + U.esc(t.name) + '</span>';
    }
    return '<span class="ko-team placeholder">' +
      '<span class="flag"><span class="flag-ph">🏳</span></span>' + U.esc(resolveSlot(token)) + '</span>';
  }

  function scoreBox(m, live) {
    if (live && (live.finished || live.live) && live.hg != null && live.ag != null) {
      return '<span class="ko-score">' + live.hg + ':' + live.ag + '</span>';
    }
    return '<span class="ko-kick">' + U.time(m.kickoffUtc).replace(' Uhr', '') + '</span>';
  }

  function card(m, live) {
    return '<div class="ko-match" data-mid="' + m.id + '">' +
      '<div class="ko-when">' + U.dayHeader(m.kickoffUtc) + ' · ' + U.time(m.kickoffUtc).replace(' Uhr', '') + '</div>' +
      '<div class="ko-row">' + teamSide(m, 'home', live) + scoreBox(m, live) + teamSide(m, 'away', live) + '</div>' +
    '</div>';
  }

  function render(host) {
    buildMeta();
    decided = (WM.standings && WM.standings.decidedSlots) ? WM.standings.decidedSlots() : {};
    var byId = WM.store.getLive().byMatchId || {};
    var byRound = {};
    WM.store.koMatches().forEach(function (m) { (byRound[m.round] = byRound[m.round] || []).push(m); });

    var html = '';
    ORDER.forEach(function (round) {
      var list = byRound[round];
      if (!list || !list.length) return;
      list.sort(function (a, b) { return new Date(a.kickoffUtc) - new Date(b.kickoffUtc); });
      html += '<div class="ko-round"><h3 class="ko-round-h">' + U.esc(U.roundDe(round)) + '</h3>' +
        list.map(function (m) { return card(m, byId[m.id]); }).join('') + '</div>';
    });

    host.innerHTML = '<div class="ko-wrap">' + (html || '<p class="empty">Keine K.-o.-Spiele gefunden.</p>') + '</div>';
    host.querySelectorAll('.ko-match').forEach(function (row) {
      row.addEventListener('click', function () { WM.app.openMatch(parseInt(row.getAttribute('data-mid'), 10)); });
    });
  }

  WM.knockout = { render: render };
})(window.WM = window.WM || {});
