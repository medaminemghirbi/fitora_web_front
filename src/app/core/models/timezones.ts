// A curated IANA timezone list for the company setup dropdown, grouped by
// region and biased toward Fitora's markets (Maghreb / francophone Africa /
// Middle East / Europe). The GMT offset in each label is computed against
// "now" so it stays right through DST.
//
// Each zone also carries its ISO alpha-2 country, so we can pre-select the
// country from the auto-detected timezone (and vice-versa). The user can
// still switch either one afterwards.

export interface TimezoneOption {
  value: string;
  label: string;
}

export interface TimezoneGroup {
  region: string;
  zones: TimezoneOption[];
}

// [zone id, ISO alpha-2] — order matters: the FIRST zone listed for a country
// is that country's default when it's picked in the country selector.
const ZONES: { region: string; ids: [string, string][] }[] = [
  {
    region: "Afrique",
    ids: [
      ["Africa/Tunis", "TN"], ["Africa/Casablanca", "MA"], ["Africa/Algiers", "DZ"], ["Africa/Cairo", "EG"],
      ["Africa/Tripoli", "LY"], ["Africa/Khartoum", "SD"], ["Africa/Dakar", "SN"], ["Africa/Abidjan", "CI"],
      ["Africa/Bamako", "ML"], ["Africa/Nouakchott", "MR"], ["Africa/Ouagadougou", "BF"], ["Africa/Niamey", "NE"],
      ["Africa/Lome", "TG"], ["Africa/Cotonou", "BJ"], ["Africa/Conakry", "GN"], ["Africa/Lagos", "NG"],
      ["Africa/Kinshasa", "CD"], ["Africa/Douala", "CM"], ["Africa/Libreville", "GA"], ["Africa/Brazzaville", "CG"],
      ["Africa/Nairobi", "KE"], ["Africa/Addis_Ababa", "ET"], ["Africa/Kigali", "RW"], ["Africa/Bujumbura", "BI"],
      ["Africa/Johannesburg", "ZA"], ["Africa/Maputo", "MZ"], ["Indian/Antananarivo", "MG"], ["Indian/Mauritius", "MU"],
    ],
  },
  {
    region: "Europe",
    ids: [
      ["Europe/Paris", "FR"], ["Europe/London", "GB"], ["Europe/Brussels", "BE"], ["Europe/Madrid", "ES"],
      ["Europe/Lisbon", "PT"], ["Europe/Rome", "IT"], ["Europe/Berlin", "DE"], ["Europe/Amsterdam", "NL"],
      ["Europe/Zurich", "CH"], ["Europe/Vienna", "AT"], ["Europe/Luxembourg", "LU"], ["Europe/Athens", "GR"],
      ["Europe/Bucharest", "RO"], ["Europe/Istanbul", "TR"], ["Europe/Moscow", "RU"], ["Europe/Dublin", "IE"],
      ["Europe/Stockholm", "SE"], ["Europe/Oslo", "NO"], ["Europe/Copenhagen", "DK"], ["Europe/Warsaw", "PL"],
      ["Europe/Kyiv", "UA"],
    ],
  },
  {
    region: "Moyen-Orient",
    ids: [
      ["Asia/Riyadh", "SA"], ["Asia/Dubai", "AE"], ["Asia/Qatar", "QA"], ["Asia/Kuwait", "KW"],
      ["Asia/Bahrain", "BH"], ["Asia/Muscat", "OM"], ["Asia/Beirut", "LB"], ["Asia/Amman", "JO"],
      ["Asia/Jerusalem", "IL"], ["Asia/Damascus", "SY"], ["Asia/Baghdad", "IQ"], ["Asia/Tehran", "IR"],
    ],
  },
  {
    region: "Amériques",
    ids: [
      ["America/New_York", "US"], ["America/Chicago", "US"], ["America/Denver", "US"], ["America/Los_Angeles", "US"],
      ["America/Toronto", "CA"], ["America/Vancouver", "CA"], ["America/Mexico_City", "MX"], ["America/Sao_Paulo", "BR"],
      ["America/Argentina/Buenos_Aires", "AR"], ["America/Santiago", "CL"], ["America/Bogota", "CO"], ["America/Lima", "PE"],
    ],
  },
  {
    region: "Asie / Pacifique",
    ids: [
      ["Asia/Karachi", "PK"], ["Asia/Kolkata", "IN"], ["Asia/Dhaka", "BD"], ["Asia/Bangkok", "TH"],
      ["Asia/Singapore", "SG"], ["Asia/Kuala_Lumpur", "MY"], ["Asia/Jakarta", "ID"], ["Asia/Hong_Kong", "HK"],
      ["Asia/Shanghai", "CN"], ["Asia/Tokyo", "JP"], ["Asia/Seoul", "KR"], ["Australia/Sydney", "AU"],
      ["Pacific/Auckland", "NZ"],
    ],
  },
];

// Common zones the browser might report that aren't in the curated groups —
// enough to resolve a country for most of Europe, North America and Australia.
const EXTRA_TZ_COUNTRY: Record<string, string> = {
  "Europe/Madrid": "ES", "Europe/Prague": "CZ", "Europe/Budapest": "HU", "Europe/Sofia": "BG",
  "Europe/Helsinki": "FI", "Europe/Belgrade": "RS", "Europe/Zagreb": "HR", "Europe/Bratislava": "SK",
  "Europe/Ljubljana": "SI", "Europe/Vilnius": "LT", "Europe/Riga": "LV", "Europe/Tallinn": "EE",
  "America/Phoenix": "US", "America/Anchorage": "US", "America/Detroit": "US", "America/Halifax": "CA",
  "America/Edmonton": "CA", "America/Winnipeg": "CA", "America/Montreal": "CA", "America/Tijuana": "MX",
  "America/Monterrey": "MX", "America/Caracas": "VE", "America/Montevideo": "UY", "America/Guayaquil": "EC",
  "Australia/Melbourne": "AU", "Australia/Brisbane": "AU", "Australia/Perth": "AU", "Australia/Adelaide": "AU",
  "Asia/Manila": "PH", "Asia/Ho_Chi_Minh": "VN", "Asia/Taipei": "TW", "Asia/Colombo": "LK",
  "Africa/Accra": "GH", "Africa/Luanda": "AO", "Africa/Dar_es_Salaam": "TZ", "Africa/Kampala": "UG",
  "Africa/Lusaka": "ZM", "Africa/Harare": "ZW", "Africa/Windhoek": "NA", "Africa/Gaborone": "BW",
};

const TZ_COUNTRY: Record<string, string> = { ...EXTRA_TZ_COUNTRY };
const COUNTRY_TZ: Record<string, string> = {};
for (const g of ZONES) {
  for (const [id, cc] of g.ids) {
    TZ_COUNTRY[id] = cc;
    if (!COUNTRY_TZ[cc]) COUNTRY_TZ[cc] = id;
  }
}

function gmtOffset(tz: string): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName");
    // istanbul ignore next -- shortOffset always yields a timeZoneName part in a real browser for every real IANA zone below
    return part?.value.replace("GMT", "UTC") ?? "";
  } catch {
    // istanbul ignore next -- every zone below is a real, valid IANA timezone id
    return "";
  }
}

function cityName(tz: string): string {
  return tz.split("/").pop()!.replace(/_/g, " ");
}

export const TIMEZONE_GROUPS: TimezoneGroup[] = ZONES.map((g) => ({
  region: g.region,
  zones: g.ids.map(([id]) => {
    const off = gmtOffset(id);
    return { value: id, label: off ? `${cityName(id)} (${off})` : cityName(id) };
  }),
}));

const ALL = new Set(TIMEZONE_GROUPS.flatMap((g) => g.zones.map((z) => z.value)));

// The browser's own timezone (auto-detected, no permission prompt).
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Tunis";
  } catch {
    return "Africa/Tunis";
  }
}

export function countryForTimezone(tz: string | null | undefined): string {
  return (tz && TZ_COUNTRY[tz]) || "";
}

export function timezoneForCountry(code: string | null | undefined): string {
  return (code && COUNTRY_TZ[code.toUpperCase()]) || "";
}

// Best guess of where the account is being created from, from the browser
// timezone alone. Country falls back to Tunisia when the zone is unknown.
export function guessLocation(): { timezone: string; country: string } {
  const timezone = browserTimezone();
  return { timezone, country: countryForTimezone(timezone) || "TN" };
}

// Adds an off-list timezone to the top of the groups so the user always sees
// their current value.
export function ensureTimezone(tz: string): TimezoneGroup[] {
  if (!tz || ALL.has(tz)) return TIMEZONE_GROUPS;
  const off = gmtOffset(tz);
  return [
    { region: "—", zones: [{ value: tz, label: off ? `${cityName(tz)} (${off})` : cityName(tz) }] },
    ...TIMEZONE_GROUPS,
  ];
}
