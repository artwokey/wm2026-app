/* standings.js — Tabellen aller 12 Gruppen.
   Quelle: API-Standings; Fallback: Berechnung aus eingebauten Spielen + Live-Ergebnissen.
   Sortierung: Punkte -> Tordifferenz -> erzielte Tore -> Name.
   Markierung: Top 2 (sicher), 8 beste Gruppendritte (qualifiziert) für Sechzehntelfinale. */
(function (WM) {
  'use strict';
  var U = WM.util;

  function emptyRow(teamKey) {
    return { teamKey: teamKey, played: 0, win: 0, draw: 0, lose: 0, gf: 0, ga: 0, gd: 0, points: 0 };
  }

  function sortRows(rows) {
    return rows.slice().sort(function (a, b) {
      return (b.points - a.points) || (b.gd - a.gd) || (b.gf - a.gf) ||
        WM.teams.info(a.teamKey).name.localeCompare(WM.teams.info(b.teamKey).name, 'de');
    });
  }

  function computeFromBundled() {
    var groups = WM.store.groups();
    var byId = (WM.store.getLive().byMatchId) || {};
    return WM.store.GROUP_LETTERS.map(function (g) {
      var rowMap = {};
      (groups[g] || []).forEach(function (tk) { rowMap[tk] = emptyRow(tk); });
      WM.store.groupMatches(g).forEach(function (m) {
        var live = byId[m.id];
        if (!live || !live.finished || live.hg == null || live.ag == null) return;
        var a = rowMap[WM.teams.canonical(m.team1)], b = rowMap[WM.teams.canonical(m.team2)];
        if (!a || !b) return;
        a.played++; b.played++;
        a.gf += live.hg; a.ga += live.ag; b.gf += live.ag; b.ga += live.hg;
        a.gd = a.gf - a.ga; b.gd = b.gf - b.ga;
        if (live.hg > live.ag) { a.win++; a.points += 3; b.lose++; }
        else if (live.hg < live.ag) { b.win++; b.points += 3; a.lose++; }
        else { a.draw++; b.draw++; a.points++; b.points++; }
      });
      return { group: g, rows: sortRows(Object.keys(rowMap).map(function (k) { return rowMap[k]; })) };
    });
  }

  function getTables() {
    var live = WM.store.getLive();
    if (live.standings && live.standings.length) {
      // API liefert bereits offizielle Reihenfolge; Lücken mit eingebauten Teams auffüllen.
      var map = {};
      live.standings.forEach(function (t) { map[t.group] = t.rows; });
      return WM.store.GROUP_LETTERS.map(function (g) {
        return { group: g, rows: (map[g] && map[g].length) ? map[g] : computeGroup(g) };
      });
    }
    return computeFromBundled();
  }

  function computeGroup(g) {
    return computeFromBundled().filter(function (t) { return t.group === g; })[0].rows;
  }

  // 8 beste Gruppendritte bestimmen.
  function bestThirds(tables) {
    var thirds = tables.map(function (t) { return { g: t.group, r: t.rows[2] }; })
      .filter(function (x) { return x.r; });
    thirds.sort(function (a, b) {
      return (b.r.points - a.r.points) || (b.r.gd - a.r.gd) || (b.r.gf - a.r.gf);
    });
    var qual = {};
    thirds.slice(0, 8).forEach(function (x) { qual[x.g] = true; });
    // nur markieren, wenn überhaupt Spiele gespielt wurden
    var anyPlayed = thirds.some(function (x) { return x.r.played > 0; });
    return anyPlayed ? qual : {};
  }

  function teamCell(teamKey) {
    var t = WM.teams.info(teamKey);
    return '<span class="t-cell"><span class="flag">' + t.flag + '</span>' +
      '<span class="tname">' + U.esc(t.name) + '</span></span>';
  }

  function tableHtml(t, thirdQual) {
    var rows = t.rows.map(function (r, i) {
      var rank = i + 1;
      var qcls = '';
      if (rank <= 2) qcls = 'q-top';
      else if (rank === 3 && thirdQual[t.group]) qcls = 'q-third';
      var gd = (r.gd > 0 ? '+' : '') + r.gd;
      return '<tr class="' + qcls + '">' +
        '<td class="r">' + rank + '</td>' +
        '<td class="team">' + teamCell(r.teamKey) + '</td>' +
        '<td>' + r.played + '</td>' +
        '<td class="hide-s">' + r.win + '</td>' +
        '<td class="hide-s">' + r.draw + '</td>' +
        '<td class="hide-s">' + r.lose + '</td>' +
        '<td class="hide-s">' + r.gf + ':' + r.ga + '</td>' +
        '<td>' + gd + '</td>' +
        '<td class="pts">' + r.points + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="group-card">' +
      '<h3 class="group-h">Gruppe ' + t.group + '</h3>' +
      '<table class="stand"><thead><tr>' +
        '<th class="r">#</th><th class="team">Team</th><th>Sp</th>' +
        '<th class="hide-s">S</th><th class="hide-s">U</th><th class="hide-s">N</th>' +
        '<th class="hide-s">Tore</th><th>Diff</th><th class="pts">Pkt</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function render(host) {
    var tables = getTables();
    var thirdQual = bestThirds(tables);
    var live = WM.store.getLive();

    var note = '';
    if (!live.hasData) {
      note = '<p class="hint">Noch keine Live-Ergebnisse geladen. Die Tabellen zeigen alle Teams und füllen sich, ' +
             'sobald Ergebnisse vorliegen (oben rechts auf ↻ tippen).</p>';
    }
    var legend = '<div class="legend">' +
      '<span><i class="dot q-top"></i> Achtelfinale (Sechzehntelfinale) sicher</span>' +
      '<span><i class="dot q-third"></i> als bester Gruppendritter qualifiziert</span></div>';

    host.innerHTML = note + legend +
      '<div class="groups-grid">' + tables.map(function (t) { return tableHtml(t, thirdQual); }).join('') + '</div>';
  }

  WM.standings = { render: render, getTables: getTables };
})(window.WM = window.WM || {});
