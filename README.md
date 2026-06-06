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
- **Statistik** – **Torschützenliste** und **Weiße Westen** (Spiele zu Null je Mannschaft/Torhüter).
  Eine Scorer-/Vorlagenwertung ist nicht enthalten, da die kostenlose Datenquelle keine Assists liefert.
- **Echte Länderflaggen** (lokale SVGs) überall neben den Teamnamen – sichtbar auf Windows, Android und offline.
- **K.-o.-Baum** – Sechzehntelfinale bis Finale; Platzhalter werden durch echte Paarungen ersetzt,
  sobald sie feststehen.
- **Match-Detail** – auf ein Spiel tippen: Ort, Anstoß (dt. Zeit), Ergebnis/Status und auf Wunsch
  die Torschützen des Spiels.

## Daten

- **Eingebaut (offline):** kompletter Spielplan, alle Gruppen und Anstoßzeiten
  (Quelle: `openfootball/worldcup.json`, Public Domain). Funktioniert ohne Internet.
- **Live (kostenlos, ohne Schlüssel):** Ergebnisse und Torschützen von **OpenLigaDB**
  (`api.openligadb.de`). Alle 12 Gruppentabellen und die Weißen Westen werden daraus berechnet.
- **Einschränkung:** OpenLigaDB liefert keine Assists – daher gibt es keine Scorer-/Vorlagenwertung.

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

Nichts einzurichten: Die App holt Ergebnisse und Torschützen automatisch von **OpenLigaDB**
(kostenlos, ohne Anmeldung). Über **Mehr → Jetzt aktualisieren** oder den ↻-Button oben rechts
manuell auffrischen. Antworten werden kurz gecacht (TTL) und für den Offline-Betrieb gespeichert.

> Hinweis: Vor Turnierbeginn liegen noch keine Ergebnisse vor – Spielplan, Gruppen und Anstoßzeiten
> sind aber vollständig sichtbar. Tabellen/Listen füllen sich, sobald Spiele gewertet sind.

## Android-App (.apk)

Eine fertige, signierte **`WM2026.apk`** (≈0,44 MB) ist bereits gebaut und liegt im Projektordner
(sowie in *Downloads* und auf dem *Desktop*). Sie ist eine eigenständige **WebView-App**, in die
die komplette Web-App (inkl. Spielplan, Flaggen) eingebettet ist – läuft sofort offline, Live-Daten
holt sie bei Internet von OpenLigaDB.

**Installieren (Sideload):**
1. `WM2026.apk` aufs Android-Gerät kopieren (USB, Mail an sich selbst, Cloud …).
2. Datei antippen; Android fragt nach **„Installation aus unbekannten Quellen erlauben“** → für die
   verwendete App (Dateimanager/Browser) zulassen.
3. Installieren, „WM 2026“ öffnen.

> Paket-ID `com.wm2026.tracker`, min-SDK 23 (Android 6.0+), Debug-signiert. Für eine Veröffentlichung
> im Play Store wäre ein eigener Release-Key + `.aab` nötig.

### Selbst neu bauen

Der Build läuft ohne Android Studio/Gradle über ein schlankes Skript
(`C:\WMBuild\build-apk.ps1`): `aapt` → `javac` → `d8` → `aapt add` → `zipalign` → `apksigner`.
Voraussetzungen (einmalig nach `C:\WMBuild` installiert): JDK 17 + Android cmdline-tools,
`platforms;android-34`, `build-tools;34.0.0`. Das Android-Projekt (WebView-Hülle) liegt unter
`C:\WMBuild\app`, die eingebettete Web-App unter `C:\WMBuild\app\assets\app`.

## Projektstruktur

```
index.html              App-Schale + Navigation
manifest.json           PWA-Manifest
service-worker.js       Offline-Precache
assets/css/app.css      Styling (dunkles WM-Theme)
assets/js/util.js       Zeit (dt.)/Status/HTML-Helfer
assets/js/teams.js      Team-Metadaten (Deutsch, Flagge), Namens-Matching
assets/js/store.js      Daten laden, Live-Merge, localStorage
assets/js/api.js        OpenLigaDB (Ergebnisse/Torschützen) + Cache
assets/js/schedule.js   Spielplan
assets/js/standings.js  Gruppentabellen
assets/js/stats.js      Torschützen / Weiße Westen
assets/js/knockout.js   K.-o.-Baum
assets/js/settings.js   Einstellungen
assets/js/app.js        Orchestrierung
assets/data/tournament.json  Eingebauter Spielplan (104 Spiele, dt. Zeit aus UTC)
assets/flags/           48 Länderflaggen (SVG, lokal/offline)
```
