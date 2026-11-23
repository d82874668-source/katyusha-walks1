// Классификация каталога для четырёх направлений платформы.
// Все правила собраны здесь: чтобы изменить поведение подбора, не нужно трогать интерфейс.

/** Категории, которые считаются достопримечательностями («Открой город»). Остальное — заведения («Куда сходить»). */
export const SIGHT_CATS = new Set([
  "city", "attraction", "museum", "exhibition", "viewpoint", "park", "garden", "square", "embankment", "beach", "sea", "trips", "monument", "historic", "nature", "excursion",
]);
export const kindOf = (p) => (SIGHT_CATS.has(p.category) ? "sight" : "venue");

/** Группы заведений для фильтров «Куда сходить» (соответствуют списку из задачи). */
export const VENUE_GROUPS = [
  { key: "restaurant", title: "Рестораны", cats: ["restaurant", "fastfood"] },
  { key: "cafe", title: "Кафе", cats: ["cafe", "coffee", "bakery", "foodcourt", "anticafe"] },
  { key: "hookah", title: "Кальянные", cats: ["hookah", "lounge"] },
  { key: "bar", title: "Бары", cats: ["bar", "pub", "winebar"] },
  { key: "spa", title: "Бани и SPA", cats: ["spa", "bath", "thermal", "pool", "resort", "massage", "hotel"] },
  { key: "gaming", title: "Компьютерные клубы", cats: ["gaming", "gaming247", "esports", "gamecenter", "vr"] },
  { key: "mall", title: "Торговые центры", cats: ["mall", "shop", "market"] },
  { key: "cinema", title: "Кинотеатры", cats: ["cinema"] },
  { key: "culture", title: "Культурные пространства", cats: ["cultural_space", "theatre"] },
  { key: "fun", title: "Развлекательные центры", cats: ["entertainment", "quest", "karaoke", "zoo", "capybara", "recreation", "gym", "theatre", "karting", "boat"] },
  { key: "aquapark", title: "Аквапарки", cats: ["aquapark"] },
  { key: "night", title: "Ночные клубы", cats: ["nightclub"] },
  { key: "bowling", title: "Боулинг и бильярд", cats: ["bowling", "billiards"] },
];
export const groupOf = (p) => VENUE_GROUPS.find((g) => g.cats.includes(p.category));

/** Роли остановок в программе дня: какие категории подходят каждой роли. */
export const ROLES = {
  walk:    { title: "Прогулка", cats: ["park", "garden", "square", "embankment", "city", "beach", "sea", "viewpoint", "attraction"] },
  photo:   { title: "Красивое место", cats: ["viewpoint", "attraction", "city", "embankment", "square", "park"] },
  culture: { title: "Культура", cats: ["museum", "exhibition", "attraction", "zoo", "cultural_space"] },
  meal:    { title: "Обед или ужин", cats: ["restaurant", "cafe", "foodcourt"] },
  cafe:    { title: "Кофе и десерты", cats: ["coffee", "bakery", "cafe", "anticafe"] },
  drinks:  { title: "Кафе или бар", cats: ["cafe", "coffee", "bar", "pub", "winebar", "lounge", "hookah"] },
  fun:     { title: "Развлечения", cats: ["entertainment", "vr", "quest", "karaoke", "billiards", "bowling", "gaming", "gaming247", "esports", "gamecenter", "aquapark", "cinema"] },
  relax:   { title: "Отдых", cats: ["spa", "bath", "thermal", "pool", "resort", "hookah", "lounge", "recreation"] },
  active:  { title: "Активный отдых", cats: ["park", "gym", "beach", "aquapark", "bowling", "sea", "zoo"] },
  family:  { title: "Для детей и семьи", cats: ["zoo", "park", "entertainment", "aquapark", "garden"] },
  night:   { title: "Вечер", cats: ["bar", "pub", "winebar", "lounge", "hookah", "nightclub", "karaoke", "restaurant"] },
};

/** Настроения: порядок ролей, время старта и подсказка. */
export const MOODS = {
  romantic: { title: "Романтический день вдвоём", start: 10, roles: ["walk", "photo", "meal", "walk", "culture", "night"], hint: "Прогулки, красивые виды и уютный вечер" },
  calm:     { title: "Спокойная прогулка", start: 10, roles: ["walk", "cafe", "culture", "walk", "meal"], hint: "Без спешки, парки и кофе" },
  active:   { title: "Активный отдых", start: 9, roles: ["active", "meal", "fun", "active", "drinks"], hint: "Движение и впечатления" },
  friends:  { title: "День с друзьями", start: 12, roles: ["meal", "fun", "fun", "drinks", "night"], hint: "Еда, игры и вечер в компании" },
  photo:    { title: "Красивые места и фотографии", start: 9, roles: ["photo", "photo", "cafe", "photo", "meal", "photo"], hint: "Лучшие виды и кадры" },
  food:     { title: "Гастрономическое путешествие", start: 10, roles: ["cafe", "meal", "walk", "cafe", "night"], hint: "Кофейни, рестораны и прогулки между ними" },
  fun:      { title: "Развлечения и эмоции", start: 12, roles: ["fun", "meal", "fun", "fun", "night"], hint: "Всё, что даёт яркие впечатления" },
  unusual:  { title: "Необычный день", start: 11, roles: ["culture", "photo", "fun", "drinks", "relax"], hint: "Нестандартные места и форматы" },
  family:   { title: "Семейный отдых", start: 10, roles: ["family", "meal", "family", "walk", "cafe"], hint: "Места, где комфортно с детьми" },
  evening:  { title: "Вечерняя прогулка", start: 17, roles: ["walk", "drinks", "meal", "night"], hint: "Закат, ужин и вечер" },
};

/** Атмосфера: какие категории усиливаются. */
export const ATMOSPHERES = {
  any:      { title: "Любая", cats: [] },
  cozy:     { title: "Уютная", cats: ["cafe", "coffee", "bakery", "lounge", "hookah", "spa", "bath"] },
  lively:   { title: "Живая", cats: ["bar", "pub", "nightclub", "karaoke", "entertainment", "gaming", "bowling"] },
  quiet:    { title: "Тихая", cats: ["museum", "park", "garden", "spa", "bath", "exhibition"] },
  nature:   { title: "На природе", cats: ["park", "garden", "beach", "sea", "viewpoint", "trips", "recreation"] },
  history:  { title: "Историческая", cats: ["museum", "attraction", "square", "city", "exhibition"] },
  premium:  { title: "Премиальная", cats: ["spa", "restaurant", "lounge", "resort", "winebar"] },
};

/** Ориентировочная длительность визита в минутах (используется, если нет своих данных). */
export const VISIT_MIN = {
  city: 120, attraction: 60, museum: 90, exhibition: 60, cultural_space: 90, viewpoint: 30, park: 60, garden: 75, square: 30, embankment: 45,
  beach: 90, sea: 90, trips: 240, zoo: 120, restaurant: 75, cafe: 45, coffee: 30, bakery: 25, foodcourt: 45, anticafe: 90,
  bar: 60, pub: 60, winebar: 60, lounge: 75, hookah: 75, nightclub: 120, karaoke: 90, billiards: 60, bowling: 75, cinema: 130,
  mall: 90, entertainment: 90, quest: 70, vr: 60, gaming: 90, gaming247: 90, esports: 90, gamecenter: 90, aquapark: 180,
  spa: 120, bath: 90, thermal: 120, pool: 90, gym: 60, resort: 180, capybara: 90, recreation: 120,
};
export const visitMinutes = (p) => VISIT_MIN[p.category] ?? 60;

/** Валюта по региону: нужна, чтобы подписывать бюджет и итоговую стоимость. */
export function currencyFor(p) {
  const unit = `${p?.price_unit || ""}`;
  const m = unit.match(/\b(AZN|RUB|GEL|USD|EUR)\b/) || (unit.includes("₽") ? ["", "RUB"] : null);
  if (m) return m[1];
  const r = `${p?.region || ""} ${p?.city || ""}`;
  if (/Азербайджан|Баку/.test(r)) return "AZN";
  if (/Грузия|Тбилиси|Батуми/.test(r)) return "GEL";
  return "RUB";
}
