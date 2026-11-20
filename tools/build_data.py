#!/usr/bin/env python3
"""Единый источник данных: генерирует assets/js/data.js и supabase/seed.sql.
Запуск из корня проекта:  python3 tools/build_data.py
Места извлечены из исходного HTML (массив starterPlaces): каждая строка списка стала отдельным местом."""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

# slug: (название, иконка из спрайта, оттенок для градиентов, короткое описание подборки)
CATEGORIES = {
  "spa":      ("Бани и SPA", "leaf", 165, "Хаммамы и SPA для неспешного дня"),
  "capybara": ("Капибары", "paw", 28, "Знакомство с самыми спокойными животными"),
  "hookah":   ("Кальянные", "cloud", 270, "Вечер за разговором"),
  "gaming":   ("Компьютерные клубы", "gamepad", 228, "Игровой вечер на двоих"),
  "city":     ("Белый город", "building", 205, "Современные улицы и вечерняя подсветка"),
  "garden":   ("Ботанический сад", "sprout", 125, "Оранжереи и зелёные аллеи"),
  "trips":    ("Поездки за город", "car", 12, "Горы, сады и новые города"),
  "sea":      ("Морские прогулки", "waves", 195, "Баку с воды"),
  "resort":   ("Sea Breeze", "sun", 45, "Пляж, SPA и рестораны у моря"),
}

# Дополнительные категории расширяют каталог, не заменяя существующие подборки.
NEW_CATEGORIES = {
  "fastfood": ("Фастфуд и пиццерии", "building", 10, "Быстрый перекус, пицца и суши"),
  "theatre": ("Театры и концерты", "building", 310, "Театры и концертные площадки"),
  "market": ("Рынки", "leaf", 90, "Рынки и фермерские ярмарки"),
  "shop": ("Магазины и аутлеты", "building", 320, "Магазины и аутлеты"),
  "massage": ("Массаж", "leaf", 160, "Массажные салоны"),
  "hotel": ("Отели и базы отдыха", "building", 50, "Отели и загородные комплексы"),
  "karting": ("Картинг и активный отдых", "car", 5, "Картинг, конные прогулки, прокат"),
  "boat": ("Яхты и катера", "waves", 200, "Морские и речные прогулки"),
  "monument": ("Памятники и архитектура", "building", 215, "Памятники, архитектурные объекты"),
  "historic": ("Исторические места", "building", 35, "Исторические места"),
  "nature": ("Природа, озёра и леса", "sprout", 130, "Озёра, леса и природные места"),
  "excursion": ("Экскурсии", "pin", 260, "Экскурсии и поездки"),
  "gaming247": ("Компьютерные клубы 24/7", "gamepad", 225, "Игровые места, работающие круглосуточно"),
  "esports": ("Киберспортивные арены", "gamepad", 230, "Арены и площадки для киберспорта"),
  "gamecenter": ("Игровые центры", "gamepad", 235, "Игровые пространства и центры развлечений"),
  "vr": ("VR-клубы", "gamepad", 240, "Виртуальная реальность и интерактивные игры"),
  "quest": ("Квесты", "pin", 255, "Квест-комнаты и командные приключения"),
  "anticafe": ("Антикафе", "building", 265, "Антикафе и пространства для встреч"),
  "cultural_space": ("Культурные пространства", "building", 205, "Арт-кластеры, творческие площадки и общественные пространства"),
  "restaurant": ("Рестораны", "building", 15, "Рестораны и места для особенного ужина"),
  "cafe": ("Кафе", "building", 20, "Кафе для встреч и отдыха"),
  "coffee": ("Кофейни", "leaf", 25, "Кофейни и specialty coffee"),
  "bakery": ("Пекарни", "leaf", 30, "Пекарни и свежая выпечка"),
  "foodcourt": ("Фуд-корты", "building", 35, "Фуд-корты с выбором кухонь"),
  "bar": ("Бары", "cloud", 280, "Бары для вечернего отдыха"),
  "pub": ("Пабы", "cloud", 285, "Пабы и пивные рестораны"),
  "winebar": ("Винные бары", "cloud", 290, "Винные бары и энотеки"),
  "lounge": ("Лаунж-бары", "cloud", 295, "Лаунж-бары и спокойные вечера"),
  "karaoke": ("Караоке", "gamepad", 300, "Караоке-клубы и вокальные комнаты"),
  "billiards": ("Бильярд", "gamepad", 205, "Бильярдные клубы"),
  "bowling": ("Боулинг", "gamepad", 210, "Боулинг и семейные игровые центры"),
  "cinema": ("Кинотеатры", "building", 215, "Кинотеатры и кинопоказы"),
  "mall": ("Торговые центры", "building", 220, "Торговые центры и магазины"),
  "entertainment": ("Развлекательные центры", "gamepad", 245, "Крытые центры отдыха и развлечений"),
  "park": ("Парки", "sprout", 110, "Парки для прогулок и отдыха"),
  "square": ("Скверы", "sprout", 115, "Городские скверы и тихие аллеи"),
  "embankment": ("Набережные", "waves", 190, "Набережные и прогулочные маршруты у воды"),
  "beach": ("Пляжи", "waves", 185, "Городские и загородные пляжи"),
  "aquapark": ("Аквапарки", "waves", 180, "Водные развлечения и аквапарки"),
  "bath": ("Банные комплексы", "leaf", 160, "Бани, сауны и хаммамы"),
  "thermal": ("Термальные комплексы", "leaf", 155, "Термальные источники и wellness"),
  "gym": ("Спортзалы", "gamepad", 225, "Спортзалы и фитнес-клубы"),
  "pool": ("Бассейны", "waves", 175, "Бассейны и водные комплексы"),
  "attraction": ("Достопримечательности", "pin", 200, "Исторические и городские достопримечательности"),
  "museum": ("Музеи", "building", 205, "Музеи и культурные пространства"),
  "exhibition": ("Выставочные центры", "building", 210, "Выставки и культурные события"),
  "viewpoint": ("Смотровые площадки", "pin", 195, "Панорамные виды и смотровые площадки"),
  "nightclub": ("Ночные клубы", "cloud", 275, "Ночные клубы и танцевальные площадки"),
  "recreation": ("Популярные места отдыха", "sun", 40, "Популярные местные места отдыха"),
  "zoo": ("Зоопарки", "paw", 125, "Зоопарки и знакомство с животными"),
}
CATEGORIES.update(NEW_CATEGORIES)
CATEGORY_SLUGS = {value[0].casefold(): key for key, value in CATEGORIES.items()}
CATEGORY_SLUGS.update({"компьютерные клубы": "gaming", "кальянная": "hookah", "компьютерный клуб": "gaming"})
CATEGORY_SLUGS.update({
  "компьютерный клуб 24/7": "gaming247", "киберспортивная арена": "esports", "игровой центр": "gamecenter",
  "vr-клуб": "vr", "квест-комната": "quest", "ресторан": "restaurant", "кофейня": "coffee", "пекарня": "bakery",
  "фуд-корт": "foodcourt", "паб": "pub", "винный бар": "winebar", "лаунж-бар": "lounge", "бильярдный клуб": "billiards",
  "кинотеатр": "cinema", "торгово-развлекательный центр": "mall", "развлекательный центр": "entertainment", "парк": "park",
  "сквер": "square", "набережная": "embankment", "пляж": "beach", "аквапарк": "aquapark", "банный комплекс": "bath",
  "термальный комплекс": "thermal", "спортзал": "gym", "бассейн": "pool", "достопримечательность": "attraction",
  "музей": "museum", "выставочный центр": "exhibition", "смотровая площадка": "viewpoint", "ночной клуб": "nightclub",
  "место отдыха": "recreation", "зоопарк": "zoo",
})

# (название, категория, описание, lat, lng, координаты приблизительные?)
P = [
 ("HamamBath Wellness & SPA","spa","Хаммам и wellness-программы для двоих.",40.3796,49.8467,True),
 ("Carol Joy Spa (Fairmont)","spa","SPA отеля Fairmont Baku у Flame Towers.",40.3598,49.8264,False),
 ("LIANA Deluxe Spa","spa","SPA-процедуры и спокойный отдых вдвоём.",40.3880,49.8520,True),
 ("Taze Bey Hamam","spa","Традиционный хаммам в историческом центре.",40.3662,49.8365,True),
 ("Capybara Land","capybara","Nasimi Gardens, Шамахы. Знакомство с капибарами, кафе и сувенирный магазин.",40.6314,48.6364,True),
 ("MALACANNES 145","hookah","Кальянная: вечер за разговором.",40.3720,49.8720,True),
 ("Myata Platinum","hookah","Кальянная: вечер за разговором.",40.3745,49.8450,True),
 ("HuQQabaz Garden","hookah","Кальянная с садом.",40.3880,49.8700,True),
 ("ZEN Whitecity","hookah","Кальянная в районе Белого города.",40.3755,49.9000,True),
 ("Terrace 145","hookah","Кальянная: вечер за разговором.",40.3730,49.8730,True),
 ("Ibrazoro Cyber Zone","gaming","Компьютерный клуб: игровой вечер вдвоём.",40.3990,49.8560,True),
 ("Cyber Arena Baku","gaming","Компьютерный клуб: игровой вечер вдвоём.",40.3950,49.8350,True),
 ("Kenza Gaming Lounge","gaming","Игровой лаунж: вечер на двоих.",40.3850,49.8650,True),
 ("PlayerCyberBar","gaming","Компьютерный клуб и бар.",40.4040,49.8700,True),
 ("Milli Gaming Arena","gaming","Компьютерный клуб: игровой вечер вдвоём.",40.3920,49.8480,True),
 ("Белый город","city","Прогулка по современным улицам. Архитектура и красивые здания, кофейни и рестораны, вечерняя подсветка.",40.3770,49.9010,False),
 ("Центральный ботанический сад","garden","Оранжереи и зелёные аллеи. Фотографии и спокойная прогулка.",40.3480,49.8120,True),
 ("Шамахы","trips","Старинный город у подножия гор. Можно совместить с Capybara Land.",40.6314,48.6364,False),
 ("Габала","trips","Горный курорт: природа и свежий воздух.",41.0011,47.8458,False),
 ("Губа","trips","Горы, сады и тихие улицы.",41.3611,48.5126,False),
 ("Гусар","trips","Дорога к горам: можно ехать вместе с Шахдагом.",41.4272,48.4297,False),
 ("Шахдаг","trips","Горный курорт для зимних и летних прогулок.",41.3200,48.1500,True),
 ("Мардакян","trips","Абшеронский посёлок: сады и море рядом.",40.4931,50.1403,False),
 ("Бильгя","trips","Абшеронский посёлок у моря.",40.5694,50.0589,True),
 ("Морская прогулка","sea","Катер по Каспийскому морю. Панорама Баку с воды, виды на Flame Towers, фотографии и отдых вдвоём.",40.3640,49.8480,True),
 ("Sea Breeze (Сибриз)","resort","Территория курорта, пляж и набережная. The Grand Wellness Club, бассейны и SPA, рестораны и кафе, Bahçe Beach Club.",40.5917,49.9867,False),
]
LEGACY_CITY = {
  1: "Баку", 2: "Баку", 3: "Баку", 4: "Баку", 5: "Шамахы", 6: "Баку", 7: "Баку", 8: "Баку",
  9: "Баку", 10: "Баку", 11: "Баку", 12: "Баку", 13: "Баку", 14: "Баку", 15: "Баку", 16: "Баку",
  17: "Баку", 18: "Шамахы", 19: "Габала", 20: "Губа", 21: "Гусар", 22: "Шахдаг", 23: "Мардакян",
  24: "Бильгя", 25: "Баку", 26: "Нардаран",
}
legacy_places = [dict(id=i+1,title=t,description=d,category=c,latitude=la,longitude=lo,image=None,rating=None,is_approx=a,
                      region="Азербайджан",city=LEGACY_CITY[i+1],address=None,price_min=None,price_max=None,price_unit=None,
                      review_count=None,opening_hours=None,phone=None,map_url=None,source_urls=[])
                 for i,(t,c,d,la,lo,a) in enumerate(P)]
ID = {p["title"]:p["id"] for p in legacy_places}
places = list(legacy_places)

EXTRA_FILE = ROOT / "tools" / "verified_places.json"
extras = json.loads(EXTRA_FILE.read_text(encoding="utf-8")) if EXTRA_FILE.exists() else []
for offset, item in enumerate(extras, start=len(places)+1):
  label = str(item["category"]).strip().casefold()
  category = CATEGORY_SLUGS.get(label)
  if not category:
    raise ValueError(f"Unknown category for {item.get('title')}: {item.get('category')}")
  region = item["region"]
  if region not in {"Азербайджан", "Екатеринбург", "Москва", "Санкт-Петербург", "Нижний Тагил", "Грузия", "Посёлок Аять, Свердловская область"}:
    raise ValueError(f"Unknown region for {item.get('title')}: {region}")
  places.append(dict(
    id=offset, title=item["title"], description=item["description"], category=category,
    latitude=float(item["latitude"]), longitude=float(item["longitude"]), image=item.get("image_path") or item["image_url"],
    rating=round(float(item["rating"]), 1), is_approx=False, region=region, city=item["city"],
    address=item["address"], price_min=float(item["price_min"]), price_max=float(item["price_max"]),
    price_unit=item["price_unit"], review_count=int(item["review_count"]),
    opening_hours=item.get("opening_hours") or None, phone=item.get("phone") or None,
    map_url=item["map_url"], source_urls=list(dict.fromkeys([*item["sources"], item["image_url"]])),
  ))

# Достопримечательности Баку без проверенных рейтингов и цен: координаты приблизительные (is_approx),
# фото, рейтинг и стоимость намеренно не заполнены. Дополните их в Supabase, когда проверите данные.
SIGHTS = [
 ("Старый город (Ичери-Шехер)","attraction","Исторический центр Баку за крепостными стенами: узкие улицы, мечети, караван-сараи. Входит в список Всемирного наследия ЮНЕСКО.",40.3660,49.8370),
 ("Дворец Ширваншахов","attraction","Дворцовый комплекс XV века в Старом городе.",40.3664,49.8369),
 ("Башни Пламени (Flame Towers)","attraction","Три небоскрёба в форме языков пламени с вечерней подсветкой. Хорошо видны с набережной и из многих точек города.",40.3598,49.8263),
 ("Приморский бульвар","embankment","Набережная вдоль Каспийского моря: променад, парки, виды на залив.",40.3680,49.8455),
 ("Маленькая Венеция","attraction","Каналы и лодки на Приморском бульваре.",40.3590,49.8400),
 ("Площадь Фонтанов","square","Пешеходная площадь в центре Баку, удобная отправная точка для прогулки к Старому городу.",40.3725,49.8355),
]
for title, cat_, desc, lat, lng in SIGHTS:
  places.append(dict(
    id=len(places)+1, title=title, description=desc, category=cat_, latitude=lat, longitude=lng, image=None,
    rating=None, is_approx=True, region="Азербайджан", city="Баку", address=None, price_min=None, price_max=None,
    price_unit=None, review_count=None, opening_hours=None, phone=None, map_url=None, source_urls=[]))

R = [
 ("Спа-день","Хаммам, SPA и никуда не спешить.",["Taze Bey Hamam","Carol Joy Spa (Fairmont)","LIANA Deluxe Spa"]),
 ("Вечер у воды","Катер на закате, прогулка по Белому городу и кальян.",["Морская прогулка","Белый город","ZEN Whitecity"]),
 ("Шамахы за день","Капибары и старинный город.",["Шамахы","Capybara Land"]),
 ("Север на выходные","Губа, Гусар и горы Шахдага, с остановкой в Габале.",["Губа","Гусар","Шахдаг","Габала"]),
 ("Абшерон у моря","Мардакян, Бильгя и Sea Breeze.",["Мардакян","Бильгя","Sea Breeze (Сибриз)"]),
]
routes = [dict(id=i+1,title=t,description=d,places=[ID[x] for x in s]) for i,(t,d,s) in enumerate(R)]

# ---- data.js
cats = {k:dict(title=v[0],icon=v[1],hue=v[2],blurb=v[3]) for k,v in CATEGORIES.items()}
js = "// Сгенерировано tools/build_data.py. Это резервные данные: если Supabase подключён, сайт берёт данные из базы.\n"
js += "export const CATEGORIES = %s;\n" % json.dumps(cats, ensure_ascii=False, indent=1)
js += "export const PLACES = %s;\n" % json.dumps(places, ensure_ascii=False, indent=1)
js += "export const ROUTES = %s;\n" % json.dumps(routes, ensure_ascii=False, indent=1)
(ROOT/"assets/js/data.js").write_text(js, encoding="utf-8")

# ---- seed.sql
q = lambda s: "'" + str(s).replace("'", "''") + "'"
def text_value(value):
  return "null" if value is None else q(value)
def number_value(value):
  return "null" if value is None else format(float(value), ".6f").rstrip("0").rstrip(".")
def text_array(values):
  return "array[" + ",".join(q(value) for value in values) + "]::text[]" if values else "'{}'::text[]"

columns = "id,title,description,category,latitude,longitude,image,rating,is_approx,region,city,address,price_min,price_max,price_unit,review_count,opening_hours,phone,map_url,source_urls"
sql = ["-- Начальные данные. Выполняйте ПОСЛЕ schema.sql. Сгенерировано tools/build_data.py.",
       f"insert into public.places ({columns}) overriding system value values"]
rows = []
for p in places:
  values = [str(p["id"]), q(p["title"]), text_value(p.get("description")), q(p["category"]),
            number_value(p["latitude"]), number_value(p["longitude"]), text_value(p.get("image")),
            number_value(p.get("rating")), str(bool(p.get("is_approx"))).lower(), text_value(p.get("region")),
            text_value(p.get("city")), text_value(p.get("address")), number_value(p.get("price_min")),
            number_value(p.get("price_max")), text_value(p.get("price_unit")),
            "null" if p.get("review_count") is None else str(int(p["review_count"])),
            text_value(p.get("opening_hours")), text_value(p.get("phone")), text_value(p.get("map_url")),
            text_array(p.get("source_urls", []))]
  rows.append("  (" + ",".join(values) + ")")
sql.append(",\n".join(rows) + "\non conflict (id) do nothing;\n")
sql.append("insert into public.routes (id,title,description,places) overriding system value values")
sql.append(",\n".join("  (%d,%s,%s,array[%s]::bigint[])" % (r["id"],q(r["title"]),q(r["description"]),",".join(map(str,r["places"]))) for r in routes) + "\non conflict (id) do nothing;\n")
sql.append("-- Синхронизируем счётчики, чтобы новые записи получали корректные id\nselect setval(pg_get_serial_sequence('public.places','id'),(select max(id) from public.places));\nselect setval(pg_get_serial_sequence('public.routes','id'),(select max(id) from public.routes));")
(ROOT/"supabase/seed.sql").write_text("\n".join(sql)+"\n", encoding="utf-8")
print(len(places),"мест,",len(routes),"маршрутов")
