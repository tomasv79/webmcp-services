// Generates fictional listings from a fixed seed, so every page load and every test run sees exactly the same data
// without shipping a multi-megabyte file. The 60 hand-written listings in data.js stay as they are; this adds the rest.
//
// Everything produced here is invented: emails and websites use ".example", phone numbers start with 000.

import { listings as handWritten, categories } from "./data.js";

export const DEFAULT_SEED = 20261125;

// name, country, share of that country's listings, and the Lithuanian "in <city>".
// The names and countries repeat `cities` of the page's vocabulary.js; a test keeps the two the same.
export const CITIES = [
  { name: "Vilnius", country: "LT", weight: 30, locativeLt: "Vilniuje" },
  { name: "Kaunas", country: "LT", weight: 18, locativeLt: "Kaune" },
  { name: "Klaipėda", country: "LT", weight: 10, locativeLt: "Klaipėdoje" },
  { name: "Šiauliai", country: "LT", weight: 7, locativeLt: "Šiauliuose" },
  { name: "Panevėžys", country: "LT", weight: 6, locativeLt: "Panevėžyje" },
  { name: "Alytus", country: "LT", weight: 4, locativeLt: "Alytuje" },
  { name: "Marijampolė", country: "LT", weight: 3, locativeLt: "Marijampolėje" },
  { name: "Mažeikiai", country: "LT", weight: 3, locativeLt: "Mažeikiuose" },
  { name: "Jonava", country: "LT", weight: 2, locativeLt: "Jonavoje" },
  { name: "Utena", country: "LT", weight: 2, locativeLt: "Utenoje" },
  { name: "Telšiai", country: "LT", weight: 2, locativeLt: "Telšiuose" },
  { name: "Tauragė", country: "LT", weight: 2, locativeLt: "Tauragėje" },
  { name: "Palanga", country: "LT", weight: 2, locativeLt: "Palangoje" },
  { name: "Rīga", country: "LV", weight: 40, locativeLt: "Rygoje" },
  { name: "Daugavpils", country: "LV", weight: 10, locativeLt: "Daugpilyje" },
  { name: "Liepāja", country: "LV", weight: 9, locativeLt: "Liepojoje" },
  { name: "Jelgava", country: "LV", weight: 8, locativeLt: "Jelgavoje" },
  { name: "Jūrmala", country: "LV", weight: 7, locativeLt: "Jūrmaloje" },
  { name: "Ventspils", country: "LV", weight: 5, locativeLt: "Ventspilyje" },
  { name: "Rēzekne", country: "LV", weight: 4, locativeLt: "Rėzeknėje" },
  { name: "Valmiera", country: "LV", weight: 4, locativeLt: "Valmieroje" },
  { name: "Ogre", country: "LV", weight: 3, locativeLt: "Ogrėje" },
  { name: "Tallinn", country: "EE", weight: 40, locativeLt: "Taline" },
  { name: "Tartu", country: "EE", weight: 15, locativeLt: "Tartu" },
  { name: "Narva", country: "EE", weight: 8, locativeLt: "Narvoje" },
  { name: "Pärnu", country: "EE", weight: 8, locativeLt: "Pernu" },
  { name: "Kohtla-Järve", country: "EE", weight: 4, locativeLt: "Kohtla Jervėje" },
  { name: "Viljandi", country: "EE", weight: 3, locativeLt: "Viljandyje" },
  { name: "Rakvere", country: "EE", weight: 3, locativeLt: "Rakverėje" },
  { name: "Kuressaare", country: "EE", weight: 2, locativeLt: "Kuresarėje" },
  { name: "Haapsalu", country: "EE", weight: 2, locativeLt: "Hapsalu" },
];

const COUNTRY_WEIGHTS = [["LT", 50], ["LV", 25], ["EE", 25]];

const STREETS = {
  LT: ["Vytauto g.", "Gedimino pr.", "Laisvės al.", "Basanavičiaus g.", "Taikos pr.", "Pramonės g.", "Sodų g.", "Liepų g.", "Ąžuolų g.", "Mokyklos g.", "Stoties g.", "Parko g.", "Dariaus ir Girėno g.", "Birutės g.", "Maironio g.", "Žemaitės g.", "Draugystės g.", "Statybininkų g.", "Kęstučio g.", "Aušros g."],
  LV: ["Brīvības iela", "Lāčplēša iela", "Raiņa iela", "Dzirnavu iela", "Kalna iela", "Skolas iela", "Parka iela", "Liepu iela", "Ozolu iela", "Dārza iela", "Stacijas iela", "Jūras iela", "Meža iela", "Upes iela", "Zemgales prospekts", "Baznīcas iela"],
  EE: ["Pikk tänav", "Kooli tänav", "Aia tänav", "Pargi tänav", "Jaama tänav", "Mere puiestee", "Tööstuse tänav", "Vabaduse puiestee", "Kase tänav", "Tamme tänav", "Lille tänav", "Metsa tänav", "Posti tänav", "Turu tänav", "Kalda tee", "Raja tänav"],
};

// Company names are "<prefix> <noun>". Prefixes are possessive forms, so they fit any noun.
// No city names and no utility words (energy, heat, light, water): "<city> <utility>" is how real municipal
// companies are named. Generic combinations can still coincide with a real small business; the contacts never do.
const NAME_PREFIXES = {
  LT: ["Baltijos", "Šiaurės", "Vakarų", "Rytų", "Pietų", "Miesto", "Namų", "Pajūrio", "Aukštaitijos", "Žemaitijos", "Dzūkijos", "Suvalkijos", "Nemuno", "Neries", "Gintaro", "Saulės", "Ąžuolo", "Vėjo", "Ryto", "Meistrų", "Šeimos", "Sostinės", "Senamiesčio", "Uosto", "Marių", "Girios", "Kalno", "Upės", "Ežero", "Liepų"],
  LV: ["Baltijas", "Daugavas", "Kurzemes", "Vidzemes", "Latgales", "Zemgales", "Jūras", "Pilsētas", "Mājas", "Ziemeļu", "Dienvidu", "Austrumu", "Rietumu", "Saules", "Ozolu", "Dzintara", "Meistaru", "Ģimenes", "Gaujas", "Ventas", "Ostas", "Vecpilsētas", "Ezera", "Kalna", "Upes"],
  EE: ["Balti", "Põhja", "Lõuna", "Ida", "Lääne", "Mere", "Linna", "Kodu", "Päikese", "Tamme", "Meistrite", "Pere", "Saare", "Viru", "Lahe", "Sadama", "Vanalinna", "Emajõe", "Metsa", "Kivi", "Nurme", "Ranna", "Oru", "Mäe", "Jõe"],
};
const NAME_SUFFIXES = {
  LT: ["Plius", "Pro", "LT", "Grupė", "Centras"],
  LV: ["Plus", "Pro", "LV", "Grupa", "Centrs"],
  EE: ["Pluss", "Pro", "EE", "Grupp", "Keskus"],
};
const NAME_NOUNS = {
  plumbing: {
    LT: ["Santechnika", "Vamzdynai", "Čiaupai", "Santechnikos Meistrai", "Santechnikos Darbai", "Vamzdžių Meistrai", "Santechnikos Servisas"],
    LV: ["Santehnika", "Caurules", "Cauruļvadi", "Santehnikas Darbi", "Santehnikas Meistari"],
    EE: ["Torutööd", "Sanitaartehnika", "Veesüsteemid", "Torutööde Meistrid", "Torumehed"],
  },
  electrical: {
    LT: ["Elektros Darbai", "Instaliacija", "Elektrikai", "Elektros Linijos", "Elektros Meistrai", "Elektros Montavimas", "Elektros Servisas"],
    LV: ["Elektro", "Elektromontāža", "Elektriķi", "Elektro Meistari", "Elektro Serviss"],
    EE: ["Elektritööd", "Elektripaigaldus", "Elektrikud", "Elektrimeistrid", "Elektriabi"],
  },
  renovation: {
    LT: ["Apdaila", "Remontas", "Statyba", "Interjerai", "Meistrai", "Remonto Brigada", "Būsto Remontas"],
    LV: ["Remonts", "Apdare", "Būve", "Interjers", "Meistari"],
    EE: ["Remont", "Viimistlus", "Ehitus", "Interjöör", "Meistrid"],
  },
  cleaning: {
    LT: ["Švara", "Valymas", "Tvarka", "Švaros Paslaugos", "Blizgesys", "Švaros Komanda", "Valymo Servisas"],
    LV: ["Tīrība", "Uzkopšana", "Spodrība", "Tīrības Serviss", "Kārtība"],
    EE: ["Puhastus", "Koristus", "Puhtus", "Puhastusteenused", "Kord"],
  },
  moving: {
    LT: ["Pervežimai", "Perkraustymas", "Krovikai", "Transportas", "Logistika", "Kroviniai", "Vežėjai"],
    LV: ["Pārvadājumi", "Pārvākšanās", "Krāvēji", "Transports", "Loģistika"],
    EE: ["Veod", "Kolimine", "Laadijad", "Transport", "Logistika"],
  },
  "auto-repair": {
    LT: ["Autoservisas", "Automeistrai", "Ratai", "Variklis", "Autodirbtuvės", "Autocentras", "Autotechnika"],
    LV: ["Autoserviss", "Auto Meistari", "Riepas", "Motors", "Autocentrs"],
    EE: ["Autoteenindus", "Automeistrid", "Rehvid", "Mootor", "Autokeskus"],
  },
  "appliance-repair": {
    LT: ["Technikos Servisas", "Buitinė Technika", "Technikos Remontas", "Servisas", "Technikos Meistrai", "Remonto Centras", "Technika"],
    LV: ["Tehnikas Serviss", "Sadzīves Tehnika", "Remonta Centrs", "Serviss", "Tehnikas Meistari"],
    EE: ["Tehnikateenindus", "Kodutehnika", "Remondikeskus", "Hooldus", "Tehnikameistrid"],
  },
  gardening: {
    LT: ["Sodai", "Želdiniai", "Aplinka", "Veja", "Sodininkai", "Želdynai", "Kraštovaizdis"],
    LV: ["Dārzi", "Apzaļumošana", "Zāliens", "Dārznieki", "Ainava"],
    EE: ["Aiad", "Haljastus", "Muru", "Aednikud", "Maastik"],
  },
  beauty: {
    LT: ["Grožio Studija", "Grožio Salonas", "Kirpykla", "Grožio Namai", "Stilius", "SPA", "Grožio Erdvė"],
    LV: ["Skaistuma Studija", "Salons", "Frizētava", "Stils", "SPA"],
    EE: ["Ilustuudio", "Ilusalong", "Juuksurisalong", "Stiil", "SPA"],
  },
  tutoring: {
    LT: ["Mokymo Centras", "Akademija", "Mokykla", "Studija", "Žinios", "Kursai", "Mokslo Namai"],
    LV: ["Mācību Centrs", "Akadēmija", "Skola", "Studija", "Kursi"],
    EE: ["Õppekeskus", "Akadeemia", "Kool", "Stuudio", "Kursused"],
  },
  "it-support": {
    LT: ["IT Servisas", "Kompiuteriai", "IT Sprendimai", "Technologijos", "Sistemos", "Tinklai", "IT Pagalba"],
    LV: ["IT Serviss", "Datori", "IT Risinājumi", "Tehnoloģijas", "Tīkli"],
    EE: ["IT-teenindus", "Arvutid", "IT-lahendused", "Tehnoloogia", "Võrgud"],
  },
  photography: {
    LT: ["Foto Studija", "Kadrai", "Fotografija", "Akimirkos", "Objektyvas", "Vaizdai", "Foto Namai"],
    LV: ["Foto Studija", "Kadri", "Fotogrāfija", "Mirkļi", "Objektīvs"],
    EE: ["Fotostuudio", "Kaadrid", "Fotograafia", "Hetked", "Objektiiv"],
  },
};

// Sole traders are "<trade> <first name> <initial>.". Trades are [for a man, for a woman]; Estonian has one form.
const TRADES = {
  plumbing: { LT: ["Santechnikas", "Santechnikė"], LV: ["Santehniķis", "Santehniķe"], EE: ["Torumees", "Torumees"] },
  electrical: { LT: ["Elektrikas", "Elektrikė"], LV: ["Elektriķis", "Elektriķe"], EE: ["Elektrik", "Elektrik"] },
  renovation: { LT: ["Meistras", "Meistrė"], LV: ["Meistars", "Meistare"], EE: ["Meister", "Meister"] },
  cleaning: { LT: ["Valytojas", "Valytoja"], LV: ["Apkopējs", "Apkopēja"], EE: ["Koristaja", "Koristaja"] },
  moving: { LT: ["Vežėjas", "Vežėja"], LV: ["Pārvadātājs", "Pārvadātāja"], EE: ["Vedaja", "Vedaja"] },
  "auto-repair": { LT: ["Automechanikas", "Automechanikė"], LV: ["Automehāniķis", "Automehāniķe"], EE: ["Automehaanik", "Automehaanik"] },
  "appliance-repair": { LT: ["Technikos meistras", "Technikos meistrė"], LV: ["Tehnikas meistars", "Tehnikas meistare"], EE: ["Tehnikameister", "Tehnikameister"] },
  gardening: { LT: ["Sodininkas", "Sodininkė"], LV: ["Dārznieks", "Dārzniece"], EE: ["Aednik", "Aednik"] },
  beauty: { LT: ["Grožio meistras", "Grožio meistrė"], LV: ["Skaistuma meistars", "Skaistuma meistare"], EE: ["Ilumeister", "Ilumeister"] },
  tutoring: { LT: ["Korepetitorius", "Korepetitorė"], LV: ["Skolotājs", "Skolotāja"], EE: ["Õpetaja", "Õpetaja"] },
  "it-support": { LT: ["IT specialistas", "IT specialistė"], LV: ["IT speciālists", "IT speciāliste"], EE: ["IT-spetsialist", "IT-spetsialist"] },
  photography: { LT: ["Fotografas", "Fotografė"], LV: ["Fotogrāfs", "Fotogrāfe"], EE: ["Fotograaf", "Fotograaf"] },
};
const FIRST_NAMES = {
  LT: [
    ["Jonas", "Petras", "Antanas", "Vytautas", "Mindaugas", "Tomas", "Darius", "Rimas", "Saulius", "Algis", "Kęstutis", "Gintaras", "Arūnas", "Marius", "Andrius", "Paulius", "Rokas", "Lukas", "Mantas", "Tadas", "Giedrius", "Egidijus", "Remigijus", "Valdas", "Žilvinas", "Linas", "Donatas", "Edgaras", "Karolis", "Justas"],
    ["Ona", "Rasa", "Ieva", "Jūratė", "Daiva", "Rūta", "Eglė", "Asta", "Vilma", "Laima", "Aušra", "Giedrė", "Inga", "Kristina", "Lina", "Monika", "Greta", "Gabija", "Austėja", "Ugnė", "Simona", "Agnė", "Jolanta", "Violeta", "Renata", "Sigita", "Dalia", "Birutė", "Milda", "Neringa"],
  ],
  LV: [
    ["Jānis", "Andris", "Juris", "Edgars", "Māris", "Aivars", "Pēteris", "Kārlis", "Mārtiņš", "Artūrs", "Raimonds", "Guntis", "Valdis", "Normunds", "Ivars", "Uldis", "Gatis", "Kaspars", "Rihards", "Toms"],
    ["Anna", "Ilze", "Līga", "Inese", "Kristīne", "Dace", "Zane", "Laura", "Evija", "Sandra", "Baiba", "Agnese", "Linda", "Elīna", "Madara", "Ieva", "Santa", "Marta", "Aija", "Vita"],
  ],
  EE: [
    ["Jaan", "Mart", "Peeter", "Toomas", "Andres", "Tiit", "Rein", "Priit", "Margus", "Indrek", "Kristjan", "Siim", "Rasmus", "Tanel", "Urmas"],
    ["Mari", "Kadri", "Liis", "Anu", "Tiina", "Kristiina", "Piret", "Katrin", "Maarja", "Triin", "Eve", "Sirje", "Kaja", "Merle", "Helen"],
  ],
};
const INITIALS = "ABDGJKLMNPRSTVZ";
const EMAIL_LOCAL = { LT: ["info", "labas", "uzsakymai", "kontaktai"], LV: ["info", "birojs", "pasutijumi"], EE: ["info", "tere", "tellimus"] };

// One sentence that is true for any listing, appended to the description.
const EXTRAS = [
  ["Dirbame ir savaitgaliais.", "We also work at weekends."],
  ["Darbams suteikiame garantiją.", "The work comes with a warranty."],
  ["Įmonėms išrašome sąskaitas faktūras.", "Invoices for companies are available."],
  ["Pirma konsultacija nemokama.", "The first consultation is free."],
  ["Nuolatiniams klientams taikome nuolaidas.", "Regular customers get a discount."],
  ["Atsiskaityti galima grynaisiais arba kortele.", "Payment by cash or card."],
  ["Kainą suderiname prieš pradėdami darbus.", "The price is agreed before work starts."],
  ["Senjorams taikome nuolaidą.", "Seniors get a discount."],
  ["Atvykstame sutartu laiku.", "We keep to the agreed time."],
  ["Į klausimus atsakome tą pačią dieną.", "Questions are answered the same day."],
];

// mode: onsite = comes to the client, shop = client comes to the provider, both = either, remote = can be done online.
// emergency: share of providers that offer a 24/7 service. lead: [min, max] days when the usual spread does not fit.
const SERVICES = {
  plumbing: [
    { title: "Santechnikos darbai", titleEn: "Plumbing work", desc: "Atliekame visus santechnikos darbus: keičiame vamzdžius, maišytuvus ir klozetus, prijungiame buitinę techniką.", descEn: "All kinds of plumbing work: pipe, tap and toilet replacement and appliance connection.", tags: ["santechnikas", "vamzdžiai", "maišytuvai", "plumber", "pipes", "taps"], unit: "hour", price: [20, 40], mode: "onsite", emergency: 0.2 },
    { title: "Avarinė santechnikos tarnyba", titleEn: "Emergency plumbing service", desc: "Skubiai šaliname vandentiekio ir nuotekų avarijas, valome užsikimšusią kanalizaciją.", descEn: "Urgent repair of water and sewage leaks and blocked drains.", tags: ["santechnikas", "avarija", "nuotekos", "kanalizacija", "plumber", "emergency", "leak", "drain"], unit: "hour", price: [30, 55], mode: "onsite", emergency: 1, callout: true },
    { title: "Šildymo sistemų montavimas", titleEn: "Heating system installation", desc: "Montuojame katilus, radiatorius, grindinį šildymą ir šilumos siurblius, atliekame sistemų priežiūrą.", descEn: "Installation of boilers, radiators, underfloor heating and heat pumps, plus system maintenance.", tags: ["šildymas", "katilas", "radiatoriai", "šilumos siurblys", "heating", "boiler", "heat pump"], unit: "job", price: [150, 1200], mode: "onsite", lead: [3, 21] },
    { title: "Vonios kambario santechnikos įrengimas", titleEn: "Bathroom plumbing installation", desc: "Įrengiame vonios kambario santechniką: dušo kabinas, vonias, potinkinius klozetus ir vamzdynus.", descEn: "Bathroom plumbing: shower enclosures, baths, wall-hung toilets and pipework.", tags: ["santechnikas", "vonios kambarys", "dušas", "vonia", "bathroom", "shower", "plumber"], unit: "job", price: [200, 1500], mode: "onsite", lead: [3, 21] },
  ],
  electrical: [
    { title: "Elektriko paslaugos", titleEn: "Electrician services", desc: "Šaliname elektros gedimus, keičiame rozetes, jungiklius ir šviestuvus.", descEn: "Electrical fault repair and socket, switch and light fitting replacement.", tags: ["elektrikas", "rozetės", "šviestuvai", "gedimai", "electrician", "sockets", "lights"], unit: "hour", price: [20, 40], mode: "onsite", emergency: 0.3 },
    { title: "Elektros instaliacijos darbai", titleEn: "Electrical installation work", desc: "Atliekame elektros instaliaciją naujuose namuose ir renovuojamuose butuose, montuojame skydelius.", descEn: "Wiring for new houses and renovated flats, including distribution boards.", tags: ["elektrikas", "elektros instaliacija", "laidai", "skydelis", "wiring", "electrician", "fuse box"], unit: "m2", price: [10, 20], mode: "onsite", lead: [3, 21] },
    { title: "Išmaniųjų namų sistemų diegimas", titleEn: "Smart home installation", desc: "Diegiame išmanųjį apšvietimą, šildymo valdymą, vaizdo stebėjimą ir signalizaciją.", descEn: "Smart lighting, heating control, video surveillance and alarm systems.", tags: ["išmanūs namai", "automatika", "signalizacija", "vaizdo stebėjimas", "smart home", "automation", "alarm"], unit: "job", price: [150, 2000], mode: "onsite", lead: [3, 21] },
    { title: "Elektromobilių įkrovimo stotelių montavimas", titleEn: "EV charger installation", desc: "Parenkame ir sumontuojame elektromobilio įkrovimo stotelę namuose ar įmonėje, sutvarkome dokumentus.", descEn: "Selection and installation of an EV charging point at home or at work, paperwork included.", tags: ["elektrikas", "įkrovimo stotelė", "elektromobilis", "EV charger", "charging point", "electrician"], unit: "job", price: [250, 900], mode: "onsite", lead: [3, 14] },
  ],
  renovation: [
    { title: "Butų remontas ir apdaila", titleEn: "Flat renovation and finishing", desc: "Atliekame pilną butų remontą nuo griovimo iki galutinės apdailos, sudarome sąmatą ir laikomės terminų.", descEn: "Complete flat renovation from demolition to final finishing, with an estimate and agreed deadlines.", tags: ["remontas", "apdaila", "butas", "sąmata", "renovation", "refurbishment", "builder"], unit: "m2", price: [30, 100], mode: "onsite", lead: [7, 45] },
    { title: "Plytelių klijavimas", titleEn: "Tiling", desc: "Klijuojame plyteles vonios kambariuose, virtuvėse ir terasose, darome hidroizoliaciją.", descEn: "Tiling of bathrooms, kitchens and terraces, waterproofing included.", tags: ["plytelės", "plytelių klijavimas", "hidroizoliacija", "tiler", "tiling", "bathroom"], unit: "m2", price: [20, 45], mode: "onsite", lead: [3, 30] },
    { title: "Dažymo ir glaistymo darbai", titleEn: "Painting and plastering", desc: "Glaistome ir dažome sienas bei lubas, klijuojame tapetus, po darbo paliekame švarias patalpas.", descEn: "Wall and ceiling plastering and painting, wallpapering, and a clean room afterwards.", tags: ["dažymas", "glaistymas", "tapetai", "sienos", "painter", "painting", "plastering"], unit: "m2", price: [5, 14], mode: "onsite", lead: [2, 21] },
    { title: "Grindų dėjimas", titleEn: "Floor laying", desc: "Klojame laminatą, parketą ir vinilines grindis, šlifuojame ir lakuojame medines grindis.", descEn: "Laminate, parquet and vinyl floor laying, sanding and varnishing of wooden floors.", tags: ["grindys", "laminatas", "parketas", "šlifavimas", "flooring", "parquet", "laminate"], unit: "m2", price: [8, 30], mode: "onsite", lead: [3, 21] },
  ],
  cleaning: [
    { title: "Butų ir namų valymas", titleEn: "Home cleaning", desc: "Reguliariai ir vienkartinai valome butus bei namus, atvykstame su savo priemonėmis.", descEn: "Regular and one-off home cleaning; we bring our own supplies.", tags: ["valymas", "namų tvarkymas", "valytoja", "švara", "cleaning", "cleaner", "housekeeping"], unit: "hour", price: [12, 22], mode: "onsite" },
    { title: "Valymas po remonto", titleEn: "Post-renovation cleaning", desc: "Išvalome statybines dulkes, dažų ir klijų likučius, nuplauname langus ir grindis.", descEn: "Removal of construction dust and paint or glue residue, plus window and floor washing.", tags: ["valymas po remonto", "generalinis valymas", "statybinės dulkės", "deep cleaning", "post-construction", "cleaning"], unit: "m2", price: [2, 5], mode: "onsite" },
    { title: "Langų valymas", titleEn: "Window cleaning", desc: "Valome butų, namų ir biurų langus, vitrinas ir stoglangius.", descEn: "Window cleaning for homes and offices, shop fronts and skylights.", tags: ["langų valymas", "langai", "vitrinos", "window cleaning", "windows", "glass"], unit: "job", price: [30, 150], mode: "onsite" },
    { title: "Minkštų baldų ir kilimų valymas", titleEn: "Upholstery and carpet cleaning", desc: "Giluminiu būdu valome sofas, čiužinius ir kilimus, šaliname dėmes ir kvapus.", descEn: "Deep cleaning of sofas, mattresses and carpets; stains and odours removed.", tags: ["cheminis valymas", "sofa", "kilimai", "čiužinys", "upholstery", "carpet cleaning", "stain removal"], unit: "job", price: [30, 160], mode: "onsite" },
  ],
  moving: [
    { title: "Perkraustymo paslaugos", titleEn: "Removals", desc: "Perkraustome butus, namus ir biurus, supakuojame daiktus ir užnešame į bet kurį aukštą.", descEn: "Flat, house and office removals with packing and carrying to any floor.", tags: ["perkraustymas", "krovikai", "pakavimas", "movers", "removals", "packing"], unit: "hour", price: [30, 60], mode: "onsite" },
    { title: "Krovinių pervežimas mikroautobusu", titleEn: "Van transport", desc: "Mikroautobusu pervežame baldus, buitinę techniką ir statybines medžiagas.", descEn: "Van transport of furniture, appliances and building materials.", tags: ["pervežimas", "mikroautobusas", "kroviniai", "van", "transport", "delivery"], unit: "hour", price: [18, 35], mode: "onsite" },
    { title: "Baldų pervežimas ir surinkimas", titleEn: "Furniture delivery and assembly", desc: "Parvežame baldus iš parduotuvės, surenkame juos vietoje ir išvežame senus.", descEn: "Furniture delivery from the shop, assembly on site and removal of old pieces.", tags: ["baldų pervežimas", "baldų surinkimas", "baldai", "furniture delivery", "assembly", "furniture"], unit: "hour", price: [22, 45], mode: "onsite" },
    { title: "Statybinių atliekų išvežimas", titleEn: "Construction waste removal", desc: "Išvežame statybines atliekas, senus baldus ir buitinę techniką, pristatome konteinerius.", descEn: "Removal of construction waste, old furniture and appliances; skips delivered.", tags: ["atliekų išvežimas", "statybinės atliekos", "konteineris", "waste removal", "skip hire", "rubbish"], unit: "job", price: [40, 250], mode: "onsite" },
  ],
  "auto-repair": [
    { title: "Automobilių remontas ir diagnostika", titleEn: "Car repair and diagnostics", desc: "Atliekame kompiuterinę diagnostiką, keičiame tepalus, remontuojame stabdžius ir važiuoklę.", descEn: "Computer diagnostics, oil changes, brake and suspension repair.", tags: ["autoservisas", "diagnostika", "stabdžiai", "tepalų keitimas", "car service", "mechanic", "brakes"], unit: "hour", price: [30, 50], mode: "shop" },
    { title: "Padangų montavimas ir balansavimas", titleEn: "Tyre fitting and balancing", desc: "Montuojame ir balansuojame padangas, taisome pradūrimus, saugome padangas iki kito sezono.", descEn: "Tyre fitting and balancing, puncture repair and seasonal tyre storage.", tags: ["padangos", "montavimas", "balansavimas", "ratai", "tyres", "tire fitting", "puncture"], unit: "job", price: [25, 70], mode: "shop" },
    { title: "Techninė pagalba kelyje", titleEn: "Roadside assistance", desc: "Užvedame išsikrovusį akumuliatorių, keičiame ratus ir nutempiame automobilį iki serviso.", descEn: "Jump starts, wheel changes and towing to a garage.", tags: ["pagalba kelyje", "tralas", "vilkimas", "akumuliatorius", "roadside assistance", "towing", "jump start", "emergency"], unit: "job", price: [35, 160], mode: "onsite", emergency: 1, callout: true },
    { title: "Kėbulo remontas ir dažymas", titleEn: "Body repair and painting", desc: "Lyginame įlenkimus, dažome kėbulo detales ir poliruojame žibintus.", descEn: "Dent repair, body part painting and headlight polishing.", tags: ["kėbulo remontas", "dažymas", "įlenkimai", "body shop", "dent repair", "car painting"], unit: "job", price: [120, 1500], mode: "shop", lead: [3, 21] },
  ],
  "appliance-repair": [
    { title: "Skalbimo mašinų remontas", titleEn: "Washing machine repair", desc: "Skalbimo mašinas ir džiovykles remontuojame kliento namuose, dažniausius gedimus sutvarkome per vieną vizitą.", descEn: "Washing machine and dryer repair at your home; most faults fixed in one visit.", tags: ["skalbimo mašina", "skalbyklė", "džiovyklė", "washing machine", "dryer", "appliance repair"], unit: "visit", price: [25, 90], mode: "onsite" },
    { title: "Šaldytuvų remontas", titleEn: "Fridge repair", desc: "Taisome šaldytuvus ir šaldiklius, pildome freoną, keičiame kompresorius ir termostatus.", descEn: "Fridge and freezer repair: refrigerant refill, compressor and thermostat replacement.", tags: ["šaldytuvas", "šaldiklis", "kompresorius", "fridge", "freezer", "refrigerator repair"], unit: "visit", price: [30, 100], mode: "onsite" },
    { title: "Indaplovių ir orkaičių remontas", titleEn: "Dishwasher and oven repair", desc: "Remontuojame indaploves, orkaites ir kaitlentes, naudojame originalias dalis.", descEn: "Dishwasher, oven and hob repair with original spare parts.", tags: ["indaplovė", "orkaitė", "kaitlentė", "dishwasher", "oven", "hob"], unit: "visit", price: [30, 110], mode: "onsite" },
    { title: "Televizorių ir elektronikos remontas", titleEn: "TV and electronics repair", desc: "Taisome televizorius, garso techniką ir smulkią elektroniką savo dirbtuvėse.", descEn: "Repair of TVs, audio equipment and small electronics in our workshop.", tags: ["televizorius", "elektronika", "garso technika", "tv repair", "electronics", "audio"], unit: "job", price: [25, 130], mode: "shop" },
  ],
  gardening: [
    { title: "Vejos pjovimas ir priežiūra", titleEn: "Lawn mowing and care", desc: "Pjauname, tręšiame ir aeruojame veją, grėbiame lapus ir išvežame žaliąsias atliekas.", descEn: "Lawn mowing, feeding and aeration, leaf raking and green waste removal.", tags: ["vejos pjovimas", "veja", "aplinkos tvarkymas", "lawn mowing", "gardener", "grass"], unit: "hour", price: [18, 32], mode: "onsite" },
    { title: "Medžių genėjimas ir pjovimas", titleEn: "Tree pruning and felling", desc: "Genime vaismedžius, pjauname pavojingus medžius ir frezuojame kelmus.", descEn: "Fruit tree pruning, felling of dangerous trees and stump grinding.", tags: ["medžių genėjimas", "medžių pjovimas", "kelmai", "tree surgeon", "pruning", "felling"], unit: "job", price: [50, 450], mode: "onsite" },
    { title: "Gyvatvorių karpymas ir sodinimas", titleEn: "Hedge trimming and planting", desc: "Karpome gyvatvores, sodiname tujas, dekoratyvinius krūmus ir gėlynus.", descEn: "Hedge trimming and planting of thuja, ornamental shrubs and flower beds.", tags: ["gyvatvorė", "karpymas", "sodinimas", "tujos", "hedge trimming", "planting", "gardener"], unit: "hour", price: [16, 30], mode: "onsite" },
    { title: "Sniego valymas", titleEn: "Snow clearing", desc: "Valome sniegą nuo kiemų, stogų ir stovėjimo aikštelių, barstome takus.", descEn: "Snow clearing for yards, roofs and car parks, plus path gritting.", tags: ["sniego valymas", "kiemas", "stogai", "snow removal", "gritting", "winter"], unit: "visit", price: [20, 70], mode: "onsite", lead: [0, 2] },
  ],
  beauty: [
    { title: "Moterų ir vyrų kirpimas", titleEn: "Haircuts for women and men", desc: "Kerpame, dažome ir šukuojame plaukus, parenkame šukuoseną pagal veido formą.", descEn: "Cuts, colouring and styling, with advice on a style that suits you.", tags: ["kirpykla", "kirpimas", "plaukų dažymas", "šukuosena", "hairdresser", "haircut", "barber"], unit: "visit", price: [12, 50], mode: "shop", hours: "salon" },
    { title: "Manikiūras ir pedikiūras", titleEn: "Manicure and pedicure", desc: "Atliekame klasikinį ir aparatinį manikiūrą, lakuojame gelio laku, darome pedikiūrą.", descEn: "Classic and e-file manicure, gel polish and pedicure.", tags: ["manikiūras", "pedikiūras", "nagai", "gelinis lakavimas", "manicure", "pedicure", "nail salon"], unit: "visit", price: [18, 45], mode: "shop", hours: "salon" },
    { title: "Masažas", titleEn: "Massage", desc: "Atliekame klasikinį, sportinį ir atpalaiduojantį masažą, parduodame dovanų kuponus.", descEn: "Classic, sports and relaxing massage; gift vouchers available.", tags: ["masažas", "atpalaidavimas", "nugaros masažas", "massage", "relaxation", "wellness"], unit: "hour", price: [30, 65], mode: "shop", hours: "salon" },
    { title: "Makiažas ir šukuosenos šventėms", titleEn: "Make-up and hair for events", desc: "Darome makiažą ir šukuosenas vestuvėms, išleistuvėms ir fotosesijoms, atvykstame į šventės vietą.", descEn: "Make-up and hair for weddings, proms and photo shoots, at your venue.", tags: ["makiažas", "šukuosenos", "vestuvės", "vizažistė", "make-up artist", "bridal", "hair styling"], unit: "visit", price: [35, 100], mode: "onsite", lead: [3, 21] },
  ],
  tutoring: [
    { title: "Matematikos korepetitorius", titleEn: "Mathematics tutor", desc: "Padedame mokiniams suprasti matematiką ir pasiruošti egzaminams, pamokos vyksta gyvai arba nuotoliu.", descEn: "Help with school maths and exam preparation, in person or online.", tags: ["matematika", "korepetitorius", "egzaminas", "maths tutor", "mathematics", "exam preparation"], unit: "hour", price: [15, 35], mode: "remote", hours: "lessons" },
    { title: "Anglų kalbos pamokos", titleEn: "English lessons", desc: "Individualios ir grupinės anglų kalbos pamokos vaikams ir suaugusiems, ruošiame tarptautiniams egzaminams.", descEn: "Individual and group English lessons for children and adults, including international exam preparation.", tags: ["anglų kalba", "kalbų kursai", "pamokos", "English lessons", "English tutor", "language course"], unit: "hour", price: [14, 30], mode: "remote", hours: "lessons" },
    { title: "Programavimo pamokos", titleEn: "Programming lessons", desc: "Mokome programuoti nuo pagrindų: Python, svetainių kūrimas ir žaidimų programavimas.", descEn: "Programming from the basics: Python, web development and game coding.", tags: ["programavimas", "Python", "informatika", "programming lessons", "coding", "computer science"], unit: "hour", price: [20, 40], mode: "remote", hours: "lessons" },
    { title: "Muzikos pamokos", titleEn: "Music lessons", desc: "Mokome groti pianinu ir gitara, dainuoti ir skaityti natas, priimame įvairaus amžiaus mokinius.", descEn: "Piano, guitar and singing lessons and music reading for all ages.", tags: ["muzikos pamokos", "pianinas", "gitara", "dainavimas", "music lessons", "piano", "guitar"], unit: "hour", price: [15, 30], mode: "shop", hours: "lessons" },
  ],
  "it-support": [
    { title: "Kompiuterių remontas", titleEn: "Computer repair", desc: "Remontuojame nešiojamuosius ir stacionarius kompiuterius, keičiame ekranus, valome nuo virusų.", descEn: "Laptop and desktop repair, screen replacement and virus removal.", tags: ["kompiuterių remontas", "nešiojamas kompiuteris", "virusai", "computer repair", "laptop", "PC"], unit: "visit", price: [20, 90], mode: "both" },
    { title: "Telefonų ir planšečių remontas", titleEn: "Phone and tablet repair", desc: "Keičiame sudužusius ekranus, baterijas ir įkrovimo lizdus, daugumą darbų atliekame tą pačią dieną.", descEn: "Screen, battery and charging port replacement, mostly on the same day.", tags: ["telefonų remontas", "ekrano keitimas", "baterija", "planšetė", "phone repair", "screen replacement", "tablet"], unit: "job", price: [20, 200], mode: "shop", lead: [0, 2] },
    { title: "IT priežiūra įmonėms", titleEn: "IT support for businesses", desc: "Prižiūrime įmonių kompiuterius, tinklus, el. paštą ir atsargines kopijas pagal sutartį.", descEn: "Managed IT for companies: computers, networks, email and backups on contract.", tags: ["IT priežiūra", "tinklai", "įmonėms", "atsarginės kopijos", "IT support", "managed services", "network"], unit: "hour", price: [35, 70], mode: "remote", emergency: 0.3 },
    { title: "Svetainių kūrimas", titleEn: "Website development", desc: "Kuriame ir prižiūrime svetaines bei el. parduotuves, rūpinamės talpinimu ir atnaujinimais.", descEn: "Websites and online shops built and maintained, hosting and updates included.", tags: ["svetainių kūrimas", "el. parduotuvė", "talpinimas", "web development", "website", "online shop"], unit: "day", price: [200, 500], mode: "remote", lead: [5, 30] },
  ],
  photography: [
    { title: "Vestuvių fotografas", titleEn: "Wedding photographer", desc: "Fotografuojame vestuves nuo pasiruošimo iki pirmojo šokio, natūraliai ir be dirbtinių pozų.", descEn: "Wedding photography from preparations to the first dance, natural and unposed.", tags: ["vestuvių fotografas", "vestuvės", "fotosesija", "wedding photographer", "wedding", "photo shoot"], unit: "day", price: [600, 1800], mode: "onsite", lead: [14, 45] },
    { title: "Šeimos ir portretų fotosesijos", titleEn: "Family and portrait photo shoots", desc: "Rengiame šeimos, vaikų ir verslo portretų fotosesijas studijoje arba gamtoje.", descEn: "Family, children's and business portrait sessions in the studio or outdoors.", tags: ["fotosesija", "šeimos nuotraukos", "portretai", "family photographer", "portrait", "headshots"], unit: "hour", price: [50, 100], mode: "both", lead: [2, 14] },
    { title: "Renginių fotografavimas ir filmavimas", titleEn: "Event photography and video", desc: "Fotografuojame ir filmuojame konferencijas, įmonių šventes ir koncertus.", descEn: "Photo and video coverage of conferences, company events and concerts.", tags: ["renginių fotografas", "filmavimas", "konferencijos", "event photographer", "videographer", "corporate events"], unit: "hour", price: [40, 90], mode: "onsite", lead: [2, 14] },
    { title: "Produktų fotografija", titleEn: "Product photography", desc: "Fotografuojame prekes el. parduotuvėms baltame fone ir interjere.", descEn: "Product photos for online shops on white and in lifestyle settings.", tags: ["produktų fotografija", "el. parduotuvė", "prekių nuotraukos", "product photography", "e-commerce", "packshot"], unit: "job", price: [60, 450], mode: "shop", lead: [1, 10] },
  ],
};

/** Small, fast, well-known 32-bit generator. Same seed, same sequence, in every JavaScript engine. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundPrice(value) {
  if (value < 10) return Math.round(value * 2) / 2;
  if (value < 200) return Math.round(value);
  return Math.round(value / 10) * 10;
}

const slug = (text) => text.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const pad = (number, width) => String(number).padStart(width, "0");

/**
 * @param {{ count: number, startNumber: number, seed?: number }} options
 *        startNumber is the number in the first id: 61 gives "svc-00061".
 * @returns {object[]} listings in the same shape as the hand-written ones in data.js
 */
export function generateListings({ count, startNumber, seed = DEFAULT_SEED }) {
  const random = mulberry32(seed);
  const int = (min, max) => min + Math.floor(random() * (max - min + 1));
  const pick = (items) => items[Math.floor(random() * items.length)];
  const chance = (probability) => random() < probability;
  const weighted = (pairs) => {
    let roll = random() * pairs.reduce((sum, [, weight]) => sum + weight, 0);
    for (const [value, weight] of pairs) {
      roll -= weight;
      if (roll < 0) return value;
    }
    return pairs.at(-1)[0];
  };

  const citiesOf = { LT: [], LV: [], EE: [] };
  for (const city of CITIES) citiesOf[city.country].push([city, city.weight]);

  // Provider names must stay unique next to the hand-written listings.
  const usedNames = new Set(handWritten.map((listing) => listing.provider.name));
  const unique = (make) => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const name = make(attempt);
      if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
      }
    }
    // Practically unreachable; keeps the function total.
    let name;
    let number = 2;
    do { name = `${make(99)} ${number}`; number += 1; } while (usedNames.has(name));
    usedNames.add(name);
    return name;
  };

  // Numbers below 1000 belong to the hand-written listings. Latvian and Estonian numbers have four free digits.
  const phoneCounter = { LT: 1000, LV: 1000, EE: 1000 };
  const phone = (country) => {
    const number = phoneCounter[country];
    phoneCounter[country] += 1;
    if (number > (country === "LT" ? 99_999 : 9_999)) {
      throw new RangeError(`Too many listings for the ${country} phone number format; widen it before generating more.`);
    }
    if (country === "LT") return `+370 000 ${pad(number, 5)}`;
    return `${country === "LV" ? "+371" : "+372"} 0000 ${pad(number, 4)}`;
  };

  // Only + and * here: these are exact in every engine, unlike fractional powers, so all browsers get the same numbers.
  const rating = () => {
    const drop = (random() + random()) * 0.65; // 0..1.3, most often around 0.65
    const countRoll = random();
    return { average: Math.round((5 - drop) * 10) / 10, count: 1 + Math.floor(countRoll * countRoll * 400) };
  };

  const hoursFor = (kind) => {
    let open = pick(["07:00", "08:00", "08:00", "09:00", "09:00", "10:00"]);
    let close = pick(["17:00", "18:00", "18:00", "19:00", "20:00"]);
    let pattern = weighted([["weekdays", 45], ["saturday", 30], ["everyDay", 25]]);
    if (kind === "salon") pattern = weighted([["tuesdayToSaturday", 40], ["saturday", 40], ["everyDay", 20]]);
    if (kind === "lessons") {
      open = pick(["13:00", "14:00", "15:00"]);
      close = pick(["19:00", "20:00", "21:00"]);
      pattern = weighted([["weekdays", 60], ["saturday", 40]]);
    }
    const day = () => [open, close];
    const saturdayClose = pick(["13:00", "14:00", "15:00", "16:00"]);
    const hours = { mon: day(), tue: day(), wed: day(), thu: day(), fri: day(), sat: null, sun: null };
    if (pattern === "saturday") hours.sat = [open, saturdayClose > open ? saturdayClose : close];
    if (pattern === "everyDay") { hours.sat = day(); hours.sun = day(); }
    if (pattern === "tuesdayToSaturday") { hours.mon = null; hours.sat = day(); }
    return hours;
  };

  const listings = [];
  for (let index = 0; index < count; index += 1) {
    const category = categories[index % categories.length].id;
    const service = pick(SERVICES[category]);
    const country = weighted(COUNTRY_WEIGHTS);
    const city = weighted(citiesOf[country]);

    const individual = chance(0.35);
    let name;
    if (individual) {
      const gender = chance(0.5) ? 0 : 1;
      name = unique(() => `${TRADES[category][country][gender]} ${pick(FIRST_NAMES[country][gender])} ${pick(INITIALS)}.`);
    } else {
      name = unique((attempt) => {
        const base = `${pick(NAME_PREFIXES[country])} ${pick(NAME_NOUNS[category][country])}`;
        return attempt < 6 ? base : `${base} ${pick(NAME_SUFFIXES[country])}`;
      });
    }

    const serviceArea = { travelsToClient: false, radiusKm: 0, remote: false };
    if (service.mode === "onsite" || (service.mode === "both" && chance(0.5))) {
      serviceArea.travelsToClient = true;
      serviceArea.radiusKm = pick([10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 150]);
    }
    if (service.mode === "remote") {
      serviceArea.remote = true;
      if (chance(0.3)) { serviceArea.travelsToClient = true; serviceArea.radiusKm = pick([10, 15, 20, 30]); }
    }
    if (service.mode === "both" && chance(0.3)) serviceArea.remote = true;

    const [minPrice, maxPrice] = service.price;
    const from = roundPrice(minPrice + random() * (maxPrice - minPrice) * 0.6);
    const price = { from, unit: service.unit, currency: "EUR", negotiable: chance(0.35) };
    if (chance(0.85)) {
      const to = roundPrice(from * (1.3 + random() * 0.9));
      if (to > from) price.to = to;
    }
    if (serviceArea.travelsToClient && (service.callout || chance(0.15))) price.calloutFee = pick([10, 15, 20, 25, 30]);

    const emergency = chance(service.emergency ?? 0);
    let leadTimeDays = 0;
    if (!emergency) {
      if (service.lead) leadTimeDays = int(service.lead[0], service.lead[1]);
      else leadTimeDays = weighted([[0, 25], [int(1, 3), 35], [int(4, 10), 25], [int(11, 30), 15]]);
    }

    const [extraLt, extraEn] = pick(EXTRAS);
    let placeLt = `Mus rasite ${city.locativeLt}.`;
    let placeEn = `You will find us in ${city.name}.`;
    if (serviceArea.remote) {
      placeLt = `Dirbame ${city.locativeLt} ir nuotoliu.`;
      placeEn = `Based in ${city.name}, also available online.`;
    } else if (serviceArea.travelsToClient) {
      placeLt = `Dirbame ${city.locativeLt} ir aplinkiniuose rajonuose.`;
      placeEn = `Based in ${city.name}, serving the surrounding area.`;
    }
    const cityInTitle = chance(0.5);

    const languages = [country === "LT" ? "lt" : country === "LV" ? "lv" : "et"];
    if (chance(country === "EE" ? 0.6 : 0.45)) languages.push("en");
    if (chance(country === "LV" ? 0.7 : 0.42)) languages.push("ru");
    if (country !== "LT" && chance(0.04)) languages.push("lt");

    const domain = slug(name);
    const contact = { phone: phone(country), email: `${pick(EMAIL_LOCAL[country])}@${domain}.example` };
    if (!individual && chance(0.5)) contact.website = `https://${domain}.example`;

    let postalCode;
    if (country === "LT") postalCode = `LT-${pad(int(1000, 99_999), 5)}`;
    else if (country === "LV") postalCode = `LV-${int(1001, 5999)}`;
    else postalCode = String(int(10_000, 99_999));

    listings.push({
      id: `svc-${pad(startNumber + index, 5)}`,
      category,
      title: cityInTitle ? `${service.title} ${city.locativeLt}` : service.title,
      titleEn: cityInTitle ? `${service.titleEn} in ${city.name}` : service.titleEn,
      description: `${service.desc} ${placeLt} ${extraLt}`,
      descriptionEn: `${service.descEn} ${placeEn} ${extraEn}`,
      tags: [...service.tags],
      provider: { name, type: individual ? "individual" : "company", yearsExperience: int(1, 30), verified: chance(0.6) },
      contact,
      // Street names are ordinary ones; the house number is kept high so the address is unlikely to exist.
      location: { country, city: city.name, address: `${pick(STREETS[country])} ${int(300, 990)}`, postalCode },
      serviceArea,
      price,
      rating: rating(),
      languages,
      availability: { hours: hoursFor(service.hours), leadTimeDays, emergency },
    });
  }
  return listings;
}
