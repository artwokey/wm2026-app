/* knockout.js — K.-o.-Baum von Sechzehntelfinale bis Finale.
   Die feste Zuteilung ist hinterlegt: R32 über Gruppenplätze (Sieger Gr. A …),
   spätere Runden über Sieger/Verlierer früherer Spiele (W##/L##) – diese werden
   als „Sieger Spiel ##“ angezeigt und über die FIFA-Spielnummer (ID 73–104)
   eindeutig zugeordnet. Die Spiele jeder Runde stehen in BRACKET-Reihenfolge
   (zusammengehörige Paarungen untereinander), nicht nach Anstoßzeit – so ist der
   vorgegebene Weg ins Finale direkt ablesbar. Echte Mannschaften ersetzen die
   Platzhalter, sobald die Paarungen via Live-Daten (oder lokal) feststehen. */
(function (WM) {
  'use strict';
  var U = WM.util;

  var ORDER = ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Match for third place', 'Final'];
  // Hauptrunden (ohne Spiel um Platz 3) für die rekursive Bracket-Sortierung.
  var MAIN = ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Final'];

  var koById = {};    // matchId -> match
  var decided = {};   // '1X'/'2X' -> echter Team-Schlüssel (lokal entschieden)

  function buildMeta() {
    koById = {};
    WM.store.koMatches().forEach(function (m) { koById[m.id] = m; });
  }

  // Match-IDs je Runde in Bracket-Reihenfolge: zusammengehörige Paarungen stehen
  // untereinander. Rekursiv aus den W##-Verweisen der jeweils nächsten Runde
  // abgeleitet (Final -> Halbfinale -> … -> Sechzehntelfinale).
  function bracketOrder() {
    function feederId(tok) { var m = /^W(\d+)$/.exec(tok || ''); return m ? parseInt(m[1], 10) : null; }
    var ord = {};
    ord['Final'] = WM.store.koMatches().filter(function (m) { return m.round === 'Final'; })
      .map(function (m) { return m.id; }).sort(function (a, b) { return a - b; });
    for (var i = MAIN.length - 2; i >= 0; i--) {
      var round = MAIN[i], ids = [];
      (ord[MAIN[i + 1]] || []).forEach(function (mid) {
        var m = koById[mid];
        if (!m) return;
        [m.team1, m.team2].forEach(function (tok) {
          var fid = feederId(tok);
          if (fid != null && koById[fid] && koById[fid].round === round && ids.indexOf(fid) === -1) ids.push(fid);
        });
      });
      ord[round] = ids;
    }
    ord['Match for third place'] = WM.store.koMatches()
      .filter(function (m) { return m.round === 'Match for third place'; }).map(function (m) { return m.id; });
    return ord;
  }

  // Platzhalter -> lesbares deutsches Label. Sieger/Verlierer über die Spielnummer
  // (eindeutig, weil jede K.-o.-Partie ihre Nummer „Spiel ##“ trägt).
  function resolveSlot(token) {
    var mw = /^W(\d+)$/.exec(token), ml = /^L(\d+)$/.exec(token);
    if (mw) return 'Sieger Spiel ' + mw[1];
    if (ml) return 'Verlierer Spiel ' + ml[1];
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
      '<div class="ko-when"><span class="ko-no">Spiel ' + m.id + '</span> · ' +
        U.dayHeader(m.kickoffUtc) + ' · ' + U.time(m.kickoffUtc).replace(' Uhr', '') + '</div>' +
      '<div class="ko-row">' + teamSide(m, 'home', live) + scoreBox(m, live) + teamSide(m, 'away', live) + '</div>' +
    '</div>';
  }

  function render(host) {
    buildMeta();
    decided = (WM.standings && WM.standings.decidedSlots) ? WM.standings.decidedSlots() : {};
    var byId = WM.store.getLive().byMatchId || {};
    var ord = bracketOrder();
    var byRound = {};
    WM.store.koMatches().forEach(function (m) { (byRound[m.round] = byRound[m.round] || []).push(m); });

    var html = '';
    ORDER.forEach(function (round) {
      var list = byRound[round];
      if (!list || !list.length) return;
      // Bracket-Reihenfolge; Fallback (falls unvollständig): nach Spielnummer.
      var seq = (ord[round] && ord[round].length === list.length)
        ? ord[round]
        : list.map(function (m) { return m.id; }).sort(function (a, b) { return a - b; });
      var ordered = seq.map(function (id) { return koById[id]; }).filter(Boolean);
      html += '<div class="ko-round"><h3 class="ko-round-h">' + U.esc(U.roundDe(round)) + '</h3>' +
        ordered.map(function (m) { return card(m, byId[m.id]); }).join('') + '</div>';
    });

    host.innerHTML = '<div class="ko-wrap">' + (html || '<p class="empty">Keine K.-o.-Spiele gefunden.</p>') + '</div>';
    host.querySelectorAll('.ko-match').forEach(function (row) {
      row.addEventListener('click', function () { WM.app.openMatch(parseInt(row.getAttribute('data-mid'), 10)); });
    });
  }

  WM.knockout = { render: render };
})(window.WM = window.WM || {});
