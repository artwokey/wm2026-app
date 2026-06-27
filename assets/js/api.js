/* api.js — Live-Daten aus zwei Quellen:
   1) football-data.org via Cloudflare Worker (kein Token im Client) — führend für
      Spielstände/Status, offizielle Gruppentabellen und Torschützenliste.
   2) api.fifa.com (öffentliche FIFA-API, ohne Schlüssel) — Ereignisse mit Namen. */
(function (WM) {
  'use strict';

  var HOST = 'https://wmapp2026-api.r-mertens.workers.dev/v4';
  var TOKEN = '';
  var TTL_MATCHES = 55 * 1000;       // Spielstände; force (Live-Polling) umgeht die TTL
  var TTL_SLOW = 5 * 60 * 1000;      // Scorers/Tabellen — schont das Limit (10 Aufrufe/Min)
  var FINISHED = { FT: 1, AET: 1, PEN: 1, AWD: 1 };
  var LIVE = { '1H': 1, '2H': 1, HT: 1, LIVE: 1 };

  // round (tournament.json) -> stage (football-data), für K.-o.-Spiele,
  // deren Platzhalter-Teams (1A, W74 …) sich nicht über Namen matchen lassen.
  var STAGE_BY_ROUND = {
    'Round of 32': 'LAST_32',
    'Round of 16': 'LAST_16',
    'Quarter-final': 'QUARTER_FINALS',
    'Semi-final': 'SEMI_FINALS',
    'Match for third place': 'THIRD_PLACE',
    'Final': 'FINAL'
  };

  // FIFA-API (Ereignis-Timelines): Competition 17 = FIFA World Cup, Saison 285023 = 2026.
  var FIFA_HOST = 'https://api.fifa.com/api/v3';
  var FIFA_CAL = '/calendar/matches?idCompetition=17&idSeason=285023&language=en&count=500';
  var TTL_FIFA_CAL = 6 * 60 * 60 * 1000;  // Spiel-IDs ändern sich praktisch nie
  var TTL_FIFA_TL = 25 * 1000;            // Timeline laufender Spiele
  var FIFA_BACKFILL_PER_RUN = 5;          // ältere beendete Spiele: sanft nachholen
  var FIFA_STAGE_BY_ROUND = {
    'Round of 32': 'Round of 32',
    'Round of 16': 'Round of 16',
    'Quarter-final': 'Quarter-final',
    'Semi-final': 'Semi-final',
    'Match for third place': 'Play-off for third place',
    'Final': 'Final'
  };

  function canon(name) { return WM.teams.canonical(name); }
  function known(name) { return !!WM.teams.META[canon(name)]; }
  function dayKey(iso) { return (iso || '').slice(0, 10); }
  function pairKey(a, b) { return [a, b].sort().join('|'); }

  async function fetchJson(path) {
    var res;
    try { res = await fetch(HOST + path); }
    catch (e) { throw { code: 'NET', message: 'Keine Verbindung (offline oder Proxy nicht erreichbar).' }; }
    if (res.status === 429) throw { code: 'RATE', message: 'Anfragelimit erreicht – nächste Aktualisierung in ca. 1 Minute.' };
    if (!res.ok) throw { code: 'HTTP', message: 'API HTTP ' + res.status };
    return await res.json();
  }

  // Spielminute-String ("45", "45+2", "90+3") -> Zahl (Nachspielzeit zählt voll mit).
  function minuteNumber(min) {
    var m = /^(\d+)(?:\+(\d+))?/.exec(String(min == null ? '' : min).replace(/'/g, ''));
    if (!m) return null;
    return parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) : 0);
  }

  // Zahl -> Anzeige-String; jenseits von 45 (1. HZ) bzw. 90 (2. HZ) als Nachspielzeit ("45+2").
  function minuteDisplay(n, half) {
    if (n == null) return null;
    var base = half === '2H' ? 90 : 45;
    return n > base ? (base + '+' + (n - base)) : String(n);
  }

  // Spielminute grob aus dem Anstoß schätzen (der freie Tarif liefert keine Minute);
  // ab Minute 50 wird die Halbzeitpause (ca. 15 Min) herausgerechnet.
  function estimate(kickoffMs, nowMs) {
    var raw = Math.floor((nowMs - kickoffMs) / 60000) + 1;
    if (raw <= 50) return { half: '1H', minute: Math.max(1, raw) };
    return { half: '2H', minute: Math.min(Math.max(raw - 15, 46), 130) };
  }

  // football-data-Status -> kompakte Status-Codes der App (util.statusLabel).
  function mapStatus(m, nowMs) {
    var s = m.status;
    if (s === 'FINISHED' || s === 'AWARDED') {
      var dur = (m.score && m.score.duration) || 'REGULAR';
      var code = s === 'AWARDED' ? 'AWD' : (dur === 'PENALTY_SHOOTOUT' ? 'PEN' : dur === 'EXTRA_TIME' ? 'AET' : 'FT');
      return { statusShort: code, elapsed: null };
    }
    if (s === 'IN_PLAY') {
      var e = estimate(Date.parse(m.utcDate), nowMs);
      return { statusShort: e.half, elapsed: '~' + e.minute };
    }
    if (s === 'PAUSED') return { statusShort: 'HT', elapsed: null };
    if (s === 'SUSPENDED') return { statusShort: 'SUSP', elapsed: null };
    if (s === 'POSTPONED') return { statusShort: 'PST', elapsed: null };
    if (s === 'CANCELLED') return { statusShort: 'CANC', elapsed: null };
    return { statusShort: 'NS', elapsed: null };   // SCHEDULED / TIMED
  }

  function normMatch(m, nowMs) {
    var st = mapStatus(m, nowMs);
    var homeName = m.homeTeam && m.homeTeam.name;
    var awayName = m.awayTeam && m.awayTeam.name;
    var ft = (m.score && m.score.fullTime) || {};
    return {
      homeKey: known(homeName) ? canon(homeName) : null,
      awayKey: known(awayName) ? canon(awayName) : null,
      hg: ft.home != null ? ft.home : null,
      ag: ft.away != null ? ft.away : null,
      statusShort: st.statusShort, elapsed: st.elapsed,
      finished: !!FINISHED[st.statusShort],
      live: !!LIVE[st.statusShort],
      utc: m.utcDate || '', utcMs: Date.parse(m.utcDate), stage: m.stage
    };
  }

  function aggregate(apiMatches) {
    var nowMs = Date.now();
    var normalized = (apiMatches || []).map(function (m) { return normMatch(m, nowMs); });

    // Indizes: Teampaar (+UTC-Tag) für Spiele mit bekannten Teams,
    // Runde+Anstoßzeit als Fallback für K.-o.-Platzhalter (nur wenn eindeutig).
    var idx = {}, byStageTime = {};
    normalized.forEach(function (n) {
      if (n.homeKey && n.awayKey) {
        var pk = pairKey(n.homeKey, n.awayKey);
        idx[pk + '@' + dayKey(n.utc)] = n;
        if (!idx[pk]) idx[pk] = n;
      }
      var sk = n.stage + '@' + n.utcMs;
      byStageTime[sk] = (sk in byStageTime) ? null : n;   // null = mehrdeutig
    });

    var byMatchId = {};
    WM.store.matches().forEach(function (mm) {
      var n = null;
      if (known(mm.team1) && known(mm.team2)) {
        var pk = pairKey(canon(mm.team1), canon(mm.team2));
        n = idx[pk + '@' + dayKey(mm.kickoffUtc)] || idx[pk] || null;
      }
      if (!n && STAGE_BY_ROUND[mm.round]) {
        n = byStageTime[STAGE_BY_ROUND[mm.round] + '@' + Date.parse(mm.kickoffUtc)] || null;
      }
      if (!n) return;
      byMatchId[mm.id] = {
        hg: n.hg, ag: n.ag, statusShort: n.statusShort, elapsed: n.elapsed,
        finished: n.finished, live: n.live,
        homeKey: n.homeKey || undefined, awayKey: n.awayKey || undefined
      };
    });

    // Weiße Westen aus beendeten Spielen.
    var csMap = {};
    Object.keys(byMatchId).forEach(function (id) {
      var b = byMatchId[id];
      if (!b.finished || b.hg == null || b.ag == null || !b.homeKey || !b.awayKey) return;
      if (b.ag === 0) csMap[b.homeKey] = (csMap[b.homeKey] || 0) + 1;
      if (b.hg === 0) csMap[b.awayKey] = (csMap[b.awayKey] || 0) + 1;
    });
    var cleanSheets = Object.keys(csMap).map(function (k) { return { teamKey: k, cleanSheets: csMap[k] }; })
      .sort(function (a, b) { return b.cleanSheets - a.cleanSheets; });

    return { byMatchId: byMatchId, cleanSheets: cleanSheets };
  }

  // ---- Fallback bei hängendem matches-Feed -----------------------------------
  // Beobachtet am Eröffnungstag 2026: /matches blieb stundenlang auf TIMED,
  // während /standings (und /scorers) live gepflegt wurden. Für Gruppenspiele,
  // die laut Anstoßzeit laufen müssten, aber im Feed noch "NS" sind, wird der
  // Stand aus der offiziellen Tabelle abgeleitet: Tore laut Tabelle minus Tore
  // aller im Feed beendeten Spiele des Teams — abgesichert durch Kreuz-Check
  // über beide Mannschaften (Heim-Tore == Gegentore des Gegners).
  function applyStandingsOverlay(byMatchId, standings, cache) {
    if (!standings || !standings.length) return;
    var liveMeta = (cache && cache.fd && cache.fd.liveMeta) || {};
    var rowsByTeam = {};
    standings.forEach(function (g) {
      (g.rows || []).forEach(function (r) { rowsByTeam[r.teamKey] = r; });
    });

    var counted = {};
    function cnt(k) { return counted[k] || (counted[k] = { played: 0, gf: 0, ga: 0 }); }
    var groupMatches = WM.store.matches().filter(function (m) { return m.phase === 'group'; });
    groupMatches.forEach(function (m) {
      var b = byMatchId[m.id];
      if (!b || !b.finished || b.hg == null || b.ag == null) return;
      var h = cnt(canon(m.team1)), a = cnt(canon(m.team2));
      h.played++; h.gf += b.hg; h.ga += b.ag;
      a.played++; a.gf += b.ag; a.ga += b.hg;
    });

    var nowMs = Date.now();
    groupMatches.forEach(function (m) {
      var b = byMatchId[m.id];
      if (b && (b.live || b.finished)) return;            // Feed liefert bereits etwas
      var kickMs = Date.parse(m.kickoffUtc);
      var raw = (nowMs - kickMs) / 60000;
      if (!(raw >= 0 && raw <= 180)) return;              // nur rund um die Spielzeit
      // Anstoß kann sich verzögern — ohne FIFA-Bestätigung (Type-7-Event der
      // Timeline, echte Uhrzeit) gilt das Spiel trotz erreichter Anstoßzeit
      // noch nicht als laufend (sonst zeigt die App "läuft"/Minute 1, bevor
      // tatsächlich angepfiffen wurde).
      if (!(liveMeta[m.id] && liveMeta[m.id].clock)) return;
      var hk = canon(m.team1), ak = canon(m.team2);
      var sh = rowsByTeam[hk], sa = rowsByTeam[ak];
      if (!sh || !sa) return;
      var ch = cnt(hk), ca = cnt(ak);
      if (sh.played !== ch.played + 1 || sa.played !== ca.played + 1) return;
      var hg = sh.gf - ch.gf, ag = sh.ga - ch.ga;
      if (hg < 0 || ag < 0 || (sa.gf - ca.gf) !== ag || (sa.ga - ca.ga) !== hg) return;
      var st = raw <= 130 ? estimate(kickMs, nowMs) : null;
      byMatchId[m.id] = {
        hg: hg, ag: ag,
        statusShort: st ? st.half : 'FT',
        elapsed: st ? '~' + st.minute : null,
        finished: !st, live: !!st,
        homeKey: hk, awayKey: ak
      };
    });
  }

  // Läuft laut Spielplan gerade ein Gruppenspiel, für das der Feed nichts liefert?
  function feedLagSuspected(byMatchId) {
    var nowMs = Date.now();
    return WM.store.matches().some(function (m) {
      if (m.phase !== 'group') return false;
      var b = byMatchId[m.id];
      if (b && (b.live || b.finished)) return false;
      var raw = (nowMs - Date.parse(m.kickoffUtc)) / 60000;
      return raw >= 0 && raw <= 180;
    });
  }

  // ---- Tor-Protokoll ---------------------------------------------------------
  // Score-Änderungen zwischen zwei Abrufen -> Ticker-Einträge mit geschätzter
  // Minute. Beim ersten Sehen eines Spiels wird nur der Stand als Basis gemerkt
  // (keine nachträglichen Pseudo-Tore, keine Benachrichtigungsflut beim Start).
  function updateGoalLog(cache, byMatchId) {
    var log = cache.fd.goalLog || (cache.fd.goalLog = {});
    var matchesById = {};
    WM.store.matches().forEach(function (m) { matchesById[m.id] = m; });

    function removeLast(goals, teamKey, count) {
      for (var i = goals.length - 1; i >= 0 && count > 0; i--) {
        if (goals[i].teamKey === teamKey) { goals.splice(i, 1); count--; }
      }
    }

    Object.keys(byMatchId).forEach(function (id) {
      var b = byMatchId[id];
      if (b.hg == null || b.ag == null) return;
      var entry = log[id];
      if (!entry) { log[id] = { h: b.hg, a: b.ag, goals: [] }; return; }

      var m = matchesById[id] || {};
      var minute = b.elapsed || (b.finished ? '~90' : '');
      var homeKey = b.homeKey || canon(m.team1 || '');
      var awayKey = b.awayKey || canon(m.team2 || '');

      function push(teamKey) {
        entry.goals.push({
          minute: minute, player: null, teamKey: teamKey,
          isPenalty: false, isOwnGoal: false, seq: entry.goals.length + 1
        });
      }
      while (entry.h < b.hg) { push(homeKey); entry.h++; }
      while (entry.a < b.ag) { push(awayKey); entry.a++; }
      // Korrektur nach unten (z. B. VAR): zuletzt protokollierte Tore entfernen.
      if (entry.h > b.hg) { removeLast(entry.goals, homeKey, entry.h - b.hg); entry.h = b.hg; }
      if (entry.a > b.ag) { removeLast(entry.goals, awayKey, entry.a - b.ag); entry.a = b.ag; }
    });
    return log;
  }

  function goalsFromLog(log) {
    var out = {};
    Object.keys(log || {}).forEach(function (id) {
      if (log[id].goals && log[id].goals.length) out[id] = log[id].goals;
    });
    return out;
  }

  // ---- FIFA-Ereignisse (Tore + Platzverweise mit Name und Minute) -------------
  async function fetchFifa(path) {
    var res;
    try { res = await fetch(FIFA_HOST + path); }
    catch (e) { throw { code: 'NET', message: 'FIFA-Dienst nicht erreichbar' }; }
    if (!res.ok) throw { code: 'HTTP', message: 'FIFA HTTP ' + res.status };
    return await res.json();
  }

  // FIFA-Kalender -> Zuordnung tournament.json-Spiel -> {is: IdStage, im: IdMatch}.
  // Gruppenspiele über Teampaar+Tag, K.-o.-Platzhalter über Runde+Anstoßzeit
  // (FIFAs MatchNumber folgt einer anderen Zählung als openfootball).
  async function ensureFifaMap(cache) {
    var now = Date.now();
    if (cache.fd.fifaMap && cache.ts.fifaCal && now - cache.ts.fifaCal < TTL_FIFA_CAL) {
      return cache.fd.fifaMap;
    }
    var results = (await fetchFifa(FIFA_CAL)).Results || [];
    var idx = {}, byStageTime = {};
    results.forEach(function (r) {
      var hn = r.Home && r.Home.TeamName && r.Home.TeamName[0] && r.Home.TeamName[0].Description;
      var an = r.Away && r.Away.TeamName && r.Away.TeamName[0] && r.Away.TeamName[0].Description;
      // LocalDate trägt zwar ein "Z"-Suffix, ist aber die Ortszeit-Wanduhrzeit
      // des Stadions (keine echte UTC-Zeit) — als Roh-String übernehmen.
      var ref = { is: r.IdStage, im: r.IdMatch, loc: r.LocalDate };
      if (hn && an && known(hn) && known(an)) {
        var pk = pairKey(canon(hn), canon(an));
        idx[pk + '@' + dayKey(r.Date)] = ref;
        if (!idx[pk]) idx[pk] = ref;
      }
      var sn = (r.StageName && r.StageName[0] && r.StageName[0].Description) || '';
      var sk = sn + '@' + Date.parse(r.Date);
      byStageTime[sk] = (sk in byStageTime) ? null : ref;   // null = mehrdeutig
    });
    var map = {};
    WM.store.matches().forEach(function (mm) {
      var ref = null;
      if (known(mm.team1) && known(mm.team2)) {
        var pk = pairKey(canon(mm.team1), canon(mm.team2));
        ref = idx[pk + '@' + dayKey(mm.kickoffUtc)] || idx[pk] || null;
      }
      if (!ref && FIFA_STAGE_BY_ROUND[mm.round]) {
        ref = byStageTime[FIFA_STAGE_BY_ROUND[mm.round] + '@' + Date.parse(mm.kickoffUtc)] || null;
      }
      if (ref) map[mm.id] = ref;
    });
    cache.fd.fifaMap = map;
    cache.ts.fifaCal = Date.now();
    return map;
  }

  // FIFA schreibt Nachnamen in Versalien ("Julian QUINONES", "RAÚL") —
  // komplett großgeschriebene Namensteile (ab 2 Buchstaben) in normale
  // Schreibweise wandeln; Initialen ("H G OH") und gemischte Schreibweisen
  // ("McKennie") bleiben unangetastet.
  function properName(name) {
    if (!name) return name;
    return String(name).split(' ').map(function (w) {
      return w.split('-').map(function (h) {
        return h.split("'").map(function (s) {
          if (s.length >= 2 && s === s.toUpperCase() && s !== s.toLowerCase()) {
            return s.charAt(0) + s.slice(1).toLowerCase();
          }
          return s;
        }).join("'");
      }).join('-');
    }).join(' ');
  }

  // Spielername steht vorn in der Ereignisbeschreibung: "Julian QUINONES (Mexico) scores!!"
  function playerFromDesc(desc) {
    var i = desc.indexOf(' (');
    return i > 0 ? properName(desc.slice(0, i)) : null;
  }

  // Echte Spielzeit aus den Halbzeit-Markern der Timeline ableiten:
  // Type 7 = "Beginn der Halbzeit" (MatchMinute "0'" bzw. "45'", Period 3/5),
  // Type 8 = "Ende der Halbzeit" (Period 3 -> Halbzeitpause, Period 5 -> Spielende).
  // Ausgehend vom letzten bereits vergangenen Marker wird die Minute anhand der
  // seither verstrichenen Echtzeit fortgeschrieben. Liefert die Timeline keinen
  // verwertbaren Marker, bleibt estimate() als Fallback aktiv (Rückgabe null).
  function clockFromTimeline(evs) {
    var now = Date.now();
    var last = null;
    (evs || []).forEach(function (e) {
      if (e.Type !== 7 && e.Type !== 8) return;
      var ts = Date.parse(e.Timestamp);
      if (isNaN(ts) || ts > now) return;
      last = e;
    });
    if (!last) return null;

    if (last.Type === 8) {
      if (last.Period === 3) return { half: 'HT', elapsed: null };
      // Ende 2. HZ/Verlängerung: Spiel ist vorbei. Das melden wir aktiv ("done"),
      // damit eine verzögerte football-data-Antwort (noch IN_PLAY) nicht weiter
      // eine hochgezählte Schätz-Minute anzeigt.
      return { done: true };
    }
    var half = last.Period === 3 ? '1H' : last.Period === 5 ? '2H' : null;
    if (!half) return null;
    var anchor = minuteNumber(last.MatchMinute);
    if (anchor == null) return null;
    var minute = anchor + Math.floor((now - Date.parse(last.Timestamp)) / 60000) + 1;
    minute = Math.min(minute, half === '2H' ? 130 : 60);
    return { half: half, elapsed: minuteDisplay(minute, half) };
  }

  // Timeline -> {goals, reds}. Tore werden am Spielstand der Events erkannt
  // (robust gegen unbekannte Event-Typen wie Elfmeter-/Eigentor-Varianten);
  // sinkt der Stand (VAR), wird das zuletzt notierte Tor der Seite entfernt.
  // Platzverweise: Type 3 (Rot) / Type 4 (Gelb-Rot) bzw. "sent off" im Text.
  function parseTimeline(data, homeKey, awayKey) {
    var evs = ((data && data.Event) || []).slice().sort(function (a, b) {
      return Date.parse(a.Timestamp) - Date.parse(b.Timestamp);
    });
    var goals = [], reds = [];
    var ph = 0, pa = 0;
    evs.forEach(function (e) {
      var desc = (e.EventDescription && e.EventDescription[0] && e.EventDescription[0].Description) || '';
      var minute = String(e.MatchMinute || '').replace(/'/g, '');
      var h = e.HomeGoals, a = e.AwayGoals;
      if (h != null && a != null) {
        if (h > ph || a > pa) {
          var isOwnGoal = /own goal/i.test(desc);
          // Vorlage: bei Toren trägt das Event den Vorlagengeber als "Sub"-Spieler
          // des gleichen Teams (IdSubTeam === IdTeam); bei Eigentoren keine Vorlage.
          var assistId = (!isOwnGoal && e.IdSubTeam && e.IdTeam && e.IdSubTeam === e.IdTeam)
            ? e.IdSubPlayer : null;
          goals.push({
            minute: minute || '?', player: playerFromDesc(desc),
            teamKey: h > ph ? homeKey : awayKey,
            isPenalty: /penalty/i.test(desc), isOwnGoal: isOwnGoal,
            assistId: assistId, scorerId: e.IdPlayer || null,
            seq: goals.length + 1
          });
        } else if (h < ph || a < pa) {
          var key = h < ph ? homeKey : awayKey;
          for (var i = goals.length - 1; i >= 0; i--) {
            if (goals[i].teamKey === key) { goals.splice(i, 1); break; }
          }
        }
        ph = h; pa = a;
      }
      if (e.Type === 3 || e.Type === 4 || /sent off/i.test(desc)) {
        var tm = /\(([^)]+)\)/.exec(desc);
        var tk = tm ? canon(tm[1]) : null;
        reds.push({
          minute: minute || '?', player: playerFromDesc(desc),
          teamKey: (tk === homeKey || tk === awayKey) ? tk : null,
          scorerId: e.IdPlayer || null
        });
      }
    });
    return { goals: goals, reds: reds, clock: clockFromTimeline(evs) };
  }

  // Timelines abrufen: laufende Spiele (bzw. Spiele im Anstoß-Fenster) häufig,
  // beendete einmalig ("final"); ältere beendete Spiele gedrosselt nachholen.
  async function refreshFifaEvents(cache, byMatchId) {
    var map;
    try { map = await ensureFifaMap(cache); } catch (e) { return; }
    var events = cache.fd.events || (cache.fd.events = {});
    var tlTs = cache.ts.fifaTl || (cache.ts.fifaTl = {});
    var now = Date.now();
    var backfill = 0;

    var todo = [];
    WM.store.matches().forEach(function (m) {
      var ref = map[m.id];
      if (!ref) return;
      var ev = events[m.id];
      if (ev && ev.final) return;
      var b = byMatchId[m.id];
      var kickMs = Date.parse(m.kickoffUtc);
      var inWindow = now >= kickMs && now - kickMs <= 210 * 60000;
      var isLive = !!(b && b.live);
      var isFin = !!(b && b.finished);
      if (isLive || inWindow || isFin) {
        if (!isLive && !inWindow && backfill >= FIFA_BACKFILL_PER_RUN) return;
        if (now - (tlTs[m.id] || 0) < TTL_FIFA_TL) return;
        if (!isLive && !inWindow) backfill++;
        todo.push({ m: m, ref: ref, fin: isFin });
      }
    });

    for (var i = 0; i < todo.length; i++) {
      var t = todo[i];
      try {
        var data = await fetchFifa('/timelines/17/285023/' + t.ref.is + '/' + t.ref.im + '?language=en');
        var b = byMatchId[t.m.id] || {};
        var hk = b.homeKey || (known(t.m.team1) ? canon(t.m.team1) : null);
        var ak = b.awayKey || (known(t.m.team2) ? canon(t.m.team2) : null);
        var parsed = parseTimeline(data, hk, ak);
        // Torschützen- und Vorlagen-Namen über die Spieler-ID auflösen (einmalig,
        // gecacht). Die Event-Beschreibung enthält mal den vollen Namen, mal nur
        // den Nachnamen ("NMECHA") — /players/{id} liefert immer den vollen Namen
        // ("Felix Nmecha"), sonst bleibt der Beschreibungs-Name als Fallback.
        for (var gi = 0; gi < parsed.goals.length; gi++) {
          var gg = parsed.goals[gi];
          if (gg.scorerId) {
            try { var sn = await fetchFifaPlayerName(cache, gg.scorerId); if (sn) gg.player = sn; } catch (e3) {}
          }
          if (gg.assistId && !gg.assist) {
            try { gg.assist = await fetchFifaPlayerName(cache, gg.assistId); } catch (e2) {}
          }
        }
        for (var ri = 0; ri < parsed.reds.length; ri++) {
          var rr = parsed.reds[ri];
          if (rr.scorerId) {
            try { var rn = await fetchFifaPlayerName(cache, rr.scorerId); if (rn) rr.player = rn; } catch (e4) {}
          }
        }
        parsed.final = !!t.fin;
        events[t.m.id] = parsed;
        tlTs[t.m.id] = Date.now();
        if (parsed.clock) {
          var liveMeta = cache.fd.liveMeta || (cache.fd.liveMeta = {});
          var lm = liveMeta[t.m.id] || (liveMeta[t.m.id] = {});
          lm.clock = parsed.clock;
          lm.clockTs = Date.now();   // Frische der Uhr für den Stale-Schutz
        }
      } catch (e) {
        // Fehler: erst in ~1 Minute erneut versuchen statt sofort.
        tlTs[t.m.id] = Date.now() - TTL_FIFA_TL + 60 * 1000;
      }
    }
  }

  // Exakte Spielminute aus dem FIFA-Live-Endpunkt: dessen Feld MatchTime
  // ("45+6'") ist genau die Uhr, die auch die offizielle Anzeige verwendet —
  // robuster als die aus Timeline-Markern hochgerechnete Minute (clockFromTimeline),
  // die um 1–2 Minuten abweichen kann. Period: 3 = 1. HZ, 5 = 2. HZ; andere
  // Werte (Halbzeit, Verlängerung, Spielende) überlässt sie clockFromTimeline.
  function clockFromLive(d) {
    if (!d) return null;
    var half = d.Period === 3 ? '1H' : d.Period === 5 ? '2H' : null;
    if (!half) return null;
    var mt = String(d.MatchTime == null ? '' : d.MatchTime).replace(/'/g, '').trim();
    if (!/^\d/.test(mt)) return null;
    return { half: half, elapsed: mt };
  }

  // Status/Minute laufender Spiele mit der ermittelten Uhr überschreiben
  // (FIFA-Live-MatchTime bevorzugt, sonst Timeline). Ohne Clock bleibt estimate() aktiv.
  function applyFifaClockOverlay(byMatchId, cache) {
    var liveMeta = cache.fd.liveMeta || {};
    var now = Date.now();
    var kickById = {};
    WM.store.matches().forEach(function (m) { kickById[m.id] = Date.parse(m.kickoffUtc); });
    Object.keys(byMatchId).forEach(function (id) {
      var b = byMatchId[id];
      if (!b.live) return;
      var meta = liveMeta[id];
      var clock = meta && meta.clock;
      if (!clock) return;
      // FIFA-Timeline meldet das Spielende: football-data hängt nur noch hinterher.
      // -> als beendet anzeigen statt einer hochlaufenden Schätz-Minute.
      if (clock.done) { b.live = false; b.finished = true; b.statusShort = 'FT'; b.elapsed = null; return; }
      // Stale-Schutz: liefert FIFA seit > 5 Min keine frische Uhr mehr und das
      // Spiel läuft real schon > 100 Min, ist es faktisch vorbei (Endmarker evtl.
      // verpasst). Verhindert eine eingefrorene/hochlaufende Falsch-Minute.
      var kick = kickById[id];
      if (meta.clockTs && (now - meta.clockTs) > 5 * 60 * 1000 &&
          kick && (now - kick) > 100 * 60 * 1000) {
        b.live = false; b.finished = true; b.statusShort = 'FT'; b.elapsed = null; return;
      }
      if (clock.half === 'HT') { b.statusShort = 'HT'; b.elapsed = null; }
      else if (clock.elapsed != null) { b.statusShort = clock.half; b.elapsed = clock.elapsed; }
    });
  }

  // Spielstand laufender Spiele mit den aus der FIFA-Timeline gezählten Toren
  // abgleichen: der football-data-Feed (fullTime-Score) aktualisiert sich nur
  // alle TTL_MATCHES, die FIFA-Timeline (refreshFifaEvents) oft schneller —
  // sonst zeigt die App z. B. "0:0", obwohl ein Tor (Elfmeter) bereits in der
  // Ereignis-Timeline/im Ticker auftaucht. Nimmt je Team das Maximum aus
  // beiden Quellen, damit der Stand niemals zurückfällt.
  function applyFifaScoreOverlay(byMatchId, cache) {
    var events = cache.fd.events || {};
    Object.keys(byMatchId).forEach(function (id) {
      var b = byMatchId[id];
      if (!b.live) return;
      var goals = events[id] && events[id].goals;
      if (!goals || !goals.length) return;
      var hg = 0, ag = 0;
      goals.forEach(function (g) {
        if (g.teamKey === b.homeKey) hg++;
        else if (g.teamKey === b.awayKey) ag++;
      });
      if (b.hg == null || hg > b.hg) b.hg = hg;
      if (b.ag == null || ag > b.ag) b.ag = ag;
    });
  }

  // ---- Torhüter (für "Weiße Westen") -----------------------------------------
  function isGoalkeeperPos(p) {
    if (p.Position === 0) return true;
    var pos = p.Position;
    if (typeof pos === 'string' && /goalkeeper|keeper|^gk$|torwart/i.test(pos)) return true;
    var loc = p.PositionLocalized && p.PositionLocalized[0] && p.PositionLocalized[0].Description;
    return !!(loc && /goalkeeper|keeper|^gk$|torwart/i.test(loc));
  }

  // Torhüter eines Teams aus den FIFA-Live-/Lineup-Daten: bevorzugt den
  // Startelf-Torhüter (Status 1), sonst den ersten gefundenen Ersatztorhüter.
  function extractKeeper(team) {
    var players = (team && team.Players) || [];
    var starter = null, sub = null;
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (!isGoalkeeperPos(p)) continue;
      var nm = p.PlayerName && p.PlayerName[0] && p.PlayerName[0].Description;
      if (!nm) continue;
      if (p.Status === 1) { starter = nm; break; }
      if (!sub) sub = nm;
    }
    return properName(starter || sub);
  }

  var FIFA_KEEPER_BACKFILL_PER_RUN = 3;

  // FIFA-Live-Endpunkt je Spiel abrufen und in cache.fd.liveMeta[matchId]
  // ablegen: Torhüter (homeKeeper/awayKeeper, für "Weiße Westen") und — bei
  // laufenden Spielen — die exakte Spieluhr (clockFromLive). Laufende Spiele
  // werden bei jedem Lauf abgerufen (die Uhr ändert sich ständig); für die
  // Torhüter beendeter Zu-Null-Spiele wird gedrosselt nachgeholt.
  async function refreshFifaKeepers(cache, byMatchId) {
    var map;
    try { map = await ensureFifaMap(cache); } catch (e) { return; }
    var liveMeta = cache.fd.liveMeta || (cache.fd.liveMeta = {});
    var backfill = 0;

    var matches = WM.store.matches();
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      var ref = map[m.id];
      var b = byMatchId[m.id];
      if (!ref || !b) continue;
      var meta = liveMeta[m.id] || (liveMeta[m.id] = {});
      var needKeeper = !(meta.homeKeeper && meta.awayKeeper);

      var cleanSheet = b.finished && b.hg != null && b.ag != null && (b.hg === 0 || b.ag === 0);
      // Live: immer holen (Uhr). Sonst nur für Torhüter-Backfill beendeter Zu-Null-Spiele.
      if (!b.live && !(needKeeper && cleanSheet)) continue;
      if (!b.live) {
        if (backfill >= FIFA_KEEPER_BACKFILL_PER_RUN) continue;
        backfill++;
      }

      try {
        var data = await fetchFifa('/live/football/17/285023/' + ref.is + '/' + ref.im + '?language=en');
        if (needKeeper) {
          meta.homeKeeper = extractKeeper(data.HomeTeam) || meta.homeKeeper || null;
          meta.awayKeeper = extractKeeper(data.AwayTeam) || meta.awayKeeper || null;
        }
        if (b.live) {
          var lc = clockFromLive(data);
          if (lc) { meta.clock = lc; meta.clockTs = Date.now(); }
        }
      } catch (e) {}
    }
  }

  // Clean-Sheet-Einträge um den Namen des Torhüters ergänzen: Erstes beendetes
  // Spiel mit Zu-Null des Teams, für das ein Torhütername bekannt ist.
  function enrichCleanSheets(cleanSheets, byMatchId, cache) {
    var liveMeta = cache.fd.liveMeta || {};
    cleanSheets.forEach(function (c) {
      var keeper = null;
      Object.keys(byMatchId).some(function (id) {
        var b = byMatchId[id];
        if (!b.finished || b.hg == null || b.ag == null) return false;
        var meta = liveMeta[id];
        if (!meta) return false;
        if (b.homeKey === c.teamKey && b.ag === 0 && meta.homeKeeper) { keeper = meta.homeKeeper; return true; }
        if (b.awayKey === c.teamKey && b.hg === 0 && meta.awayKeeper) { keeper = meta.awayKeeper; return true; }
        return false;
      });
      c.goalkeeper = keeper;
    });
  }

  // ---- Scorer-Punkte (Tore + Vorlagen) aus FIFA-Timelines ---------------------
  // football-data liefert für die WM 2026 keine Vorlagen (assists immer null) —
  // daher Tore+Vorlagen komplett aus cache.fd.events (FIFA-Timelines) berechnen.
  // Spielernamen zu Vorlagen-IDs werden einmalig per /players/{id} aufgelöst und
  // dauerhaft in cache.fd.players zwischengespeichert.
  async function fetchFifaPlayerName(cache, id) {
    if (!id) return null;
    var players = cache.fd.players || (cache.fd.players = {});
    if (players[id]) return players[id];
    try {
      var data = await fetchFifa('/players/' + id + '?language=en');
      var nm = data && data.Name && data.Name[0] && data.Name[0].Description;
      if (nm) { players[id] = properName(nm); return players[id]; }
    } catch (e) {}
    return null;
  }

  async function computeScorerPoints(cache) {
    var events = cache.fd.events || {};
    var totals = {};
    function add(teamKey, name, field) {
      if (!teamKey || !name) return;
      var key = teamKey + '|' + name;
      var entry = totals[key] || (totals[key] = { name: name, teamKey: teamKey, goals: 0, assists: 0 });
      entry[field]++;
    }
    for (var id in events) {
      var goals = events[id].goals || [];
      for (var i = 0; i < goals.length; i++) {
        var g = goals[i];
        if (!g.isOwnGoal && g.player) add(g.teamKey, g.player, 'goals');
        if (g.assistId) {
          var an = await fetchFifaPlayerName(cache, g.assistId);
          if (an) add(g.teamKey, an, 'assists');
        }
      }
    }
    return Object.keys(totals).map(function (k) {
      var e = totals[k];
      e.points = e.goals + e.assists;
      return e;
    });
  }

  // ---- Scorers / Tabellen ------------------------------------------------------
  function mapScorers(scorers) {
    return (scorers || []).map(function (s) {
      return {
        name: s.player && s.player.name,
        teamKey: canon(s.team && s.team.name),
        goals: s.goals || 0,
        assists: s.assists == null ? 0 : s.assists
      };
    }).filter(function (p) { return p.name && p.goals > 0; });
  }

  // Torschützenliste = Maximum aus beiden Quellen pro Spieler:
  //  - football-data /scorers liefert vollständige Turniertotale, hängt aber den
  //    gerade laufenden/eben beendeten Spielen hinterher (z. B. heutige Tore fehlen);
  //  - die FIFA-Timelines (scorerPoints) sind für abgerufene Partien aktueller,
  //    decken aber nicht zwingend alle Spiele ab.
  // Pro Spieler (teamKey|Name) das Maximum nehmen, damit weder ältere Tore
  // (football-data) noch frische Tore (FIFA) verloren gehen. So kann ein Spieler
  // nicht in der Scorer-, aber nicht in der Torschützenliste auftauchen.
  // Schlüssel OHNE Akzente/Diakritika, damit football-data ("Julián Quiñones")
  // und FIFA ("Julian Quinones") als EIN Spieler zusammenfallen (sonst Doppel-
  // eintrag in der Torschützenliste). Für die Anzeige wird der akzentuierte
  // (korrektere) Name bevorzugt.
  function mergeTopScorers(fdList, fifaList) {
    function deAccent(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
    function keyOf(p) { return p.teamKey + '|' + deAccent(p.name).toLowerCase().replace(/\s+/g, ' ').trim(); }
    function hasAccent(s) { return String(s || '') !== deAccent(s); }
    var byKey = {};
    function add(p, fromFifa) {
      if (fromFifa && !(p.goals > 0)) return;
      var k = keyOf(p), e = byKey[k];
      if (!e) {
        byKey[k] = { name: p.name, teamKey: p.teamKey, goals: p.goals || 0, assists: p.assists || 0 };
        return;
      }
      if ((p.goals || 0) > e.goals) e.goals = p.goals || 0;
      if ((p.assists || 0) > e.assists) e.assists = p.assists || 0;
      if (hasAccent(p.name) && !hasAccent(e.name)) e.name = p.name;   // akzentuierten Namen bevorzugen
    }
    (fdList || []).forEach(function (p) { add(p, false); });
    (fifaList || []).forEach(function (p) { add(p, true); });
    return Object.keys(byKey).map(function (k) { return byKey[k]; })
      .filter(function (p) { return p.goals > 0; });
  }

  function mapStandings(standings) {
    // group heißt je nach Endpoint "GROUP_A" oder "Group A" — beides akzeptieren.
    return (standings || []).filter(function (t) {
      return (!t.type || t.type === 'TOTAL') && /^group[ _][a-l]$/i.test(t.group || '');
    }).map(function (t) {
      return {
        group: t.group.slice(-1).toUpperCase(),
        rows: (t.table || []).map(function (r) {
          return {
            teamKey: canon(r.team && r.team.name),
            played: r.playedGames || 0, win: r.won || 0, draw: r.draw || 0, lose: r.lost || 0,
            gf: r.goalsFor || 0, ga: r.goalsAgainst || 0,
            gd: r.goalDifference != null ? r.goalDifference : (r.goalsFor || 0) - (r.goalsAgainst || 0),
            points: r.points || 0
          };
        })
      };
    });
  }

  // ---- Refresh ----------------------------------------------------------------
  async function refreshAll(force) {
    var cache = WM.store.loadCache();
    delete cache.openliga;             // Altlast der früheren OpenLigaDB-Version
    cache.fd = cache.fd || {};
    cache.ts = cache.ts || {};
    cache.fd.liveMeta = cache.fd.liveMeta || {};

    // Einmalige Migration: bereits gecachte FIFA-Ereignisse (final, werden nie
    // neu geholt) tragen noch Versalien-Nachnamen -> normalisieren.
    if (cache.fd.events && !cache.fd.eventsV2) {
      Object.keys(cache.fd.events).forEach(function (id) {
        (cache.fd.events[id].goals || []).forEach(function (g) { g.player = properName(g.player); });
        (cache.fd.events[id].reds || []).forEach(function (r) { r.player = properName(r.player); });
      });
      cache.fd.eventsV2 = 1;
    }

    // Einmalige Migration: gecachte FIFA-Timelines tragen noch kein assistId-Feld
    // (Vorlagen für die Scorer-Wertung) -> als nicht-final markieren, damit
    // refreshFifaEvents sie (gedrosselt) erneut abruft.
    if (cache.fd.events && !cache.fd.eventsV3) {
      Object.keys(cache.fd.events).forEach(function (id) {
        cache.fd.events[id].final = false;
      });
      cache.fd.eventsV3 = 1;
    }

    // Einmalige Migration: gecachte Tore tragen zwar assistId, aber noch keinen
    // aufgelösten Vorlagen-Namen (assist) -> beendete Spiele mit Vorlage einmal
    // erneut abrufen, damit "Vorlage: …" auch rückwirkend erscheint.
    if (cache.fd.events && !cache.fd.eventsV4) {
      Object.keys(cache.fd.events).forEach(function (id) {
        var hasUnresolved = (cache.fd.events[id].goals || []).some(function (g) {
          return g.assistId && !g.assist;
        });
        if (hasUnresolved) cache.fd.events[id].final = false;
      });
      cache.fd.eventsV4 = 1;
    }

    // Einmalige Migration: gecachte Tore/Karten tragen noch keine Spieler-ID
    // (scorerId) und damit nur den Nachnamen aus der Beschreibung -> alle Spiele
    // einmal erneut abrufen, damit Torschützen/Karten den vollen Namen bekommen.
    if (cache.fd.events && !cache.fd.eventsV5) {
      Object.keys(cache.fd.events).forEach(function (id) {
        var goals = cache.fd.events[id].goals || [];
        var reds = cache.fd.events[id].reds || [];
        var needs = goals.some(function (g) { return !g.scorerId; }) ||
                    reds.some(function (r) { return !r.scorerId; });
        if (needs) cache.fd.events[id].final = false;
      });
      cache.fd.eventsV5 = 1;
    }

    // Einmalige Migration: gecachte FIFA-Kalenderzuordnung ohne Ortszeit (loc)
    // -> Kalender beim nächsten Lauf neu laden.
    if (cache.fd.fifaMap && !cache.fd.fifaMapV2) {
      var hasLoc = Object.keys(cache.fd.fifaMap).some(function (id) { return cache.fd.fifaMap[id].loc; });
      if (!hasLoc) cache.ts.fifaCal = 0;
      cache.fd.fifaMapV2 = 1;
    }

    var now = Date.now();
    var error = null;

    var fresh = cache.fd.matches && cache.ts.matches && (now - cache.ts.matches < TTL_MATCHES);
    if (force || !fresh) {
      try {
        cache.fd.matches = (await fetchJson('/competitions/WC/matches')).matches || [];
        cache.ts.matches = Date.now();
      } catch (err) { error = err; }
    }

    var agg = aggregate(cache.fd.matches || []);

    // Torschützen + offizielle Tabellen seltener (eigene TTL, Fehler nicht fatal).
    // Läuft (laut Feed) gerade ein Spiel — oder hängt der matches-Feed bei
    // eigentlich laufenden Spielen — werden Tabellen UND Torschützen minütlich
    // statt nur alle 5 Min geholt, damit Tabelle/Statistik live mitlaufen.
    if (!error) {
      var liveActive = feedLagSuspected(agg.byMatchId) ||
        Object.keys(agg.byMatchId).some(function (id) { return agg.byMatchId[id].live; });
      var ttlSlow = liveActive ? 60 * 1000 : TTL_SLOW;
      var ttlStandings = ttlSlow;
      if (!(cache.ts.scorers && now - cache.ts.scorers < ttlSlow)) {
        try {
          cache.fd.scorers = (await fetchJson('/competitions/WC/scorers?limit=50')).scorers || [];
          cache.ts.scorers = Date.now();
        } catch (e) {}
      }
      if (!(cache.ts.standings && now - cache.ts.standings < ttlStandings)) {
        try {
          cache.fd.standings = (await fetchJson('/competitions/WC/standings')).standings || [];
          cache.ts.standings = Date.now();
        } catch (e) {}
      }
    }

    // FIFA-Ereignisse (Name + echte Minute) holen; wo vorhanden, ersetzen sie
    // das geschätzte goalLog-Protokoll. Fehler sind nie fatal (Bonus-Daten).
    // Vor dem Tabellen-Fallback, damit der dort geprüfte FIFA-Anstoß-Marker
    // (liveMeta.clock) aktuell ist.
    try { await refreshFifaEvents(cache, agg.byMatchId); } catch (e) {}

    var standings = mapStandings(cache.fd.standings);
    applyStandingsOverlay(agg.byMatchId, standings, cache);
    var log = updateGoalLog(cache, agg.byMatchId);

    // FIFA-Live-Daten (exakte Spieluhr + Torhüter) VOR dem Clock-Overlay holen,
    // damit applyFifaClockOverlay die offizielle MatchTime verwenden kann.
    try { await refreshFifaKeepers(cache, agg.byMatchId); } catch (e) {}
    applyFifaClockOverlay(agg.byMatchId, cache);
    applyFifaScoreOverlay(agg.byMatchId, cache);
    enrichCleanSheets(agg.cleanSheets, agg.byMatchId, cache);

    // Ortszeit-Anstoß (Stadion-Wanduhrzeit) je Spiel, aus dem FIFA-Kalender.
    var localKickoff = {};
    Object.keys(cache.fd.fifaMap || {}).forEach(function (id) {
      var ref = cache.fd.fifaMap[id];
      if (ref && ref.loc) localKickoff[id] = ref.loc;
    });

    var goalsByMatch = goalsFromLog(log);
    var redsByMatch = {};
    var fev = cache.fd.events || {};
    Object.keys(fev).forEach(function (id) {
      if (fev[id].goals && fev[id].goals.length) goalsByMatch[id] = fev[id].goals;
      if (fev[id].reds && fev[id].reds.length) redsByMatch[id] = fev[id].reds;
    });

    var scorerPoints = await computeScorerPoints(cache);

    WM.store.saveCache(cache);

    var live = {
      standings: standings,
      topscorers: mergeTopScorers(mapScorers(cache.fd.scorers), scorerPoints),
      topassists: [],
      scorerPoints: scorerPoints,
      localKickoff: localKickoff,
      cleanSheets: agg.cleanSheets,
      byMatchId: agg.byMatchId,
      goalsByMatch: goalsByMatch,
      redsByMatch: redsByMatch,
      ts: cache.ts,
      hasData: (cache.fd.matches || []).length > 0,
      ok: !error && (cache.fd.matches || []).length > 0,
      error: error ? error.message : null,
      errorCode: error ? error.code : null
    };
    WM.store.setLive(live);
    return live;
  }

  // Ereignisse eines Spiels (Tore + Platzverweise, chronologisch) aus dem
  // Store — kein extra Abruf nötig.
  function fetchEvents(matchId) {
    var L = WM.store.getLive();
    var items = ((L.goalsByMatch || {})[matchId] || []).map(function (g) {
      return {
        type: 'goal', team: g.teamKey, minute: g.minute, player: g.player,
        assist: g.assist || null, seq: g.seq,
        detail: g.isPenalty ? 'Penalty' : g.isOwnGoal ? 'Own Goal' : 'Normal Goal'
      };
    }).concat(((L.redsByMatch || {})[matchId] || []).map(function (r) {
      return { type: 'red', team: r.teamKey, minute: r.minute, player: r.player, detail: 'Red Card' };
    }));
    items.sort(function (a, b) { return WM.util.minuteVal(a.minute) - WM.util.minuteVal(b.minute); });
    return Promise.resolve(items);
  }

  WM.api = { refreshAll: refreshAll, fetchEvents: fetchEvents, FINISHED: FINISHED, LIVE: LIVE };
})(window.WM = window.WM || {});
