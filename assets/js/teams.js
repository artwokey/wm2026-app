/* teams.js — Team-Metadaten (Deutsch, Flagge, Code) + Namens-Normalisierung
   für das Matching von Live-Daten (API-Football) auf die eingebauten Daten. */
(function (WM) {
  'use strict';

  // Sonderflaggen (Tag-Sequenzen) ohne Encoding-Risiko per Codepoint erzeugt.
  var FLAG_ENG = String.fromCodePoint(0x1F3F4, 0xE0067, 0xE0062, 0xE0065, 0xE006E, 0xE0067, 0xE007F);
  var FLAG_SCT = String.fromCodePoint(0x1F3F4, 0xE0067, 0xE0062, 0xE0073, 0xE0063, 0xE0074, 0xE007F);

  // Englischer Name (wie in tournament.json) -> Anzeige (Deutsch), 3-Letter-Code, ISO-2 (für Flagge)
  var META = {
    'Algeria':              { de: 'Algerien',            code: 'ALG', iso2: 'DZ' },
    'Argentina':            { de: 'Argentinien',         code: 'ARG', iso2: 'AR' },
    'Australia':            { de: 'Australien',          code: 'AUS', iso2: 'AU' },
    'Austria':              { de: 'Österreich',          code: 'AUT', iso2: 'AT' },
    'Belgium':              { de: 'Belgien',             code: 'BEL', iso2: 'BE' },
    'Bosnia & Herzegovina': { de: 'Bosnien-Herzegowina', code: 'BIH', iso2: 'BA' },
    'Brazil':               { de: 'Brasilien',           code: 'BRA', iso2: 'BR' },
    'Canada':               { de: 'Kanada',              code: 'CAN', iso2: 'CA' },
    'Cape Verde':           { de: 'Kap Verde',           code: 'CPV', iso2: 'CV' },
    'Colombia':             { de: 'Kolumbien',           code: 'COL', iso2: 'CO' },
    'Croatia':              { de: 'Kroatien',            code: 'CRO', iso2: 'HR' },
    'Curaçao':              { de: 'Curaçao',             code: 'CUW', iso2: 'CW' },
    'Czech Republic':       { de: 'Tschechien',          code: 'CZE', iso2: 'CZ' },
    'DR Congo':             { de: 'DR Kongo',            code: 'COD', iso2: 'CD' },
    'Ecuador':              { de: 'Ecuador',             code: 'ECU', iso2: 'EC' },
    'Egypt':                { de: 'Ägypten',             code: 'EGY', iso2: 'EG' },
    'England':              { de: 'England',             code: 'ENG', iso2: 'GB-ENG' },
    'France':               { de: 'Frankreich',          code: 'FRA', iso2: 'FR' },
    'Germany':              { de: 'Deutschland',         code: 'GER', iso2: 'DE' },
    'Ghana':                { de: 'Ghana',               code: 'GHA', iso2: 'GH' },
    'Haiti':                { de: 'Haiti',               code: 'HAI', iso2: 'HT' },
    'Iran':                 { de: 'Iran',                code: 'IRN', iso2: 'IR' },
    'Iraq':                 { de: 'Irak',                code: 'IRQ', iso2: 'IQ' },
    'Ivory Coast':          { de: 'Elfenbeinküste',      code: 'CIV', iso2: 'CI' },
    'Japan':                { de: 'Japan',               code: 'JPN', iso2: 'JP' },
    'Jordan':               { de: 'Jordanien',           code: 'JOR', iso2: 'JO' },
    'Mexico':               { de: 'Mexiko',              code: 'MEX', iso2: 'MX' },
    'Morocco':              { de: 'Marokko',             code: 'MAR', iso2: 'MA' },
    'Netherlands':          { de: 'Niederlande',         code: 'NED', iso2: 'NL' },
    'New Zealand':          { de: 'Neuseeland',          code: 'NZL', iso2: 'NZ' },
    'Norway':               { de: 'Norwegen',            code: 'NOR', iso2: 'NO' },
    'Panama':               { de: 'Panama',              code: 'PAN', iso2: 'PA' },
    'Paraguay':             { de: 'Paraguay',            code: 'PAR', iso2: 'PY' },
    'Portugal':             { de: 'Portugal',            code: 'POR', iso2: 'PT' },
    'Qatar':                { de: 'Katar',               code: 'QAT', iso2: 'QA' },
    'Saudi Arabia':         { de: 'Saudi-Arabien',       code: 'KSA', iso2: 'SA' },
    'Scotland':             { de: 'Schottland',          code: 'SCO', iso2: 'GB-SCT' },
    'Senegal':              { de: 'Senegal',             code: 'SEN', iso2: 'SN' },
    'South Africa':         { de: 'Südafrika',           code: 'RSA', iso2: 'ZA' },
    'South Korea':          { de: 'Südkorea',            code: 'KOR', iso2: 'KR' },
    'Spain':                { de: 'Spanien',             code: 'ESP', iso2: 'ES' },
    'Sweden':               { de: 'Schweden',            code: 'SWE', iso2: 'SE' },
    'Switzerland':          { de: 'Schweiz',             code: 'SUI', iso2: 'CH' },
    'Tunisia':              { de: 'Tunesien',            code: 'TUN', iso2: 'TN' },
    'Turkey':               { de: 'Türkei',              code: 'TUR', iso2: 'TR' },
    'Uruguay':              { de: 'Uruguay',             code: 'URU', iso2: 'UY' },
    'USA':                  { de: 'USA',                 code: 'USA', iso2: 'US' },
    'Uzbekistan':           { de: 'Usbekistan',          code: 'UZB', iso2: 'UZ' }
  };

  // Abweichende Schreibweisen (v. a. API-Football) -> kanonischer Name in META.
  var ALIASES = {
    'korea republic': 'South Korea',
    'republic of korea': 'South Korea',
    'united states': 'USA',
    'united states of america': 'USA',
    'turkiye': 'Turkey',
    'cote divoire': 'Ivory Coast',
    'congo dr': 'DR Congo',
    'democratic republic of congo': 'DR Congo',
    'czechia': 'Czech Republic',
    'cape verde islands': 'Cape Verde',
    'cabo verde': 'Cape Verde',
    'bosnia and herzegovina': 'Bosnia & Herzegovina',
    'curacao': 'Curaçao'
  };

  // Lowercase, Akzente entfernen, nur a-z0-9 + Leerzeichen.
  function normalize(name) {
    if (!name) return '';
    return String(name)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  // Vorberechnete Normalform -> kanonischer META-Schlüssel.
  var NORM_TO_KEY = {};
  Object.keys(META).forEach(function (k) {
    NORM_TO_KEY[normalize(k)] = k;             // englischer Name
    NORM_TO_KEY[normalize(META[k].de)] = k;    // deutscher Name (z. B. OpenLigaDB)
  });
  Object.keys(ALIASES).forEach(function (n) { NORM_TO_KEY[normalize(n)] = ALIASES[n]; });
  // Zusätzliche mögliche Schreibweisen (OpenLigaDB/diverse Quellen).
  var EXTRA_DE = {
    'kapverden': 'Cape Verde', 'kongo': 'DR Congo', 'demokratische republik kongo': 'DR Congo',
    'bosnien und herzegowina': 'Bosnia & Herzegovina', 'turkei': 'Turkey',
    'sudkorea': 'South Korea', 'korea republik': 'South Korea', 'vereinigte staaten': 'USA'
  };
  Object.keys(EXTRA_DE).forEach(function (n) { NORM_TO_KEY[normalize(n)] = EXTRA_DE[n]; });

  // Beliebigen (Live-)Namen auf kanonischen Schlüssel abbilden; sonst Original zurück.
  function canonical(name) {
    var n = normalize(name);
    return NORM_TO_KEY[n] || name;
  }

  function flagEmoji(iso2) {
    if (iso2 === 'GB-ENG') return FLAG_ENG;
    if (iso2 === 'GB-SCT') return FLAG_SCT;
    if (!iso2 || iso2.length !== 2) return '🏳️';
    var A = 0x1F1E6;
    return String.fromCodePoint(A + iso2.charCodeAt(0) - 65, A + iso2.charCodeAt(1) - 65);
  }

  // Lokale Flaggen-Bilder (rendern auf Windows, Android und offline – anders als Flaggen-Emojis).
  function flagFile(iso2) {
    if (iso2 === 'GB-ENG') return 'gb-eng';
    if (iso2 === 'GB-SCT') return 'gb-sct';
    return (iso2 || '').toLowerCase();
  }
  function flagImg(iso2, alt) {
    return '<img class="flag-img" src="assets/flags/' + flagFile(iso2) + '.svg" alt="' +
      (alt ? String(alt).replace(/"/g, '') : '') + '" loading="lazy">';
  }

  // Platzhalter (K.-o.) -> deutsche Beschriftung.
  function placeholderLabel(token) {
    if (/^[12][A-L]$/.test(token)) {
      return (token[0] === '1' ? 'Sieger Gr. ' : 'Zweiter Gr. ') + token[1];
    }
    if (/^3/.test(token)) return '3. Gr. ' + token.slice(1);
    if (/^W\d+$/.test(token)) return 'Sieger Spiel ' + token.slice(1);
    if (/^L\d+$/.test(token)) return 'Verlierer Spiel ' + token.slice(1);
    return token;
  }

  // Anzeige-Infos für einen (eingebauten oder Live-)Teamnamen.
  function info(name) {
    var key = canonical(name);
    var m = META[key];
    if (m) return { name: m.de, code: m.code, flag: flagImg(m.iso2, m.de), known: true, key: key };
    return { name: placeholderLabel(name), code: '', flag: '<span class="flag-ph">🏳</span>', known: false, key: name };
  }

  WM.teams = {
    META: META,
    info: info,
    canonical: canonical,
    normalize: normalize,
    flagEmoji: flagEmoji,
    flagImg: flagImg,
    placeholderLabel: placeholderLabel
  };
})(window.WM = window.WM || {});
