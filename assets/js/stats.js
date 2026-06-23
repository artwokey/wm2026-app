/* stats.js — Statistik-Tab mit drei Unteransichten:
   Torschützen (Tore), Scorer (Tore + Vorlagen = Punkte), Weiße Westen (zu Null). */
(function (WM) {
  'use strict';
  var U = WM.util;
  var sub = 'scorers';   // 'scorers' | 'points' | 'clean'

  // Zelle "Spieler": Flagge + (Name über Teamname) als Flex-Zeile —
  // bewusst ohne absolute Positionierung (überlappte auf schmalen Displays).
  function playerCell(name, teamLabel, flagHtml) {
    return '<td class="player"><span class="pwrap">' +
      '<span class="flag">' + flagHtml + '</span>' +
      '<span class="pcol">' +
        '<span class="pname">' + U.esc(name || '–') + '</span>' +
        '<span class="pteam">' + U.esc(teamLabel) + '</span>' +
      '</span></span></td>';
  }

  function playerRow(rank, name, teamKey, cols) {
    var t = WM.teams.info(teamKey);
    return '<tr><td class="r">' + rank + '</td>' +
      playerCell(name, t.name, t.flag) + cols + '</tr>';
  }

  function renderScorers() {
    var list = (WM.store.getLive().topscorers || []).slice()
      .sort(function (a, b) { return (b.goals - a.goals) || (b.assists - a.assists); });
    if (!list.length) return empty('Torschützen');
    var rows = list.map(function (p, i) {
      return playerRow(i + 1, p.name, p.teamKey,
        '<td class="num strong">' + p.goals + '</td>');
    }).join('');
    return '<table class="ranking"><thead><tr><th class="r">#</th><th class="player">Spieler</th>' +
      '<th class="num">Tore</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function renderPoints() {
    var list = (WM.store.getLive().scorerPoints || []).slice()
      .filter(function (p) { return p.points > 0; })
      .sort(function (a, b) { return (b.points - a.points) || (b.goals - a.goals) || (b.assists - a.assists); });
    if (!list.length) return empty('Scorer');
    var rows = list.map(function (p, i) {
      return playerRow(i + 1, p.name, p.teamKey,
        '<td class="num">' + p.goals + '</td>' +
        '<td class="num">' + p.assists + '</td>' +
        '<td class="num strong">' + p.points + '</td>');
    }).join('');
    return '<table class="ranking"><thead><tr><th class="r">#</th><th class="player">Spieler</th>' +
      '<th class="num">Tore</th><th class="num">Vorl.</th><th class="num">Pkt</th></tr></thead><tbody>' +
      rows + '</tbody></table>' +
      '<p class="hint">Scorerpunkte = Tore + Vorlagen, ermittelt aus den FIFA-Spielverläufen. ' +
      'Bei gleicher Punktzahl zählen mehr Tore höher.</p>';
  }

  // Torhüter-Zelle: Torhütername oben, Land darunter, Flagge bleibt erhalten.
  function keeperCell(goalkeeper, teamName, flagHtml) {
    return playerCell(goalkeeper || 'Torhüter noch nicht verfügbar', teamName, flagHtml);
  }

  function renderClean() {
    var list = (WM.store.getLive().cleanSheets || []).filter(function (c) { return c.cleanSheets > 0; });
    if (!list.length) return empty('Weiße Westen');
    var rows = list.map(function (c, i) {
      var t = WM.teams.info(c.teamKey);
      return '<tr><td class="r">' + (i + 1) + '</td>' +
        keeperCell(c.goalkeeper, t.name, t.flag) +
        '<td class="num strong">' + c.cleanSheets + '</td></tr>';
    }).join('');
    return '<p class="hint">Spiele ohne Gegentor (zu Null). Torhütername oben, Land darunter.</p>' +
      '<table class="ranking"><thead><tr><th class="r">#</th><th class="player">Torhüter</th>' +
      '<th class="num">Zu&nbsp;Null</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function empty(what) {
    var live = WM.store.getLive();
    var why = live.hasData
      ? 'Noch keine Daten für „' + what + '“ – sobald Spiele gewertet sind, erscheinen sie hier.'
      : 'Noch nichts geladen. Oben rechts auf ↻ (Aktualisieren) tippen.';
    return '<p class="empty">' + U.esc(why) + '</p>';
  }

  function render(host) {
    var tabs = [
      ['scorers', 'Torschützen'],
      ['points', 'Scorer'],
      ['clean', 'Weiße Westen']
    ];
    var bar = '<div class="subtabs">' + tabs.map(function (t) {
      return '<button type="button" class="subtab' + (sub === t[0] ? ' active' : '') + '" data-sub="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';

    var body = sub === 'clean' ? renderClean() : sub === 'points' ? renderPoints() : renderScorers();
    host.innerHTML = bar + '<div class="stat-body">' + body + '</div>';
    host.querySelectorAll('.subtab').forEach(function (b) {
      b.addEventListener('click', function () { sub = b.getAttribute('data-sub'); render(host); });
    });
  }

  WM.stats = { render: render };
})(window.WM = window.WM || {});
