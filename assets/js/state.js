// Общее состояние приложения: один объект, который читают все модули.
export const state = {
  places: [], routes: [], mode: "local",
  // карта и фильтры
  filter: "all", region: "Баку", q: "", minRating: 0, minPrice: null, maxPrice: null, sort: "popularity", active: null, user: null,
  // направления платформы
  city: "Баку", venueCity: "Баку", venueGroup: "all",
  plan: { ids: [], mode: "walk", name: "" },
  saved: [],
};
export const byId = (id) => state.places.find((p) => p.id === id);
