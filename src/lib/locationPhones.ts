// Per-location contact numbers shown on printed truck tickets.
// `location` on a ticket is the order's depot/state name (e.g. "Calabar Soroman
// Depot", "Dangote Lagos — Soroman Ticket") — match by keyword, most specific
// entries first, since several locations share a city name.
//
// NOTE: these are placeholder numbers — replace with the real per-location
// contact numbers when available.
const LOCATION_PHONE_RULES: { keywords: string[]; phones: string }[] = [
  { keywords: ['dangote', 'lagos'], phones: '08066359104, 08036360577' },
  { keywords: ['dangote', 'refinery'], phones: '08066359104, 08036360577' },
  { keywords: ['calabar'], phones: '09030252499' },
  { keywords: ['port harcourt'], phones: '08023982277' },
  // { keywords: ['warri', 'keonamex'], phones: '08055555501, 08055555502' },
  // { keywords: ['warri', 'pinnacle'], phones: '08066666601, 08066666602' },
  // { keywords: ['warri'], phones: '08077777701, 08077777702' },
  { keywords: ['lagos'], phones: '07060659524' },
];

// Shown when a ticket's location doesn't match any rule above.
const DEFAULT_PHONES = '07060659524, 08035370741, 08021215027, 08023982277, 08036360577, 08036711324';

export const resolveLocationPhones = (location: string | null | undefined): string => {
  const loc = (location || '').toLowerCase();
  if (!loc) return DEFAULT_PHONES;
  const rule = LOCATION_PHONE_RULES.find(r => r.keywords.every(k => loc.includes(k)));
  return rule ? rule.phones : DEFAULT_PHONES;
};
