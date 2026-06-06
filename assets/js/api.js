/* api.js — Live-Daten von OpenLigaDB (gratis, ohne Key, CORS-tauglich).
   Endpunkt: getmatchdata/wm2026 (liefert Spiele, Ergebnisse und Torschützen).
   Daraus: Mapping auf eingebaute Spiele, Torschützenliste, Weiße Westen, Tor-Events.
   Gruppentabellen werden in standings.js aus diesen Ergebnissen berechnet. */
(function (WM) {
  'use strict';

  var HOST = 'https://api.openligadb.de';
  var SHORTCUT = 'wm2026';
  var TTL = 60 * 1000;
  var FINISHED = { FT: 1, AET: 1, PEN: 1 };
  var LIVE = { '2H': 1, '1H': 1, HT: 1, LIVE: 1 };

  function canon(name) { return WM.teams.canonical(name); }
  function dayKey(iso) { return (iso || '').slice(0, 10); }
  function pairKey(a, b) { return [a, b].sort().join('|'); }

  async function fetchRaw() {
    var res;
    try { res = await fetch(HOST + '/getmatchdata/' + SHORTCUT, { headers: { 'Accept': 'application/json' } }); }
    catch (e) { throw { code: 'NET', message: 'Keine Verbindung zu OpenLigaDB (offline?).' }; }
    if (!res.ok) throw { code: 'HTTP', message: 'OpenLigaDB HTTP ' + res.status };
    return await res.json();
  }

  // Endergebnis aus matchResults (resultTypeID 2 = Endergebnis), sonst höchste Order.
  function finalResult(m) {
    var rs = m.matchResults || [];
    var fin = rs.filter(function (r) { return r.resultTypeID === 2; })[0];
    if (!fin && rs.length) {
      fin = rs.slice().sort(function (a, b) { return (b.resultOrderID || 0) - (a.resultOrderID || 0); })[0];
    }
    return fin || null;
  }

  // Tore eines Spiels: Schütze + Mannschaft (aus laufendem Spielstand abgeleitet).
  function deriveGoals(m, homeKey, awayKey) {
    var prev1 = 0, prev2 = 0, out = [];
    (m.goals || []).forEach(function (g) {
      var s1 = (g.scoreTeam1 != null) ? g.scoreTeam1 : prev1;
      var s2 = (g.scoreTeam2 != null) ? g.scoreTeam2 : prev2;
      var side = (s1 > prev1) ? 1 : (s2 > prev2) ? 2 : null;
      prev1 = s1; prev2 = s2;
      var scoringTeam = side === 1 ? homeKey : side === 2 ? awayKey : null;
      var scorerTeam = g.isOwnGoal
        ? (scoringTeam === homeKey ? awayKey : scoringTeam === awayKey ? homeKey : null)
        : scoringTeam;
      if (!g.goalGetterName) return;
      out.push({
        minute: g.matchMinute, player: g.goalGetterName, teamKey: scorerTeam,
        isPenalty: !!g.isPenalty, isOwnGoal: !!g.isOwnGoal
      });
    });
    return out;
  }

  function normMatch(m) {
    var home = canon(m.team1 && m.team1.teamName);
    var away = canon(m.team2 && m.team2.teamName);
    var fin = finalResult(m);
    var hasGoals = (m.goals || []).length > 0;
    var hg = fin ? fin.pointsTeam1 : null;
    var ag = fin ? fin.pointsTeam2 : null;
    if (hg == null && hasGoals) {
      var g = m.goals[m.goals.length - 1];
      hg = g.scoreTeam1; ag = g.scoreTeam2;
    }
    var status = m.matchIsFinished ? 'FT' : ((fin || hasGoals) ? '2H' : 'NS');
    return {
      home: home, away: away, hg: hg, ag: ag, statusShort: status,
      finished: !!m.matchIsFinished, live: status === '2H',
      dateUtc: m.matchDateTimeUTC || m.matchDateTime,
      goals: deriveGoals(m, home, away)
    };
  }

  function aggregate(rawMatches) {
    var normalized = (rawMatches || []).map(normMatch);

    // Index für Mapping auf eingebaute Spiele.
    var idx = {};
    normalized.forEach(function (n) {
      idx[pairKey(n.home, n.away) + '@' + dayKey(n.dateUtc)] = n;
      var k2 = pairKey(n.home, n.away);
      if (!idx[k2]) idx[k2] = n;
    });

    var byMatchId = {}, goalsByMatch = {};
    WM.store.matches().forEach(function (mm) {
      var t1 = canon(mm.team1), t2 = canon(mm.team2);
      var n = idx[pairKey(t1, t2) + '@' + dayKey(mm.kickoffUtc)] || idx[pairKey(t1, t2)];
      if (!n) return;
      byMatchId[mm.id] = {
        hg: n.hg, ag: n.ag, statusShort: n.statusShort,
        finished: n.finished, live: n.live, homeKey: n.home, awayKey: n.away
      };
      if (n.goals.length) goalsByMatch[mm.id] = n.goals;
    });

    // Torschützenliste (Eigentore zählen nicht für den Schützen).
    var scorerMap = {};
    normalized.forEach(function (n) {
      n.goals.forEach(function (g) {
        if (g.isOwnGoal || !g.player) return;
        var key = g.player + '|' + (g.teamKey || '');
        if (!scorerMap[key]) scorerMap[key] = { name: g.player, teamKey: g.teamKey, goals: 0, assists: 0 };
        scorerMap[key].goals++;
      });
    });
    var topscorers = Object.keys(scorerMap).map(function (k) { return scorerMap[k]; })
      .filter(function (p) { return p.goals > 0; })
      .sort(function (a, b) { return b.goals - a.goals; });

    // Weiße Westen aus beendeten Spielen.
    var csMap = {};
    Object.keys(byMatchId).forEach(function (id) {
      var b = byMatchId[id];
      if (!b.finished || b.hg == null || b.ag == null) return;
      if (b.ag === 0) csMap[b.homeKey] = (csMap[b.homeKey] || 0) + 1;
      if (b.hg === 0) csMap[b.awayKey] = (csMap[b.awayKey] || 0) + 1;
    });
    var cleanSheets = Object.keys(csMap).map(function (k) { return { teamKey: k, cleanSheets: csMap[k] }; })
      .sort(function (a, b) { return b.cleanSheets - a.cleanSheets; });

    return { byMatchId: byMatchId, goalsByMatch: goalsByMatch, topscorers: topscorers, cleanSheets: cleanSheets,
      anyResult: Object.keys(byMatchId).some(function (id) { return byMatchId[id].finished || byMatchId[id].live; }) };
  }

  async function refreshAll(force) {
    var cache = WM.store.loadCache();
    cache.ts = cache.ts || {};
    var now = Date.now();
    var error = null;

    var fresh = cache.openliga && cache.ts.openliga && (now - cache.ts.openliga < TTL);
    if (force || !fresh) {
      try {
        cache.openliga = await fetchRaw();
        cache.ts.openliga = Date.now();
        WM.store.saveCache(cache);
      } catch (err) { error = err; }
    }

    var agg = aggregate(cache.openliga || []);
    var live = {
      standings: [],          // -> Fallback-Berechnung in standings.js (alle 12 Gruppen)
      topscorers: agg.topscorers,
      topassists: [],         // OpenLigaDB liefert keine Assists
      cleanSheets: agg.cleanSheets,
      byMatchId: agg.byMatchId,
      goalsByMatch: agg.goalsByMatch,
      ts: cache.ts,
      hasData: (cache.openliga || []).length > 0,
      ok: !error && (cache.openliga || []).length > 0,
      error: error ? error.message : null,
      errorCode: error ? error.code : null,
      remaining: '∞',
      assistsUnavailable: true
    };
    WM.store.setLive(live);
    return live;
  }

  // Tor-Events eines Spiels (aus bereits geladenen Daten, kein extra Abruf).
  function fetchEvents(matchId) {
    var goals = (WM.store.getLive().goalsByMatch || {})[matchId] || [];
    return Promise.resolve(goals.map(function (g) {
      return {
        team: g.teamKey, minute: g.minute, player: g.player, assist: null,
        detail: g.isPenalty ? 'Penalty' : g.isOwnGoal ? 'Own Goal' : 'Normal Goal'
      };
    }));
  }

  WM.api = { refreshAll: refreshAll, fetchEvents: fetchEvents, FINISHED: FINISHED, LIVE: LIVE };
})(window.WM = window.WM || {});
