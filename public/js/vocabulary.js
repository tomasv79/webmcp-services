// The values a listing may have: categories, countries, cities, price units, languages and weekdays.
// The page, the tools and the form check against these; the database has the same categories and cities
// (scripts/seed.js writes them there), so a listing with any other value is refused on both sides.

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const PRICE_UNITS = ["hour", "job", "m2", "visit", "day"];
export const LANGUAGES = ["lt", "lv", "et", "en", "ru"];

export const countries = [
  { code: "LT", nameLt: "Lietuva", nameEn: "Lithuania" },
  { code: "LV", nameLt: "Latvija", nameEn: "Latvia" },
  { code: "EE", nameLt: "Estija", nameEn: "Estonia" },
];

export const categories = [
  { id: "plumbing", nameLt: "Santechnika", nameEn: "Plumbing" },
  { id: "electrical", nameLt: "Elektros darbai", nameEn: "Electrical work" },
  { id: "renovation", nameLt: "Remontas ir apdaila", nameEn: "Renovation and finishing" },
  { id: "cleaning", nameLt: "Valymas", nameEn: "Cleaning" },
  { id: "moving", nameLt: "Perkraustymas ir pervežimas", nameEn: "Moving and transport" },
  { id: "auto-repair", nameLt: "Automobilių remontas", nameEn: "Car repair" },
  { id: "appliance-repair", nameLt: "Buitinės technikos remontas", nameEn: "Appliance repair" },
  { id: "gardening", nameLt: "Aplinkos tvarkymas", nameEn: "Gardening and outdoor work" },
  { id: "beauty", nameLt: "Grožio paslaugos", nameEn: "Beauty services" },
  { id: "tutoring", nameLt: "Korepetitoriai ir mokymai", nameEn: "Tutoring and lessons" },
  { id: "it-support", nameLt: "IT ir kompiuterių remontas", nameEn: "IT support and computer repair" },
  { id: "photography", nameLt: "Fotografija", nameEn: "Photography" },
];

// Every city a listing can be in. A new service is added in one of these, so the city filter never changes.
export const cities = [
  { name: "Vilnius", country: "LT" },
  { name: "Kaunas", country: "LT" },
  { name: "Klaipėda", country: "LT" },
  { name: "Šiauliai", country: "LT" },
  { name: "Panevėžys", country: "LT" },
  { name: "Alytus", country: "LT" },
  { name: "Marijampolė", country: "LT" },
  { name: "Mažeikiai", country: "LT" },
  { name: "Jonava", country: "LT" },
  { name: "Utena", country: "LT" },
  { name: "Telšiai", country: "LT" },
  { name: "Tauragė", country: "LT" },
  { name: "Palanga", country: "LT" },
  { name: "Rīga", country: "LV" },
  { name: "Daugavpils", country: "LV" },
  { name: "Liepāja", country: "LV" },
  { name: "Jelgava", country: "LV" },
  { name: "Jūrmala", country: "LV" },
  { name: "Ventspils", country: "LV" },
  { name: "Rēzekne", country: "LV" },
  { name: "Valmiera", country: "LV" },
  { name: "Ogre", country: "LV" },
  { name: "Tallinn", country: "EE" },
  { name: "Tartu", country: "EE" },
  { name: "Narva", country: "EE" },
  { name: "Pärnu", country: "EE" },
  { name: "Kohtla-Järve", country: "EE" },
  { name: "Viljandi", country: "EE" },
  { name: "Rakvere", country: "EE" },
  { name: "Kuressaare", country: "EE" },
  { name: "Haapsalu", country: "EE" },
];

// Lithuanian and plain-ASCII names people use for the Latvian and Estonian cities, where they differ from the
// city name by more than diacritics.
export const cityAliases = {
  "Rīga": ["Ryga", "Riga"],
  "Daugavpils": ["Daugpilis"],
  "Liepāja": ["Liepoja"],
  "Tallinn": ["Talinas", "Tallinas"],
  "Pärnu": ["Pernu", "Piarnu"],
  "Ventspils": ["Ventspilis"],
  "Kohtla-Järve": ["Kohtla Jarve", "Kohtla Jervė"],
  "Viljandi": ["Viljandis"],
  "Kuressaare": ["Kuresarė"],
  "Haapsalu": ["Hapsalu"],
};
