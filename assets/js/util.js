/* util.js — gemeinsame Helfer: deutsche Zeit (Europe/Berlin), Status-Labels, DOM. */
(function (WM) {
  'use strict';

  var TZ = 'Europe/Berlin';
  var fmtT   = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  var fmtDay = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' });
  var fmtFull= new Intl.DateTimeFormat('de-DE', { timeZone: TZ, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  var fmtKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

  function d(iso) { return new Date(iso); }
  function time(iso) { try { return fmtT.format(d(iso)) + ' Uhr'; } catch (e) { return ''; } }
  function dayHeader(iso) { try { return fmtDay.format(d(iso)); } catch (e) { return ''; } }
  function fullDate(iso) { try { return fmtFull.format(d(iso)); } catch (e) { return ''; } }
  function dayKey(iso) { try { return fmtKey.format(d(iso)); } catch (e) { return ''; } }   // yyyy-mm-dd (Berlin)
  function todayKey() { return fmtKey.format(new Date()); }

  var STATUS = {
    NS:  '',          TBD: '',
    '1H':'LIVE',      HT: 'Halbzeit',  '2H':'LIVE',  ET:'Verläng.',  BT:'Pause',
    P:   'Elfmeter',  LIVE:'LIVE',
    FT:  'Beendet',   AET:'n.V.',      PEN:'i.E.',
    PST: 'Verschoben',CANC:'Abgesagt', ABD:'Abgebr.', SUSP:'Unterbr.', AWD:'Gewertet', WO:'Gewertet'
  };
  function statusLabel(short, elapsed) {
    if ((short === '1H' || short === '2H' || short === 'ET') && elapsed != null) return elapsed + "'";
    return STATUS[short] != null ? STATUS[short] : (short || '');
  }
  function isLiveStatus(short) { return short === '1H' || short === '2H' || short === 'ET' || short === 'HT' || short === 'P' || short === 'BT' || short === 'LIVE'; }
  function isFinishedStatus(short) { return short === 'FT' || short === 'AET' || short === 'PEN'; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }

  // Spielminute ("45", "~52", "90+2") -> sortierbarer Zahlenwert.
  function minuteVal(min) {
    var m = /^~?(\d+)(?:\+(\d+))?/.exec(String(min == null ? '' : min));
    return m ? parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) / 100 : 0) : 9999;
  }

  var ROUND_DE = {
    'Round of 32': 'Sechzehntelfinale',
    'Round of 16': 'Achtelfinale',
    'Quarter-final': 'Viertelfinale',
    'Semi-final': 'Halbfinale',
    'Match for third place': 'Spiel um Platz 3',
    'Final': 'Finale'
  };
  function roundDe(round) { return ROUND_DE[round] || round || ''; }

  // FIFA-Kalender liefert LocalDate als Ortszeit-Wanduhrzeit des Stadions, aber
  // mit irreführendem "Z"-Suffix (keine echte UTC-Zeit) — daher als Roh-String
  // parsen statt über Date/Zeitzone.
  function localTime(localIso) {
    var m = /T(\d{2}):(\d{2})/.exec(String(localIso == null ? '' : localIso));
    return m ? (m[1] + ':' + m[2] + ' Uhr') : '';
  }

  WM.util = {
    TZ: TZ, time: time, dayHeader: dayHeader, fullDate: fullDate, dayKey: dayKey, todayKey: todayKey,
    statusLabel: statusLabel, isLiveStatus: isLiveStatus, isFinishedStatus: isFinishedStatus,
    esc: esc, el: el, roundDe: roundDe, minuteVal: minuteVal, localTime: localTime
  };
})(window.WM = window.WM || {});
