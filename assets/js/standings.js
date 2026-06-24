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

  // Direkter Vergleich: in der Gruppe spielt jedes Paar genau einmal -> liefert
  // das beendete Gruppenspiel zwischen A und B, Tore normiert auf {a:A-Tore, b:B-Tore}.
  function h2hResult(g, A, B) {
    var byId = WM.store.getLive().byMatchId || {};
    var res = null;
    WM.store.groupMatches(g).forEach(function (m) {
      var t1 = WM.teams.canonical(m.team1), t2 = WM.teams.canonical(m.team2);
      var b = byId[m.id];
      if (!b || !b.finished || b.hg == null || b.ag == null) return;
      if (t1 === A && t2 === B) res = { a: b.hg, b: b.ag };
      else if (t1 === B && t2 === A) res = { a: b.ag, b: b.hg };
    });
    return res;
  }

  // FIFA-2026-Regelwerk: Punkte -> direkter Vergleich -> Gesamt-Tordifferenz ->
  // Gesamttore -> Name. (Die 2026 NEUE Reihenfolge stellt den direkten Vergleich
  // VOR die Gesamt-Tordifferenz; bis 2022 war es umgekehrt.)
  function sortRows(rows, g) {
    return rows.slice().sort(function (a, b) {
      if (b.points !== a.points) return b.points - a.points;
      if (g) {
        var h = h2hResult(g, a.teamKey, b.teamKey);
        if (h && h.a !== h.b) return h.a > h.b ? -1 : 1;
      }
      return (b.gd - a.gd) || (b.gf - a.gf) ||
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
        // Beendete UND laufende Spiele zählen — laufende provisorisch mit
        // aktuellem Stand, damit die Tabelle jedem Tor in Echtzeit folgt.
        if (!live || (!live.finished && !live.live) || live.hg == null || live.ag == null) return;
        var a = rowMap[WM.teams.canonical(m.team1)], b = rowMap[WM.teams.canonical(m.team2)];
        if (!a || !b) return;
        a.played++; b.played++;
        a.gf += live.hg; a.ga += live.ag; b.gf += live.ag; b.ga += live.hg;
        a.gd = a.gf - a.ga; b.gd = b.gf - b.ga;
        if (live.hg > live.ag) { a.win++; a.points += 3; b.lose++; }
        else if (live.hg < live.ag) { b.win++; b.points += 3; a.lose++; }
        else { a.draw++; b.draw++; a.points++; b.points++; }
      });
      return { group: g, rows: sortRows(Object.keys(rowMap).map(function (k) { return rowMap[k]; }), g) };
    });
  }

  // Gruppen, in denen gerade ein Spiel läuft.
  function liveGroups() {
    var byId = WM.store.getLive().byMatchId || {};
    var set = {};
    WM.store.GROUP_LETTERS.forEach(function (g) {
      WM.store.groupMatches(g).forEach(function (m) {
        var b = byId[m.id];
        if (b && b.live) set[g] = true;
      });
    });
    return set;
  }

  function getTables() {
    var live = WM.store.getLive();
    if (live.standings && live.standings.length) {
      // API liefert bereits offizielle Reihenfolge; Lücken mit eingebauten Teams auffüllen.
      var map = {};
      live.standings.forEach(function (t) { map[t.group] = t.rows; });
      var lg = liveGroups();
      return WM.store.GROUP_LETTERS.map(function (g) {
        // Gruppe mit laufendem Spiel: lokal aus den Live-Ergebnissen rechnen, damit
        // die Tabelle jedem Tor sofort folgt (die offizielle API-Tabelle wird nur
        // grob/serverseitig zwischengespeichert aktualisiert). Sonst API-Tabelle.
        if (lg[g]) return { group: g, rows: computeGroup(g) };
        return { group: g, rows: (map[g] && map[g].length) ? map[g] : computeGroup(g) };
      });
    }
    return computeFromBundled();
  }

  function computeGroup(g) {
    return computeFromBundled().filter(function (t) { return t.group === g; })[0].rows;
  }

  // Steht der Gruppensieger nach FIFA-2026-Regelwerk schon fest? Sieger = das
  // Team X an Platz 1, das in KEINEM Restszenario überholt werden kann. Da 2026
  // der direkte Vergleich VOR der Gesamt-Tordifferenz greift, ist X sicher Erster,
  // wenn (a) kein Team mehr Punkte erreichen kann als X aktuell hat UND (b) X jedes
  // Team, das X punktemäßig EINHOLEN könnte, im direkten Duell bereits BESIEGT hat.
  // (b) genügt auch bei mehreren Verfolgern: hat X alle geschlagen, führt X in jeder
  // möglichen Punktgleich-Mini-Tabelle den direkten Vergleich an — egal wer aufschließt.
  function clinchedWinner(g) {
    var rows = computeGroup(g);
    if (!rows.length || rows[0].played === 0) return null;
    var X = rows[0].teamKey;
    var byKey = {}; rows.forEach(function (r) { byKey[r.teamKey] = r; });
    var rem = {}; rows.forEach(function (r) { rem[r.teamKey] = Math.max(0, 3 - r.played); });
    var xCur = byKey[X].points;

    for (var i = 0; i < rows.length; i++) {
      var Y = rows[i].teamKey;
      if (Y === X) continue;
      var yMax = byKey[Y].points + 3 * rem[Y];
      if (yMax > xCur) return null;                 // Y kann X auf Punkten überholen
      if (yMax === xCur) {
        // Y kann X einholen -> X muss das direkte Duell schon gewonnen haben.
        var h = h2hResult(g, X, Y);
        if (!(h && h.a > h.b)) return null;
      }
    }
    return X;
  }

  // Teams, deren Sechzehntelfinal-Qualifikation über Platz 1 ODER 2 rechnerisch
  // feststeht (kann nicht mehr aus den Top 2 fallen). Sound (markiert nur sichere):
  // T ist sicher, wenn höchstens EIN anderes Team noch über T landen kann.
  // 2026-Regelwerk: ein Team, das T nur einholen (nicht überholen) kann, ist KEINE
  // Gefahr, wenn T es im direkten Duell bereits geschlagen hat — aber nur, wenn T
  // ALLE punktgleich-fähigen Verfolger geschlagen hat (sonst 3er-Tabelle mehrdeutig
  // -> konservativ als Gefahr zählen).
  function securedTopTwo() {
    var out = {};
    WM.store.GROUP_LETTERS.forEach(function (g) {
      var rows = computeGroup(g);
      if (!rows.length || rows[0].played === 0) return;
      var rem = {}; rows.forEach(function (r) { rem[r.teamKey] = Math.max(0, 3 - r.played); });
      rows.forEach(function (T) {
        var tCur = T.points, strict = 0, tie = [];
        rows.forEach(function (Y) {
          if (Y.teamKey === T.teamKey) return;
          var yMax = Y.points + 3 * rem[Y.teamKey];
          if (yMax > tCur) strict++;
          else if (yMax === tCur) tie.push(Y.teamKey);
        });
        var beatAllTie = tie.every(function (yk) { var h = h2hResult(g, T.teamKey, yk); return h && h.a > h.b; });
        var above = beatAllTie ? strict : (strict + tie.length);
        if (above <= 1) out[T.teamKey] = true;
      });
    });
    return out;
  }

  // Entschiedene K.-o.-Plätze: '1X'/'2X' -> echter Team-Schlüssel.
  // Sieger (1X), sobald rechnerisch gesichert ODER Gruppe komplett.
  // Zweiter (2X) nur, wenn alle Gruppenspiele beendet sind (Reihenfolge final).
  function decidedSlots() {
    var out = {};
    var byId = WM.store.getLive().byMatchId || {};
    WM.store.GROUP_LETTERS.forEach(function (g) {
      var gms = WM.store.groupMatches(g);
      if (!gms.length) return;
      var rows = computeGroup(g);
      if (!rows.length || rows[0].played === 0) return;
      var allFinished = gms.every(function (m) { var b = byId[m.id]; return b && b.finished; });
      if (allFinished && rows.length >= 2) {
        out['1' + g] = rows[0].teamKey;
        out['2' + g] = rows[1].teamKey;
        return;
      }
      var w = clinchedWinner(g);
      if (w) out['1' + g] = w;
    });
    return out;
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

  // Gruppendritte, deren Qualifikation als einer der 8 besten Dritten rechnerisch
  // feststeht. Nur Dritte aus FERTIGEN Gruppen (ihre Stats sind final). Sound &
  // konservativ: jede noch nicht fertige Gruppe wird als möglicher Konkurrent
  // gezählt, der einen besseren Dritten stellen könnte ("worst case" für Q).
  // Liefert { Gruppe: teamKey } der sicheren Dritten.
  function securedThirds(tables) {
    var byId = WM.store.getLive().byMatchId || {};
    var finished = {};
    WM.store.GROUP_LETTERS.forEach(function (g) {
      var gms = WM.store.groupMatches(g);
      finished[g] = !!gms.length && gms.every(function (m) { var b = byId[m.id]; return b && b.finished; });
    });
    var unfinishedCount = WM.store.GROUP_LETTERS.filter(function (g) { return !finished[g]; }).length;
    var fixed = tables.filter(function (t) { return finished[t.group] && t.rows[2]; })
      .map(function (t) { return { g: t.group, r: t.rows[2] }; });
    // Könnte O ranggleich oder besser als Q sein (Bedrohung für Qs Top-8-Platz)?
    // Reihenfolge wie bei den Dritten: Punkte -> Tordifferenz -> Tore.
    function threatens(O, Q) {
      if (O.points !== Q.points) return O.points > Q.points;
      if (O.gd !== Q.gd) return O.gd > Q.gd;
      if (O.gf !== Q.gf) return O.gf > Q.gf;
      return true;   // exakt gleich -> Losentscheid möglich -> konservativ als Bedrohung
    }
    var out = {};
    fixed.forEach(function (Q) {
      var above = fixed.filter(function (O) { return O.g !== Q.g && threatens(O.r, Q.r); }).length;
      if (above + unfinishedCount <= 7) out[Q.g] = Q.r.teamKey;
    });
    return out;
  }

  function teamCell(teamKey, secured) {
    var t = WM.teams.info(teamKey);
    var star = secured ? '<span class="q-star" title="Sechzehntelfinale rechnerisch sicher">★</span>' : '';
    return '<span class="t-cell"><span class="flag">' + t.flag + '</span>' +
      '<span class="tname">' + U.esc(t.name) + '</span>' + star + '</span>';
  }

  function tableHtml(t, thirdQual, secured) {
    var rows = t.rows.map(function (r, i) {
      var rank = i + 1;
      var qcls = '';
      if (rank <= 2) qcls = 'q-top';
      else if (rank === 3 && thirdQual[t.group]) qcls = 'q-third';
      var gd = (r.gd > 0 ? '+' : '') + r.gd;
      return '<tr class="' + qcls + '">' +
        '<td class="r">' + rank + '</td>' +
        '<td class="team">' + teamCell(r.teamKey, secured && secured[r.teamKey]) + '</td>' +
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
    // Stern = rechnerisch weitergekommen. Drei Quellen vereinigen:
    //  1) securedTopTwo(): vorausschauend gesicherter Top-2-Platz (auch in noch
    //     laufenden Gruppen), 2) decidedSlots(): jedes Team in einem entschiedenen
    //     KO-Slot (Sieger 1X / Zweiter 2X) — hält die Tabelle mit KO-Baum/Spielplan
    //     konsistent, 3) securedThirds(): rechnerisch sichere beste Gruppendritte.
    var secured = securedTopTwo();
    var dec = decidedSlots();
    Object.keys(dec).forEach(function (k) { secured[dec[k]] = true; });
    var st = securedThirds(tables);
    Object.keys(st).forEach(function (g) { secured[st[g]] = true; });
    var live = WM.store.getLive();

    var note = '';
    if (!live.hasData) {
      note = '<p class="hint">Noch keine Live-Ergebnisse geladen. Die Tabellen zeigen alle Teams und füllen sich, ' +
             'sobald Ergebnisse vorliegen (oben rechts auf ↻ tippen).</p>';
    }
    var legend = '<div class="legend">' +
      '<span><span class="q-star">★</span> Sechzehntelfinale sicher (rechnerisch fix)</span>' +
      '<span><i class="dot q-top"></i> aktuell Platz 1–2</span>' +
      '<span><i class="dot q-third"></i> aktuell bester Gruppendritter</span></div>';

    host.innerHTML = note + legend +
      '<div class="groups-grid">' + tables.map(function (t) { return tableHtml(t, thirdQual, secured); }).join('') + '</div>';
  }

  WM.standings = { render: render, getTables: getTables, decidedSlots: decidedSlots };
})(window.WM = window.WM || {});
