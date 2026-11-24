// Общее состояние приложения: один объект, который читают все модули.
export const state = {
  places: [], routes: [], favs: new Set(), mode: "local",
  // карта и фильтры
  filter: "all", region: "all", q: "", minRating: 0, minPrice: null, maxPrice: null, sort: "popularity", active: null, user: null,
  // направления платформы
  city: "all", venueCity: "all", venueGroup: "all",
  plan: { ids: [], mode: "walk", name: "" },
  saved: [],
};
// Supabase может сериализовать bigint как строку, а локальные ID — как числа.
// Сравниваем нормализованно, чтобы карточка всегда открывала правильную запись.
export const byId = (id) => state.places.find((p) => String(p.id) === String(id));
