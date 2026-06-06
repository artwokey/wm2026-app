/* stats.js — Statistik-Tab mit drei Unteransichten:
   Torschützen (Tore), Scorer (Tore + Assists), Weiße Westen (Clean Sheets je Team/Torhüter). */
(function (WM) {
  'use strict';
  var U = WM.util;
  var sub = 'scorers';   // 'scorers' | 'clean'

  function playerRow(rank, name, teamKey, cols) {
    var t = WM.teams.info(teamKey);
    return '<tr>' +
      '<td class="r">' + rank + '</td>' +
      '<td class="player"><span class="flag">' + t.flag + '</span>' +
        '<span class="pname">' + U.esc(name || '–') + '</span>' +
        '<span class="pteam">' + U.esc(t.name) + '</span></td>' +
      cols + '</tr>';
  }

  function renderScorers() {
    var list = (WM.store.getLive().topscorers || []).slice()
      .sort(function (a, b) { return (b.goals - a.goals) || (b.assists - a.assists); });
    if (!list.length) return empty('Torschützen');
    var rows = list.map(function (p, i) {
      return playerRow(i + 1, p.name, p.teamKey,
        '<td class="num strong">' + p.goals + '</td><td class="num hide-s">' + p.assists + '</td>');
    }).join('');
    return '<table class="ranking"><thead><tr><th class="r">#</th><th class="player">Spieler</th>' +
      '<th class="num">Tore</th><th class="num hide-s">Vorl.</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function renderClean() {
    var list = (WM.store.getLive().cleanSheets || []).filter(function (c) { return c.cleanSheets > 0; });
    if (!list.length) return empty('Weiße Westen');
    var rows = list.map(function (c, i) {
      var t = WM.teams.info(c.teamKey);
      return '<tr><td class="r">' + (i + 1) + '</td>' +
        '<td class="player"><span class="flag">' + t.flag + '</span>' +
        '<span class="pname">' + U.esc(t.name) + '</span>' +
        '<span class="pteam">Torhüter / Mannschaft</span></td>' +
        '<td class="num strong">' + c.cleanSheets + '</td></tr>';
    }).join('');
    return '<p class="hint">Spiele ohne Gegentor (zu Null), der Mannschaft bzw. ihrem Torhüter zugerechnet.</p>' +
      '<table class="ranking"><thead><tr><th class="r">#</th><th class="player">Mannschaft</th>' +
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
      ['clean', 'Weiße Westen']
    ];
    var bar = '<div class="subtabs">' + tabs.map(function (t) {
      return '<button type="button" class="subtab' + (sub === t[0] ? ' active' : '') + '" data-sub="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';

    var body = sub === 'clean' ? renderClean() : renderScorers();
    host.innerHTML = bar + '<div class="stat-body">' + body + '</div>';
    host.querySelectorAll('.subtab').forEach(function (b) {
      b.addEventListener('click', function () { sub = b.getAttribute('data-sub'); render(host); });
    });
  }

  WM.stats = { render: render };
})(window.WM = window.WM || {});
