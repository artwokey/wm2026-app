# Play-Store-Veröffentlichung – Vorlagen & Checkliste

App: **WM 2026 Spielplan & Live** · inoffizielle, werbefreie Fan-App · Datenquelle football-data.org.

> Alle Texte unten sind ohne offiziellen Bezug formuliert und enthalten den Pflicht-Disclaimer.
> Vor dem Upload nur noch die **Datenschutz-URL** (Schritt B) eintragen.

---

## A) Store-Eintrag (Texte zum Kopieren)

**App-Name (max. 30 Zeichen):**
```
WM 2026 Spielplan & Live
```

**Kurzbeschreibung (max. 80 Zeichen):**
```
WM 2026: Spielplan, Live-Ticker, Tabellen & Statistik – werbefreie Fan-App.
```

**Vollständige Beschreibung (max. 4000 Zeichen):**
```
Behalte die Fußball-Weltmeisterschaft 2026 (USA · Kanada · Mexiko) im Blick – mit kompaktem Spielplan, Live-Ticker, Tabellen und Statistik. Werbefrei, ohne Anmeldung, ohne Tracking.

LIVE
• Eigener Live-Tab mit allen laufenden Spielen
• Countdown ab einer Stunde vor Anstoß („Spiel beginnt in X Minuten")
• Automatische Aktualisierung der Ergebnisse während der Spiele
• Tor-Ticker mit Minute und Torschütze, Platzverweise mit Spielername
• Optionale Benachrichtigung bei Toren

SPIELPLAN
• Alle 104 Begegnungen von der Gruppenphase bis zum Finale
• Anstoßzeiten in deutscher Zeit (automatisch Sommer-/Winterzeit)
• Filter nach Gruppe, Phase und Mannschaft, Sprung zu „Heute“

SPIELDETAILS
• Spielverlauf je Partie: Tore und Platzverweise mit Name und Minute
• Rote Karten-Symbole direkt im Spielplan

TABELLEN & STATISTIK
• Alle 12 Gruppentabellen (A–L) mit Punkten, Toren und Differenz
• Markierung der Qualifizierten inklusive bester Gruppendritter
• Torschützenliste und „Weiße Westen“ (Spiele ohne Gegentor)

K.-O.-RUNDE
• Übersichtlicher Turnierbaum vom Sechzehntelfinale bis zum Finale
• Platzhalter werden automatisch durch die echten Paarungen ersetzt

OFFLINE
• Spielplan, Gruppen und Anstoßzeiten sind eingebaut und funktionieren ohne Internet
• Live-Ergebnisse werden bei bestehender Verbindung geladen

Datenquellen: Spielplan von openfootball (Public Domain), Live-Ergebnisse von football-data.org, Spielereignisse von der öffentlichen FIFA-Schnittstelle.

Hinweis: Dies ist eine inoffizielle, werbefreie Fan-App. Sie steht in keiner Verbindung zur FIFA oder zu offiziellen Veranstaltern und verwendet keine offiziellen Logos oder Embleme. Alle Marken gehören ihren jeweiligen Inhabern.
```

**Kategorie:** Sport
**Tags/Genre:** Sport, Fußball, Ergebnisse
**Inhaltsbewertung (IARC-Fragebogen):** keine bedenklichen Inhalte → Einstufung „Jeder/USK 0“.
**Preis:** kostenlos · **Enthält Werbung:** Nein · **In-App-Käufe:** Nein

---

## B) Hosting über GitHub Pages — ERLEDIGT ✅

Die App inkl. `datenschutz.html` und `impressum.html` liegt im öffentlichen Repo
**https://github.com/artwokey/wm2026-app** und ist über GitHub Pages live:

| Seite | URL |
|-------|-----|
| App (Demo/PWA) | https://artwokey.github.io/wm2026-app/ |
| **Datenschutz** | **https://artwokey.github.io/wm2026-app/datenschutz.html** |
| Impressum | https://artwokey.github.io/wm2026-app/impressum.html |

**→ In der Play Console eintragen:** App-Inhalte → Datenschutzerklärung →
`https://artwokey.github.io/wm2026-app/datenschutz.html`

(Optional im Store-Eintrag unter „Website": dieselbe URL bzw. die App-URL.)

Aktualisieren später: Dateien im Repo ändern und neu pushen (`git push`), GitHub Pages baut automatisch neu.

---

## C) „Datensicherheit“-Formular (Play Console → App-Inhalte → Datensicherheit)

- **Erhebt oder teilt deine App Nutzerdaten?** → **Nein** (der Anbieter erhebt/überträgt keine
  personenbezogenen Daten; es gibt keine Accounts, kein Tracking, keine Werbung, keine Analyse).
- **Datenverschlüsselung bei der Übertragung:** Ja (Abruf der Live-Daten erfolgt per HTTPS).
- **Können Nutzer Löschung anfragen / Daten löschen?** Lokale Daten lassen sich in der App über
  „Cache leeren“ bzw. durch Löschen der App-Daten entfernen.
- Hinweis falls nachgefragt: Die App ruft Spieldaten von football-data.org (Drittanbieter) ab; dabei wird
  technisch bedingt die IP-Adresse an dessen Server übertragen. Dies ist in der Datenschutzerklärung
  beschrieben.

---

## D) Berechtigungen

- **Internet/Netzwerk:** für den Abruf der Live-Daten.
- **Benachrichtigungen (POST_NOTIFICATIONS, Android 13+):** optional, nur für Tor-Hinweise; lokal,
  kein Push-Dienst. In der Store-Beschreibung/Datensicherheit nicht als Datenerhebung zu deklarieren.

---

## E) Grafiken

- **App-Icon:** vorhandenes Icon (grüner Hintergrund, generischer Fußball, „WM 2026“) – keine
  geschützten/offiziellen Elemente. 512×512 PNG für den Store: aus `assets/icons/icon-512.png`.
- **Feature-Grafik (1024×500):** schlicht im App-Stil (dunkel/grün) mit App-Namen, ohne offizielle Logos.
- **Screenshots (Telefon, mind. 2):** Live-Tab mit laufenden Spielen, Spielplan, Gruppentabelle,
  K.-o.-Baum. Die bereits erstellten Aufnahmen eignen sich; Hochformat, mind. 1080 px Breite.

---

## F) Vor dem Upload noch nötig (separater Build-Schritt)

Die aktuelle `WM2026.apk` ist debug-signiert und trägt den alten Namen/das alte Paket. Für die
Veröffentlichung zusätzlich:

- App-Label auf **„WM 2026 Spielplan & Live“** setzen.
- Eigene, eindeutige `applicationId` wählen (z. B. `com.wm2026.live`) – muss dauerhaft eindeutig bleiben.
- `POST_NOTIFICATIONS`-Permission ergänzen (falls Tor-Benachrichtigungen aktiv bleiben sollen).
- **Release-Signatur** mit eigenem Upload-Key und Ausgabe als **Android App Bundle (.aab)**
  (Play akzeptiert keine Debug-Signatur). Build-Umgebung: siehe `C:\WMBuild`.

---

## G) Checkliste

- [ ] `datenschutz.html` + `impressum.html` auf GitHub Pages hochgeladen, URL erreichbar
- [ ] Datenschutz-URL in Play Console eingetragen
- [ ] Store-Texte (A) eingefügt, Disclaimer enthalten
- [ ] Datensicherheit-Formular (C) ausgefüllt: keine Datenerhebung
- [ ] Inhaltsbewertung-Fragebogen ausgefüllt
- [ ] Icon, Feature-Grafik, Screenshots hochgeladen
- [ ] Release-AAB mit neuem Namen/Paket + eigener Signatur erstellt (F)
