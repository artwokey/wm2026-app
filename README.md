# WM 2026 Spielplan & Live

Eine installierbare App (PWA) zur Verfolgung der Fußball-Weltmeisterschaft 2026
(USA · Kanada · Mexiko, 11.06.–19.07.2026). Mit Live-Tab (laufende Spiele, Auto-Aktualisierung,
Tor-Ticker, Tor-Benachrichtigung).

> Inoffizielle, werbefreie Fan-App. Nicht mit der FIFA oder offiziellen Veranstaltern verbunden.
> Alle Marken gehören ihren Inhabern.

## Funktionen

- **Spielplan** – alle 104 Spiele, **Anstoßzeiten in deutscher Zeit** (Europe/Berlin, automatisch
  CEST/CET), Filter nach Gruppe/Phase und Team, „Heute“-Sprung, Live-Score-Anzeige.
- **Tabellen** – alle **12 Gruppen (A–L)** mit Sp/S/U/N/Toren/Diff/Punkten, Markierung der
  Qualifizierten (Top 2 + 8 beste Gruppendritte).
- **Statistik** – **Torschützenliste mit Toren und Vorlagen** (football-data.org liefert Assists)
  und **Weiße Westen** (Spiele zu Null je Mannschaft/Torhüter).
- **Live-Ticker mit echten Ereignissen** – Tore und **Platzverweise** mit Spielername und Minute
  (FIFA-API); im Spielplan zeigt ein rotes Karten-Symbol Platzverweise je Team.
- **Countdown** – ab ~1 Stunde vor Anstoß erscheint die Partie im Live-Tab als Karte
  („Spiel beginnt in X Minuten").
- **Echte Länderflaggen** (lokale SVGs) überall neben den Teamnamen – sichtbar auf Windows, Android und offline.
- **K.-o.-Baum** – Sechzehntelfinale bis Finale; Platzhalter werden durch echte Paarungen ersetzt,
  sobald sie feststehen.
- **Match-Detail** – auf ein Spiel tippen: Ort, Anstoß (dt. Zeit), Ergebnis/Status und auf Wunsch
  die Torschützen des Spiels.

## Daten

- **Eingebaut (offline):** kompletter Spielplan, alle Gruppen und Anstoßzeiten
  (Quelle: `openfootball/worldcup.json`, Public Domain). Funktioniert ohne Internet.
- **Live (über Cloudflare Worker):** Spielstände, Torschützen und offizielle
  Gruppentabellen von **football-data.org**, abgerufen über einen **Cloudflare Worker**
  (`…workers.dev`), der den API-Token serverseitig hält — **kein API-Token im Client oder Repo**.
  Die Weißen Westen werden daraus berechnet. Datenbereitstellung: football-data.org.
- **Ereignisse (ohne Schlüssel):** Tore und Platzverweise mit Spielername und echter Minute von der
  öffentlichen **FIFA-API** (`api.fifa.com`, Competition 17 / Saison 285023). Beendete Spiele werden
  einmalig abgerufen und dauerhaft gecacht (`wm:cache → fd.events`).
- **Fallback:** Sind die FIFA-Ereignisse nicht erreichbar, erkennt der Tor-Ticker Tore an
  Spielstand-Änderungen zwischen zwei football-data-Abrufen (Minute geschätzt „~12", ohne Name).
- **CORS:** Der Cloudflare Worker setzt `Access-Control-Allow-Origin: *` — die Web-App läuft daher
  auf jedem Origin (auch GitHub Pages); `api.fifa.com` erlaubt ohnehin jeden Origin (`*`). In der
  APK-WebView gibt es keine CORS-Prüfung.

## Lokal starten / testen

Die App ist statisch (kein Build nötig). Über einen kleinen Webserver öffnen:

```powershell
# eine der folgenden Varianten im Projektordner:
python -m http.server 8080
# oder
npx serve .
```

Dann `http://localhost:8080` im Browser öffnen. (Ein Webserver ist nötig, weil Service Worker und
`fetch` nicht über `file://` laufen.)

## Live-Daten

Die App holt Spielstände, Torschützen und Tabellen automatisch von **football-data.org**
(kostenloser Tarif, 10 Anfragen/Minute; der API-Token steckt in `assets/js/api.js`). Über
**Mehr → Jetzt aktualisieren** oder den ↻-Button oben rechts manuell auffrischen. Antworten
werden kurz gecacht (TTL) und für den Offline-Betrieb gespeichert.

> Hinweis: Vor Turnierbeginn liegen noch keine Ergebnisse vor – Spielplan, Gruppen und Anstoßzeiten
> sind aber vollständig sichtbar. Tabellen/Listen füllen sich, sobald Spiele gewertet sind.

## Android-App (.apk)

Eine fertige, signierte **`WM2026.apk`** (≈0,44 MB) ist bereits gebaut und liegt im Projektordner
(sowie in *Downloads* und auf dem *Desktop*). Sie ist eine eigenständige **WebView-App**, in die
die komplette Web-App (inkl. Spielplan, Flaggen) eingebettet ist – läuft sofort offline, Live-Daten
holt sie bei Internet von football-data.org.

**Installieren (Sideload):**
1. `WM2026.apk` aufs Android-Gerät kopieren (USB, Mail an sich selbst, Cloud …).
2. Datei antippen; Android fragt nach **„Installation aus unbekannten Quellen erlauben“** → für die
   verwendete App (Dateimanager/Browser) zulassen.
3. Installieren, „WM 2026“ öffnen.

> Paket-ID `com.wm2026.tracker`, min-SDK 23 (Android 6.0+), Debug-signiert. Für eine Veröffentlichung
> im Play Store wäre ein eigener Release-Key + `.aab` nötig.


## Projektstruktur

```
index.html              App-Schale + Navigation
manifest.json           PWA-Manifest
service-worker.js       Offline-Precache
assets/css/app.css      Styling (dunkles WM-Theme)
assets/js/util.js       Zeit (dt.)/Status/HTML-Helfer
assets/js/teams.js      Team-Metadaten (Deutsch, Flagge), Namens-Matching
assets/js/store.js      Daten laden, Live-Merge, localStorage
assets/js/api.js        football-data.org (Spielstände/Torschützen/Tabellen) + Cache
assets/js/schedule.js   Spielplan
assets/js/standings.js  Gruppentabellen
assets/js/stats.js      Torschützen / Weiße Westen
assets/js/knockout.js   K.-o.-Baum
assets/js/settings.js   Einstellungen
assets/js/app.js        Orchestrierung
assets/data/tournament.json  Eingebauter Spielplan (104 Spiele, dt. Zeit aus UTC)
assets/flags/           48 Länderflaggen (SVG, lokal/offline)
```
