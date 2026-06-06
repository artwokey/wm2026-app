/* store.js — Lädt eingebaute Daten (tournament.json), hält Live-Daten,
   verwaltet localStorage (Cache + Einstellungen) und stellt abgeleitete
   Strukturen (Gruppen, Team->Gruppe) bereit. */
(function (WM) {
  'use strict';

  var LS_CACHE    = 'wm:cache';      // { openliga, ts:{...} }
  var GROUP_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L'];

  var state = {
    tournament: null,     // { name, season, matches: [...] }
    groups: {},           // 'A' -> [teamKey,...]
    teamGroup: {},        // teamKey -> 'A'
    live: {               // rohe API-Antworten + Ableitungen
      fixtures: null, standings: null, topscorers: null, topassists: null,
      cleanSheets: null, byMatchId: {}, ts: {}, ok: false, error: null
    }
  };

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  function loadCache() {
    try { return JSON.parse(lsGet(LS_CACHE) || '{}'); } catch (e) { return {}; }
  }
  function saveCache(obj) { lsSet(LS_CACHE, JSON.stringify(obj)); }
  function clearCache() { lsDel(LS_CACHE); state.live = { fixtures:null,standings:null,topscorers:null,topassists:null,cleanSheets:null,byMatchId:{},ts:{},ok:false,error:null }; }

  // Eingebaute Turnierdaten laden + Gruppen/Team-Zuordnung ableiten.
  // Bevorzugt das per <script> eingebettete Objekt (window.WM_TOURNAMENT) – das
  // funktioniert auch in der APK (file://), wo fetch() keine lokalen Dateien lädt.
  function loadTournament() {
    if (window.WM_TOURNAMENT && window.WM_TOURNAMENT.matches) {
      state.tournament = window.WM_TOURNAMENT;
      deriveGroups();
      return Promise.resolve(state.tournament);
    }
    return fetch('assets/data/tournament.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('tournament.json HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        state.tournament = data;
        deriveGroups();
        return data;
      });
  }

  function deriveGroups() {
    var groups = {}, teamGroup = {};
    GROUP_LETTERS.forEach(function (g) { groups[g] = []; });
    state.tournament.matches.forEach(function (m) {
      if (m.phase !== 'group') return;
      var g = m.group;
      [m.team1, m.team2].forEach(function (t) {
        var key = WM.teams.canonical(t);
        if (groups[g].indexOf(key) === -1) { groups[g].push(key); teamGroup[key] = g; }
      });
    });
    state.groups = groups;
    state.teamGroup = teamGroup;
  }

  function matches() { return state.tournament ? state.tournament.matches : []; }
  function groupMatches(letter) { return matches().filter(function (m) { return m.phase === 'group' && m.group === letter; }); }
  function koMatches() { return matches().filter(function (m) { return m.phase === 'ko'; }); }

  // Live-Daten (von api.js) hineinschreiben.
  function setLive(live) { state.live = Object.assign(state.live, live); }
  function getLive() { return state.live; }

  WM.store = {
    GROUP_LETTERS: GROUP_LETTERS,
    state: state,
    loadTournament: loadTournament,
    matches: matches,
    groupMatches: groupMatches,
    koMatches: koMatches,
    groups: function () { return state.groups; },
    teamGroup: function () { return state.teamGroup; },
    loadCache: loadCache,
    saveCache: saveCache,
    clearCache: clearCache,
    setLive: setLive,
    getLive: getLive
  };
})(window.WM = window.WM || {});
