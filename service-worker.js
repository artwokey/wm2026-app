/* service-worker.js — Offline-Precache der App-Schale + eingebauter Daten.
   Live-API-Aufrufe (football-data.org, api.fifa.com) werden NICHT abgefangen
   (immer Netzwerk). Livescore-Version: eigener Cache-Name mit Präfix
   wm2026-live-, damit auf gleichem Origin der Cache der Original-Version
   nicht gelöscht wird. */
var CACHE_PREFIX = 'wm2026-live-';
var CACHE = CACHE_PREFIX + 'v21';
var FLAG_CODES = ['dz','ar','au','at','be','ba','br','ca','cv','co','hr','cw','cz','cd','ec','eg',
  'gb-eng','fr','de','gh','ht','ir','iq','ci','jp','jo','mx','ma','nl','nz','no','pa','py','pt',
  'qa','sa','gb-sct','sn','za','kr','es','se','ch','tn','tr','uy','us','uz'];
var ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'datenschutz.html',
  'impressum.html',
  'assets/css/app.css',
  'assets/js/util.js',
  'assets/js/teams.js',
  'assets/js/store.js',
  'assets/js/api.js',
  'assets/js/live.js',
  'assets/js/schedule.js',
  'assets/js/standings.js',
  'assets/js/stats.js',
  'assets/js/knockout.js',
  'assets/js/settings.js',
  'assets/js/app.js',
  'assets/data/tournament.json',
  'assets/data/tournament.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png'
].concat(FLAG_CODES.map(function (c) { return 'assets/flags/' + c + '.svg'; }));

self.addEventListener('install', function (e) {
  // cache:'reload' umgeht den HTTP-Cache des Browsers — sonst können beim
  // Versions-Wechsel veraltete Dateien in den neuen Precache gelangen.
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(ASSETS.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    // Nur eigene (Präfix-)Caches aufräumen – den Cache der Original-Version nicht anfassen.
    return Promise.all(keys.filter(function (k) {
      return k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE;
    }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // Fremd-Hosts (Live-API, Spielerfotos) durchreichen.
  if (url.origin !== self.location.origin) return;

  // App-Shell/Daten: cache-first, im Hintergrund auffrischen.
  e.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
