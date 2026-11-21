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
 ("MALACANNES 145","hookah","Лаунж-ресторан в историческом здании у Молоканского сада.",40.3710075,49.8401042,False),
 ("Myata Platinum","hookah","Кальянная: вечер за разговором.",40.3745,49.8450,True),
 ("HuQQabaz Garden","hookah","Кальянная с садом.",40.3880,49.8700,True),
 ("ZEN Whitecity","hookah","Кальянная в районе Белого города.",40.3755,49.9000,True),
 ("Terrace 145","hookah","Кальянная: вечер за разговором.",40.3730,49.8730,True),
 ("Ibrazoro Cyber Zone","gaming","Круглосуточный игровой клуб PC и PlayStation рядом с метро 28 May.",40.380901,49.847473,False),
 ("Cyber Arena Baku","gaming","Компьютерный клуб: игровой вечер вдвоём.",40.3950,49.8350,True),
 ("Kenza Gaming Lounge","gaming","Игровой лаунж: вечер на двоих.",40.3850,49.8650,True),
 ("PlayerCyberBar","gaming","Круглосуточный PC- и PlayStation-клуб с отдельными игровыми комнатами.",40.396118,49.822398,False),
 ("Milli Gaming Arena","gaming","Круглосуточная игровая арена с PC, PlayStation, Xbox и VIP-комнатами.",40.403509,49.871897,False),
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
LEGACY_MEDIA = {
 1: ("https://azerbaijan.travel/fit752x624/center/pages/3452/0dd97745-ecc1-415a-b18e-26b1b27a7dc0.JPG", "https://azerbaijan.travel/relax-your-body-and-mind-at-the-hamambath-wellness-and-spa-complex"),
 2: ("https://m.ahstatic.com/is/image/accorhotels/met_p_a150-30%3A3by2?dpr=on%2C1.5&fmt=jpg&hei=223&icc=sRGB&iccEmbed=true&op_usm=1.75%2C0.3%2C2%2C0&qlt=80&resMode=sharp2&wid=335", "https://www.fairmont.com/en/hotels/baku/fairmont-baku-flame-towers/wellness/spa.html"),
 3: ("https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2c/38/bc/14/caption.jpg?h=1100&s=1&w=1100", "https://www.tripadvisor.co.uk/Attraction_Review-g293934-d27737708-Reviews-Liana_Deluxe_Massage_Spa-Baku_Absheron_Region.html"),
 4: ("https://sia.az/storage/2022/01/17/40cf51d919a2475d2d2b61e5c0d19cd5.jpg", "https://sia.az/az/news/culture/923551.html"),
 5: ("https://shimal.news/storage/thumbs/aspect/2025/12/15/pHnlj69hWnSFTgnMaUSFta2fRAr2JVMUrF40shKB.png", "https://shimal.news/cemiyyet/samaxida-kapibaralar-meskunlasib"),
  6: ("https://cdn.aitcomp.com/projects/3a6b82aa-d7d8-4873-abb4-bb80c9ea3810.webp", "https://www.145group.com/en/projects/malacannes"),
  11: ("https://uxcedpbumulpheglhlvs.supabase.co/storage/v1/object/public/club-images/fe59a1dd-e8e7-411c-b8d3-ff046e78d5b6/profile/1787839395921-dc31a094-c337-4557-b6af-bd45f905d566.jpg", "https://gameyer.az/klub/ibrazoro-cyber-zone-28-may"),
  14: ("https://playercyberbar.az/wp-content/uploads/2024/10/415227803_17906334491897744_3799340732837938160_n.jpg", "https://playercyberbar.az/"),
  15: ("https://milligamingarena.az/storage/content-pages/s76LhuY3KUquLj1NHlLBInsOB01nmvycdBdE2fs0.jpg", "https://milligamingarena.az/"),
 7: ("https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2a/9f/a6/3a/caption.jpg?h=1200&s=1&w=1200", "https://www.tripadvisor.com/Restaurant_Review-g293934-d25314499-Reviews-Myata_Platinum-Baku_Absheron_Region.html"),
 8: ("https://images.qfoodbeverage.com.tr/webp/22-1748604042-bdTGjXqUzu.webp", "https://huqqabaz.com/en/branch/huqqabaz-garden-baku/"),
 9: ("https://cdn-media.choiceqr.com/prod-eat-zen-cafe/template-gallery/thumbnail_TzCvQHg-MUIGbjp-ZTkzVGS_F-F-b.jpeg", "https://zen-cafe.choiceqr.com/menu"),
 10: ("https://monyo.az/v4/uploads2/uploads2023-06/a_1805_20230602161450233980715.jpg", "https://monyo.az/?r=terrace145"),
 12: ("https://langame.ru/storage/clubs/2023/Jun/12/1686582489648734d9e0ea9.webp", "https://langame.ru/azerbaijan/799452695_computerniy_club_cyber-arena_baku"),
 13: ("https://dynamic-media-cdn.tripadvisor.com/media/photo-o/30/7f/62/6f/caption.jpg?h=1000&s=1&w=1000", "https://www.tripadvisor.com/Attraction_Review-g293934-d33262286-Reviews-Kenza_Gaming_Lounge-Baku_Absheron_Region.html"),
 16: ("https://az.trend.az/media/2021/10/28/trend_ag_sheher_bulvar_281021_10.jpg", "https://az.trend.az/azerbaijan/society/3504484.html"),
 18: ("https://ak-d.tripcdn.com/images/0102i12000o5vtw1m7297.jpg", "https://www.trip.com/travel-guide/attraction/shamakhi/juma-mosque-of-shamakhi-58323282/"),
 19: ("https://static.wixstatic.com/media/ce4a22_fcdfd9ab682942fbbf4c2c032e5418a8~mv2.jpg/v1/fill/w_925%2Ch_520%2Cal_c%2Cq_85%2Cenc_avif%2Cquality_auto/ce4a22_fcdfd9ab682942fbbf4c2c032e5418a8~mv2.jpg", "https://www.tripoly.co.in/post/best-places-to-visit-in-azerbaijan"),
 20: ("https://azertag.az/files/2022/2/1200x630/16564242895013132936_1200x630.jpg", "https://azertag.az/ru/xeber/osnovnye_turisticheskie_marshruty_i_dostoprimechatelnosti_guby-2196239"),
 21: ("https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Caucasus_Mountains._Qusar%2C_Azerbaijan.jpg/960px-Caucasus_Mountains._Qusar%2C_Azerbaijan.jpg", "https://commons.wikimedia.org/wiki/File:Caucasus_Mountains._Qusar,_Azerbaijan.jpg"),
 22: ("https://thefinetravel.com/images/shahdag.jpg", "https://thefinetravel.com/destination/shahdag-mountain-resort"),
 23: ("https://medeniyyet.info.az/img/news/900x/_1584703175.jpg", "https://medeniyyet.info.az/page/news/52050/Bura-agac-ve-bitki-muzeyi-de-demek-olar.html"),
 24: ("https://content.r9cdn.net/rimg/dimg/45/6f/c34de687-city-81304-170e64291f5.jpg?crop=true&height=630&watermarkposition=lowerright&width=1200", "https://www.hotelscombined.com/Place/Bilgah.htm"),
 25: ("https://cdn.getyourguide.com/image/format%3Dauto%2Cfit%3Dcrop%2Cgravity%3Dauto%2Cquality%3D60%2Cwidth%3D400%2Cheight%3D265%2Cdpr%3D2/tour_img/15550fbdef43071950ff16e82962a104e09080b4ae349bbf143cb35e1063d798.png", "https://www.getyourguide.com/baku-boulevard-l160836/"),
 26: ("https://upload.wikimedia.org/wikipedia/commons/f/f3/Sea_Breeze_resort.jpg", "https://commons.wikimedia.org/wiki/File:Sea_Breeze_resort.jpg")
}
for place in legacy_places:
  if place["id"] in LEGACY_MEDIA:
    place["image"], photo_source = LEGACY_MEDIA[place["id"]]
    place["source_urls"] = [photo_source, place["image"]]

LEGACY_META = {
  1: {"description": "Хаммам и wellness-программы для двоих.", "latitude": 40.3796, "longitude": 49.8467, "image": "https://azerbaijan.travel/fit752x624/center/pages/3452/0dd97745-ecc1-415a-b18e-26b1b27a7dc0.JPG", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Баку", "address": "14 Salyan Highway, Shikhov settlement, Baku, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://azerbaijan.travel/relax-your-body-and-mind-at-the-hamambath-wellness-and-spa-complex", "https://azerbaijan.travel/fit752x624/center/pages/3452/0dd97745-ecc1-415a-b18e-26b1b27a7dc0.JPG", "https://cop29.az/storage/1357/cop29-discover-baku_.pdf"], "last_verified_at": "2026-11-21"},
  2: {"description": "SPA отеля Fairmont Baku у Flame Towers.", "latitude": 40.359608, "longitude": 49.827179, "image": "https://m.ahstatic.com/is/image/accorhotels/met_p_a150-30%3A3by2?dpr=on%2C1.5&fmt=jpg&hei=223&icc=sRGB&iccEmbed=true&op_usm=1.75%2C0.3%2C2%2C0&qlt=80&resMode=sharp2&wid=335", "rating": None, "is_approx": False, "region": "Азербайджан", "city": "Баку", "address": "1A Mehdi Huseyn Street, Baku AZ1006, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://www.fairmont.com/en/hotels/baku/fairmont-baku-flame-towers/wellness/spa.html", "https://m.ahstatic.com/is/image/accorhotels/met_p_a150-30%3A3by2?dpr=on%2C1.5&fmt=jpg&hei=223&icc=sRGB&iccEmbed=true&op_usm=1.75%2C0.3%2C2%2C0&qlt=80&resMode=sharp2&wid=335", "https://all.accor.com/hotel/A593/index.en.shtml"], "last_verified_at": "2026-11-21"},
  3: {"description": "SPA-процедуры и спокойный отдых вдвоём.", "latitude": 40.388, "longitude": 49.852, "image": "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2c/38/bc/14/caption.jpg?h=1100&s=1&w=1100", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Баку", "address": "52 Hazi Aslanov Street, Baku, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://www.tripadvisor.co.uk/Attraction_Review-g293934-d27737708-Reviews-Liana_Deluxe_Massage_Spa-Baku_Absheron_Region.html", "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2c/38/bc/14/caption.jpg?h=1100&s=1&w=1100", "https://spasommelier.com/baku/liana-deluxe-spa/"], "last_verified_at": "2026-11-21"},
  4: {"description": "Традиционный хаммам в историческом центре.", "latitude": 40.3662, "longitude": 49.8365, "image": "https://sia.az/storage/2022/01/17/40cf51d919a2475d2d2b61e5c0d19cd5.jpg", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Баку", "address": "5A Izzat Hamidov Street, Baku, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://sia.az/az/news/culture/923551.html", "https://sia.az/storage/2022/01/17/40cf51d919a2475d2d2b61e5c0d19cd5.jpg", "https://above.guide/baku-f1/things-to-do/evenings-downtime"], "last_verified_at": "2026-11-21"},
  5: {"description": "Nasimi Gardens, Шамахы. Знакомство с капибарами, кафе и сувенирный магазин.", "latitude": 40.63644487827378, "longitude": 48.61395865656243, "image": "https://shimal.news/storage/thumbs/aspect/2025/12/15/pHnlj69hWnSFTgnMaUSFta2fRAr2JVMUrF40shKB.png", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Шамахы", "address": "JJM7+W98, Nasimi Gardens Complex, Shamakhi, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://shimal.news/cemiyyet/samaxida-kapibaralar-meskunlasib", "https://shimal.news/storage/thumbs/aspect/2025/12/15/pHnlj69hWnSFTgnMaUSFta2fRAr2JVMUrF40shKB.png", "https://president.az/en/articles/view/73522", "https://openchargemap.org/poi/details/513732"], "last_verified_at": "2026-11-21"},
  6: {"description": "Кальянная: вечер за разговором.", "latitude": 40.3710075, "longitude": 49.8401042, "image": "https://cdn.aitcomp.com/projects/3a6b82aa-d7d8-4873-abb4-bb80c9ea3810.webp", "rating": None, "is_approx": False, "region": "Азербайджан", "city": "Баку", "address": "11 Rasul Rza Street, Baku, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": "Ежедневно, круглосуточно", "phone": "+994 51 500 0145", "map_url": "https://www.openstreetmap.org/?mlat=40.3710075&mlon=49.8401042#map=18/40.3710075/49.8401042", "source_urls": ["https://www.145group.com/ru/projects/malacannes", "https://www.145group.com/en/projects/malacannes", "https://cdn.aitcomp.com/projects/3a6b82aa-d7d8-4873-abb4-bb80c9ea3810.webp", "https://www.openstreetmap.org/?mlat=40.3710075&mlon=49.8401042#map=18/40.3710075/49.8401042"], "last_verified_at": "2026-11-22"},
  7: {"description": "Кальянная: вечер за разговором.", "latitude": 40.3745, "longitude": 49.845, "image": "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2a/9f/a6/3a/caption.jpg?h=1200&s=1&w=1200", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Баку", "address": "43D Nigar Rafibeyli Street, Baku, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://www.tripadvisor.com/Restaurant_Review-g293934-d25314499-Reviews-Myata_Platinum-Baku_Absheron_Region.html", "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2a/9f/a6/3a/caption.jpg?h=1200&s=1&w=1200"], "last_verified_at": "2026-11-21"},
  8: {"description": "Кальянная с садом.", "latitude": 40.388, "longitude": 49.87, "image": "https://images.qfoodbeverage.com.tr/webp/22-1748604042-bdTGjXqUzu.webp", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Баку", "address": "20 Nigar Rafibeyli Street, Baku 1005, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://huqqabaz.com/en/branch/huqqabaz-garden-baku/", "https://images.qfoodbeverage.com.tr/webp/22-1748604042-bdTGjXqUzu.webp"], "last_verified_at": "2026-11-21"},
  9: {"description": "Кальянная в районе Белого города.", "latitude": 40.3755, "longitude": 49.9, "image": "https://cdn-media.choiceqr.com/prod-eat-zen-cafe/template-gallery/thumbnail_TzCvQHg-MUIGbjp-ZTkzVGS_F-F-b.jpeg", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Баку", "address": "Fuzuli Aliyev Street, Park Hill Tower, Baku, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://zen-cafe.choiceqr.com/menu", "https://cdn-media.choiceqr.com/prod-eat-zen-cafe/template-gallery/thumbnail_TzCvQHg-MUIGbjp-ZTkzVGS_F-F-b.jpeg"], "last_verified_at": "2026-11-21"},
  10: {"description": "Кальянная: вечер за разговором.", "latitude": 40.373, "longitude": 49.873, "image": "https://monyo.az/v4/uploads2/uploads2023-06/a_1805_20230602161450233980715.jpg", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Баку", "address": "20 Boyuk Qala Street, Icherisheher, Baku, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://monyo.az/?r=terrace145", "https://monyo.az/v4/uploads2/uploads2023-06/a_1805_20230602161450233980715.jpg"], "last_verified_at": "2026-11-21"},
  11: {"description": "Компьютерный клуб: игровой вечер вдвоём.", "latitude": 40.380901, "longitude": 49.847473, "image": "https://uxcedpbumulpheglhlvs.supabase.co/storage/v1/object/public/club-images/fe59a1dd-e8e7-411c-b8d3-ff046e78d5b6/profile/1787839395921-dc31a094-c337-4557-b6af-bd45f905d566.jpg", "rating": None, "is_approx": False, "region": "Азербайджан", "city": "Баку", "address": "Süleyman Rəhimov Street, 201, Baku, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": "Ежедневно, круглосуточно", "phone": "+994 77 312 7577", "map_url": "https://www.openstreetmap.org/?mlat=40.380901&mlon=49.847473#map=18/40.380901/49.847473", "source_urls": ["https://gameyer.az/klub/ibrazoro-cyber-zone-28-may", "https://uxcedpbumulpheglhlvs.supabase.co/storage/v1/object/public/club-images/fe59a1dd-e8e7-411c-b8d3-ff046e78d5b6/profile/1787839395921-dc31a094-c337-4557-b6af-bd45f905d566.jpg", "https://www.openstreetmap.org/?mlat=40.380901&mlon=49.847473#map=18/40.380901/49.847473"], "last_verified_at": "2026-11-22"},
  12: {"description": "Компьютерный клуб: игровой вечер вдвоём.", "latitude": 40.370872, "longitude": 49.841523, "image": "https://langame.ru/storage/clubs/2023/Jun/12/1686582489648734d9e0ea9.webp", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Баку", "address": "18H Uzeyir Hajibeyli Street, Baku, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://langame.ru/azerbaijan/799452695_computerniy_club_cyber-arena_baku", "https://langame.ru/storage/clubs/2023/Jun/12/1686582489648734d9e0ea9.webp", "https://yandex.az/maps/org/75291433400/", "https://gameyer.az/klub/cyber-arena-baku", "https://mayak.app/%40kiber-klub-cyber-arena-baku-v-baku-sport"], "last_verified_at": "2026-11-21"},
  13: {"description": "Игровой лаунж: вечер на двоих.", "latitude": 40.385, "longitude": 49.865, "image": "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/30/7f/62/6f/caption.jpg?h=1000&s=1&w=1000", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Баку", "address": "54B Pushkin Street, Baku, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://www.tripadvisor.com/Attraction_Review-g293934-d33262286-Reviews-Kenza_Gaming_Lounge-Baku_Absheron_Region.html", "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/30/7f/62/6f/caption.jpg?h=1000&s=1&w=1000", "https://gameyer.az/bakida-internet-klublari"], "last_verified_at": "2026-11-21"},
  14: {"description": "Компьютерный клуб и бар.", "latitude": 40.396118, "longitude": 49.822398, "image": "https://playercyberbar.az/wp-content/uploads/2024/10/415227803_17906334491897744_3799340732837938160_n.jpg", "rating": None, "is_approx": False, "region": "Азербайджан", "city": "Баку", "address": "Hasan Aliyev Passage, 176, Baku, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": "Ежедневно, круглосуточно", "phone": "+994 50 999 95 96", "map_url": "https://www.openstreetmap.org/?mlat=40.396118&mlon=49.822398#map=18/40.396118/49.822398", "source_urls": ["https://gameyer.az/bakida-internet-klublari", "https://playercyberbar.az/", "https://playercyberbar.az/wp-content/uploads/2024/10/415227803_17906334491897744_3799340732837938160_n.jpg", "https://www.openstreetmap.org/?mlat=40.396118&mlon=49.822398#map=18/40.396118/49.822398"], "last_verified_at": "2026-11-22"},
  15: {"description": "Компьютерный клуб: игровой вечер вдвоём.", "latitude": 40.403509, "longitude": 49.871897, "image": "https://milligamingarena.az/storage/content-pages/s76LhuY3KUquLj1NHlLBInsOB01nmvycdBdE2fs0.jpg", "rating": None, "is_approx": False, "region": "Азербайджан", "city": "Баку", "address": "Tabriz Street, 97, Baku, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": "Ежедневно, круглосуточно", "phone": "+994 77 616 00 11", "map_url": "https://www.openstreetmap.org/?mlat=40.403509&mlon=49.871897#map=18/40.403509/49.871897", "source_urls": ["https://gameyer.az/", "https://milligamingarena.az/", "https://milligamingarena.az/storage/content-pages/s76LhuY3KUquLj1NHlLBInsOB01nmvycdBdE2fs0.jpg", "https://www.openstreetmap.org/?mlat=40.403509&mlon=49.871897#map=18/40.403509/49.871897"], "last_verified_at": "2026-11-22"},
  16: {"description": "Прогулка по современным улицам. Архитектура и красивые здания, кофейни и рестораны, вечерняя подсветка.", "latitude": 40.377, "longitude": 49.901, "image": "https://az.trend.az/media/2021/10/28/trend_ag_sheher_bulvar_281021_10.jpg", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Баку", "address": "Baku White City, Khatai District, Baku, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://az.trend.az/azerbaijan/society/3504484.html", "https://az.trend.az/media/2021/10/28/trend_ag_sheher_bulvar_281021_10.jpg", "https://bakuwhitecity.com/ru/contact"], "last_verified_at": "2026-11-21"},
  17: {"description": "Оранжереи и зелёные аллеи. Фотографии и спокойная прогулка.", "latitude": 40.348, "longitude": 49.812, "image": "https://azerbaijan.travel/resize3000/center/pages/10939/2d98e655-aed5-4d6b-84e3-590e95695da5.jpg", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Баку", "address": "40 Badamdar Highway, Baku, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://azerbaijan.travel/central-botanical-garden", "https://azerbaijan.travel/resize3000/center/pages/10939/2d98e655-aed5-4d6b-84e3-590e95695da5.jpg", "https://armnb.az/en/visit"], "last_verified_at": "2026-11-21"},
  18: {"description": "Старинный город у подножия гор. Можно совместить с Capybara Land.", "latitude": 40.6314, "longitude": 48.6364, "image": "https://ak-d.tripcdn.com/images/0102i12000o5vtw1m7297.jpg", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Шамахы", "address": None, "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://www.trip.com/travel-guide/attraction/shamakhi/juma-mosque-of-shamakhi-58323282/", "https://ak-d.tripcdn.com/images/0102i12000o5vtw1m7297.jpg"]},
  19: {"description": "Горный курорт: природа и свежий воздух.", "latitude": 41.0011, "longitude": 47.8458, "image": "https://static.wixstatic.com/media/ce4a22_fcdfd9ab682942fbbf4c2c032e5418a8~mv2.jpg/v1/fill/w_925%2Ch_520%2Cal_c%2Cq_85%2Cenc_avif%2Cquality_auto/ce4a22_fcdfd9ab682942fbbf4c2c032e5418a8~mv2.jpg", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Габала", "address": None, "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://www.tripoly.co.in/post/best-places-to-visit-in-azerbaijan", "https://static.wixstatic.com/media/ce4a22_fcdfd9ab682942fbbf4c2c032e5418a8~mv2.jpg/v1/fill/w_925%2Ch_520%2Cal_c%2Cq_85%2Cenc_avif%2Cquality_auto/ce4a22_fcdfd9ab682942fbbf4c2c032e5418a8~mv2.jpg"]},
  20: {"description": "Горы, сады и тихие улицы.", "latitude": 41.3611, "longitude": 48.5126, "image": "https://azertag.az/files/2022/2/1200x630/16564242895013132936_1200x630.jpg", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Губа", "address": None, "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://azertag.az/ru/xeber/osnovnye_turisticheskie_marshruty_i_dostoprimechatelnosti_guby-2196239", "https://azertag.az/files/2022/2/1200x630/16564242895013132936_1200x630.jpg"]},
  21: {"description": "Дорога к горам: можно ехать вместе с Шахдагом.", "latitude": 41.4272, "longitude": 48.4297, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Caucasus_Mountains._Qusar%2C_Azerbaijan.jpg/960px-Caucasus_Mountains._Qusar%2C_Azerbaijan.jpg", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Гусар", "address": None, "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://commons.wikimedia.org/wiki/File:Caucasus_Mountains._Qusar,_Azerbaijan.jpg", "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Caucasus_Mountains._Qusar%2C_Azerbaijan.jpg/960px-Caucasus_Mountains._Qusar%2C_Azerbaijan.jpg"]},
  22: {"description": "Горный курорт для зимних и летних прогулок.", "latitude": 41.32, "longitude": 48.15, "image": "https://thefinetravel.com/images/shahdag.jpg", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Шахдаг", "address": None, "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://thefinetravel.com/destination/shahdag-mountain-resort", "https://thefinetravel.com/images/shahdag.jpg"]},
  23: {"description": "Абшеронский посёлок: сады и море рядом.", "latitude": 40.4931, "longitude": 50.1403, "image": "https://medeniyyet.info.az/img/news/900x/_1584703175.jpg", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Мардакян", "address": None, "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://medeniyyet.info.az/page/news/52050/Bura-agac-ve-bitki-muzeyi-de-demek-olar.html", "https://medeniyyet.info.az/img/news/900x/_1584703175.jpg"]},
  24: {"description": "Абшеронский посёлок у моря.", "latitude": 40.5694, "longitude": 50.0589, "image": "https://content.r9cdn.net/rimg/dimg/45/6f/c34de687-city-81304-170e64291f5.jpg?crop=true&height=630&watermarkposition=lowerright&width=1200", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Бильгя", "address": None, "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://www.hotelscombined.com/Place/Bilgah.htm", "https://content.r9cdn.net/rimg/dimg/45/6f/c34de687-city-81304-170e64291f5.jpg?crop=true&height=630&watermarkposition=lowerright&width=1200"]},
  25: {"description": "Катер по Каспийскому морю. Панорама Баку с воды, виды на Flame Towers, фотографии и отдых вдвоём.", "latitude": 40.364, "longitude": 49.848, "image": "https://cdn.getyourguide.com/image/format%3Dauto%2Cfit%3Dcrop%2Cgravity%3Dauto%2Cquality%3D60%2Cwidth%3D400%2Cheight%3D265%2Cdpr%3D2/tour_img/15550fbdef43071950ff16e82962a104e09080b4ae349bbf143cb35e1063d798.png", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Баку", "address": None, "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://www.getyourguide.com/baku-boulevard-l160836/", "https://cdn.getyourguide.com/image/format%3Dauto%2Cfit%3Dcrop%2Cgravity%3Dauto%2Cquality%3D60%2Cwidth%3D400%2Cheight%3D265%2Cdpr%3D2/tour_img/15550fbdef43071950ff16e82962a104e09080b4ae349bbf143cb35e1063d798.png"]},
  26: {"description": "Территория курорта, пляж и набережная. The Grand Wellness Club, бассейны и SPA, рестораны и кафе, Bahçe Beach Club.", "latitude": 40.591292, "longitude": 49.985065, "image": "https://upload.wikimedia.org/wikipedia/commons/f/f3/Sea_Breeze_resort.jpg", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Нардаран", "address": "1/1 Rza Afganly Street, Nardaran, Baku, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://commons.wikimedia.org/wiki/File:Sea_Breeze_resort.jpg", "https://upload.wikimedia.org/wikipedia/commons/f/f3/Sea_Breeze_resort.jpg", "https://seabreeze.az/ru/contacts", "https://sea-breeze-hotel.sealife.az/en/kontakty/"], "last_verified_at": "2026-11-21"},
}
for place in legacy_places:
  meta = LEGACY_META.get(place["id"])
  if meta:
    place.update(meta)

ID = {p["title"]:p["id"] for p in legacy_places}
places = list(legacy_places)

EXTRA_FILE = ROOT / "tools" / "verified_places.json"
extras = json.loads(EXTRA_FILE.read_text(encoding="utf-8")) if EXTRA_FILE.exists() else []

def make_extra(item, fallback_id):
  label = str(item["category"]).strip().casefold()
  category = CATEGORY_SLUGS.get(label)
  if not category:
    raise ValueError(f"Unknown category for {item.get('title')}: {item.get('category')}")
  region = item["region"]
  if region not in {"Азербайджан", "Екатеринбург", "Москва", "Санкт-Петербург", "Нижний Тагил", "Грузия", "Посёлок Аять, Свердловская область", "Казахстан"}:
    raise ValueError(f"Unknown region for {item.get('title')}: {region}")
  return dict(
    id=int(item.get("id", fallback_id)), title=item["title"], description=item["description"], category=category,
    latitude=float(item["latitude"]), longitude=float(item["longitude"]), image=item.get("image_url") or item.get("image_path") or None,
    rating=round(float(item["rating"]), 1) if item.get("rating") is not None else None, is_approx=bool(item.get("is_approx", False)), region=region, city=item["city"],
    address=item["address"], price_min=item.get("price_min"), price_max=item.get("price_max"),
    price_unit=item.get("price_unit") or None, review_count=int(item["review_count"]) if item.get("review_count") is not None else None,
    opening_hours=item.get("opening_hours") or None, phone=item.get("phone") or None,
    map_url=item["map_url"], source_urls=list(dict.fromkeys([*item["sources"], *([item["image_url"]] if item.get("image_url") else [])])),
    last_verified_at=item.get("last_verified_at"),
  )

# Сохраняем стабильные ID из verified_places.json; шесть исторических объектов Баку имеют ID 63–68.
explicit_extras = [item for item in extras if item.get("id") is not None]
generated_extras = [item for item in extras if item.get("id") is None]
for item in explicit_extras:
  places.append(make_extra(item, 0))

SIGHTS = [
 ("Старый город (Ичери-Шехер)","attraction","Исторический центр Баку за крепостными стенами: узкие улицы, мечети, караван-сараи. Входит в список Всемирного наследия ЮНЕСКО.",40.3660,49.8370),
 ("Дворец Ширваншахов","attraction","Дворцовый комплекс XV века в Старом городе.",40.3664,49.8369),
 ("Башни Пламени (Flame Towers)","attraction","Три небоскрёба в форме языков пламени с вечерней подсветкой. Хорошо видны с набережной и из многих точек города.",40.3598,49.8263),
 ("Приморский бульвар","embankment","Набережная вдоль Каспийского моря: променад, парки, виды на залив.",40.3680,49.8455),
 ("Маленькая Венеция","attraction","Каналы и лодки на Приморском бульваре.",40.3590,49.8400),
 ("Площадь Фонтанов","square","Пешеходная площадь в центре Баку, удобная отправная точка для прогулки к Старому городу.",40.3725,49.8355),
]
SIGHT_IDS = {
 "Старый город (Ичери-Шехер)":63, "Дворец Ширваншахов":64,
 "Башни Пламени (Flame Towers)":65, "Приморский бульвар":66,
 "Маленькая Венеция":67, "Площадь Фонтанов":68,
}
SIGHT_META = {
  "Старый город (Ичери-Шехер)": {"description": "Исторический центр Баку за крепостными стенами: узкие улицы, мечети, караван-сараи. Входит в список Всемирного наследия ЮНЕСКО.", "latitude": 40.366, "longitude": 49.837, "image": "https://worldheritagesites.net/wp-content/uploads/2025/06/Walled_City_Baku_2.jpg", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Баку", "address": "Icherisheher (Old City), Baku, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://worldheritagesites.net/walled-city-of-baku/", "https://worldheritagesites.net/wp-content/uploads/2025/06/Walled_City_Baku_2.jpg", "https://www.icherisheher.gov.az/en/activity/historical-reference"], "last_verified_at": "2026-11-21"},
  "Дворец Ширваншахов": {"description": "Дворцовый комплекс XV века в Старом городе.", "latitude": 40.36618, "longitude": 49.83315, "image": "https://infonews.az/wp-content/uploads/2021/10/Sirvansahlar_sarayi_2016-scaled.jpg", "rating": None, "is_approx": False, "region": "Азербайджан", "city": "Баку", "address": "Дворец Ширваншахов, Ичери-Шехер, Баку, Азербайджан", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": "https://www.google.com/maps/search/?api=1&query=40.36618,49.83315", "source_urls": ["https://infonews.az/?p=13785", "https://infonews.az/wp-content/uploads/2021/10/Sirvansahlar_sarayi_2016-scaled.jpg", "https://www.icherisheher.gov.az/en/activity/historical-reference", "https://icherisheher.gov.az/en/", "https://www.openstreetmap.org/?mlat=40.36618&mlon=49.83315#map=18/40.36618/49.83315"], "last_verified_at": "2026-11-21"},
  "Башни Пламени (Flame Towers)": {"description": "Три небоскрёба в форме языков пламени с вечерней подсветкой. Хорошо видны с набережной и из многих точек города.", "latitude": 40.35998, "longitude": 49.82625, "image": "https://spectra.mhi.com/sites/g/files/jwhtju2216/files/styles/crop_freeform/public/Baku%2C-Azerbaijan-at-night.jpeg?itok=LK1awdF4", "rating": None, "is_approx": False, "region": "Азербайджан", "city": "Баку", "address": "Mehdi Huseyn Street 1A, Baku, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": "https://www.google.com/maps/search/?api=1&query=40.35998,49.82625", "source_urls": ["https://spectra.mhi.com/energy-transition/cop29-3-areas-of-focus-for-the-finance-cop", "https://spectra.mhi.com/sites/g/files/jwhtju2216/files/styles/crop_freeform/public/Baku%2C-Azerbaijan-at-night.jpeg?itok=LK1awdF4", "https://www.fairmont.com/en/hotels/baku/fairmont-baku-flame-towers/wellness/spa.html", "https://mapcarta.com/W340060268"], "last_verified_at": "2026-11-21"},
  "Приморский бульвар": {"description": "Набережная вдоль Каспийского моря: променад, парки, виды на залив.", "latitude": 40.368, "longitude": 49.8455, "image": "https://hblimg.mmtcdn.com/content/hubble/img/additionalttdimages/mmt/activities/m_Baku_Boulevard_1_l_667_1000.jpg", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Баку", "address": None, "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://www.makemytrip.com/tripideas/attractions/baku-boulevard", "https://hblimg.mmtcdn.com/content/hubble/img/additionalttdimages/mmt/activities/m_Baku_Boulevard_1_l_667_1000.jpg"]},
  "Маленькая Венеция": {"description": "Каналы и лодки на Приморском бульваре.", "latitude": 40.359, "longitude": 49.84, "image": "https://www.advantour.com/img/azarbaijan/baku/little-venice-baku.jpg", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Баку", "address": "Baku Boulevard, beside the Azerbaijan National Carpet Museum, Baku, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://www.advantour.com/azerbaijan/baku/things-to-do.htm", "https://www.advantour.com/img/azarbaijan/baku/little-venice-baku.jpg", "https://inn.az/en/blog/little-venice-baku-location-boat-ride-prices-visitor-guide"], "last_verified_at": "2026-11-21"},
  "Площадь Фонтанов": {"description": "Пешеходная площадь в центре Баку, удобная отправная точка для прогулки к Старому городу.", "latitude": 40.37094, "longitude": 49.83681, "image": "https://tourister.az/public/uploads/images/2026/06/20260616_1908_NizamiStreetWalkingTour.jpg", "rating": None, "is_approx": True, "region": "Азербайджан", "city": "Баку", "address": "20 Nigar Rafibeyli Street, Baku 1005, Azerbaijan", "price_min": None, "price_max": None, "price_unit": None, "review_count": None, "opening_hours": None, "phone": None, "map_url": None, "source_urls": ["https://tourister.az/tours/nizami-street-walking-tour/", "https://tourister.az/public/uploads/images/2026/06/20260616_1908_NizamiStreetWalkingTour.jpg", "https://www.mypacer.com/parks/143252/fountains-square-baku"], "last_verified_at": "2026-11-21"},
}
SIGHT_MEDIA = {
 "Старый город (Ичери-Шехер)": ("https://worldheritagesites.net/wp-content/uploads/2025/06/Walled_City_Baku_2.jpg", "https://worldheritagesites.net/walled-city-of-baku/"),
 "Дворец Ширваншахов": ("https://infonews.az/wp-content/uploads/2021/10/Sirvansahlar_sarayi_2016-scaled.jpg", "https://infonews.az/?p=13785"),
 "Башни Пламени (Flame Towers)": ("https://spectra.mhi.com/sites/g/files/jwhtju2216/files/styles/crop_freeform/public/Baku%2C-Azerbaijan-at-night.jpeg?itok=LK1awdF4", "https://spectra.mhi.com/energy-transition/cop29-3-areas-of-focus-for-the-finance-cop"),
 "Приморский бульвар": ("https://hblimg.mmtcdn.com/content/hubble/img/additionalttdimages/mmt/activities/m_Baku_Boulevard_1_l_667_1000.jpg", "https://www.makemytrip.com/tripideas/attractions/baku-boulevard"),
 "Маленькая Венеция": ("https://www.advantour.com/img/azarbaijan/baku/little-venice-baku.jpg", "https://www.advantour.com/azerbaijan/baku/things-to-do.htm"),
 "Площадь Фонтанов": ("https://tourister.az/public/uploads/images/2026/06/20260616_1908_NizamiStreetWalkingTour.jpg", "https://tourister.az/tours/nizami-street-walking-tour/"),
}
for title, cat_, desc, lat, lng in SIGHTS:
  image, photo_source = SIGHT_MEDIA.get(title, (None, None))
  meta = SIGHT_META.get(title, {})
  latitude = float(meta.get("latitude", lat))
  longitude = float(meta.get("longitude", lng))
  places.append(dict(
    id=SIGHT_IDS[title], title=title, description=meta.get("description", desc), category=meta.get("category", cat_),
    latitude=latitude, longitude=longitude, image=meta.get("image") or image,
    rating=meta.get("rating"), is_approx=bool(meta.get("is_approx", True)), region=meta.get("region", "Азербайджан"),
    city=meta.get("city", "Баку"), address=meta.get("address"), price_min=meta.get("price_min"), price_max=meta.get("price_max"),
    price_unit=meta.get("price_unit"), review_count=meta.get("review_count"), opening_hours=meta.get("opening_hours"),
    phone=meta.get("phone"), map_url=meta.get("map_url") or f"https://www.google.com/maps/search/?api=1&query={latitude},{longitude}",
    source_urls=list(dict.fromkeys(meta.get("source_urls") or ([photo_source] if photo_source else []))),
    last_verified_at=meta.get("last_verified_at"),
  ))

for offset, item in enumerate(generated_extras, start=69):
  places.append(make_extra(item, offset))


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
sql.append("update public.places set latitude=40.36618,longitude=49.83315,is_approx=false,address="+q("Дворец Ширваншахов, Ичери-Шехер, Баку, Азербайджан")+",map_url="+q("https://www.google.com/maps/search/?api=1&query=40.36618,49.83315")+",source_urls="+text_array(["https://infonews.az/?p=13785","https://icherisheher.gov.az/en/","https://www.openstreetmap.org/?mlat=40.36618&mlon=49.83315#map=18/40.36618/49.83315"])+" where id=64;")
sql.append("update public.places set latitude=40.35998,longitude=49.82625,is_approx=false,address="+q("Mehdi Huseyn Street 1A, Baku, Azerbaijan")+",map_url="+q("https://www.google.com/maps/search/?api=1&query=40.35998,49.82625")+",source_urls="+text_array(["https://spectra.mhi.com/energy-transition/cop29-3-areas-of-focus-for-the-finance-cop","https://mapcarta.com/W340060268"])+" where id=65;")
sql.append("update public.places set image="+q("https://koktobe.com/storage/services/May2026/X4QIzQlYjmLSm8dcXUeE.jpg")+",source_urls="+text_array(["https://koktobe.com/","https://koktobe.com/storage/services/May2026/X4QIzQlYjmLSm8dcXUeE.jpg"])+" where id=990121;")
sql.append("update public.places set image="+q("https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2e/4f/7e/22/visitrussia-moscow-day.jpg?w=1600&h=900&s=1")+",source_urls="+text_array(["https://www.mos.ru/","https://www.openstreetmap.org/?mlat=55.7539&mlon=37.6208#map=17/55.7539/37.6208","https://www.tripadvisor.com/Attraction_Review-g298484-d300394-Reviews-Red_Square-Moscow_Central_Russia.html","https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2e/4f/7e/22/visitrussia-moscow-day.jpg?w=1600&h=900&s=1"])+" where id=990126;")
sql.append("update public.places set image="+q("https://shm.ru/upload/iblock/31b/8.jpg")+",source_urls="+text_array(["https://shm.ru/museum/hvb/","https://commons.wikimedia.org/wiki/Saint_Basil%27s_Cathedral","https://shm.ru/upload/iblock/31b/8.jpg"])+" where id=990127;")
sql.append("insert into public.routes (id,title,description,places) overriding system value values")
sql.append(",\n".join("  (%d,%s,%s,array[%s]::bigint[])" % (r["id"],q(r["title"]),q(r["description"]),",".join(map(str,r["places"]))) for r in routes) + "\non conflict (id) do nothing;\n")
sql.append("-- Синхронизируем счётчики, чтобы новые записи получали корректные id\nselect setval(pg_get_serial_sequence('public.places','id'),(select max(id) from public.places));\nselect setval(pg_get_serial_sequence('public.routes','id'),(select max(id) from public.routes));")
(ROOT/"supabase/seed.sql").write_text("\n".join(sql)+"\n", encoding="utf-8")
print(len(places),"мест,",len(routes),"маршрутов")
