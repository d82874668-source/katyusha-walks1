/* Product improvements: personal route, recent places, nearby discovery and city-aware map filters. */
(function(){
let recent=[],myRoute=[];
try{recent=JSON.parse(localStorage.getItem('kwk_recent')||'[]').map(String).slice(0,8)}catch(e){}
try{myRoute=JSON.parse(localStorage.getItem('kwk_my_route')||'[]').map(String).slice(0,12)}catch(e){}
const oldNav=window.nav,oldOpen=window.openPlace,oldPopulate=window.populateFilters,oldRenderRoutes=window.renderRoutes;
const saveRecent=()=>{try{localStorage.setItem('kwk_recent',JSON.stringify(recent))}catch(e){}};
const saveRoute=()=>{try{localStorage.setItem('kwk_my_route',JSON.stringify(myRoute))}catch(e){}};
let lastGuideCity='all';
function syncGuideCats(preserve){
 const el=$('guideCategory');if(!el)return;
 const city=$('guideCity')?.value||'all',old=preserve?el.value:'all';
 const used=[...new Set(PLACES.filter(p=>city==='all'||p.city_key===city).map(p=>p.category))].sort((a,b)=>categoryName(a).localeCompare(categoryName(b),'ru'));
 el.innerHTML='<option value="all">Любые места</option>'+used.map(x=>'<option value="'+esc(x)+'">'+esc(categoryName(x))+'</option>').join('');
 el.value=used.includes(old)?old:'all';
}
function fillGuide(){
 const c=$('guideCity');if(c){const old=c.value||'all';c.innerHTML='<option value="all">Любой город</option>'+CITIES.slice().sort((a,b)=>a.name.localeCompare(b.name,'ru')).map(x=>'<option value="'+esc(x.key)+'">'+esc(x.name)+(x.country?' · '+esc(x.country):'')+'</option>').join('');c.value=[...c.options].some(o=>o.value===old)?old:'all'}
 lastGuideCity=$('guideCity')?.value||'all';syncGuideCats(true);window.updateGuideBudget?.();
}
window.updateGuideFilters=function(){
 const city=$('guideCity')?.value||'all',input=$('guideBudget');
 if(city!==lastGuideCity&&input)input.value='';
 lastGuideCity=city;syncGuideCats(true);window.updateGuideBudget?.();
};
function syncMapCats(preserve){
const el=$('mapCatFilter');if(!el)return;const city=$('mapCityFilter')?.value||'all',old=preserve?el.value:'all';
const used=[...new Set(PLACES.filter(p=>city==='all'||p.city_key===city).map(p=>p.category))].sort((a,b)=>categoryName(a).localeCompare(categoryName(b),'ru'));
el.innerHTML='<option value="all">Все категории</option>'+used.map(x=>'<option value="'+esc(x)+'">'+esc(categoryName(x))+'</option>').join('');el.value=used.includes(old)?old:'all';
}
window.renderNav=function(){
const items=[['home','Главная'],['catalog','Каталог'],['map','Карта'],['routes','Маршруты'],['collections','Подборки'],['guide','Подбор'],['favorites','♥ Избранное']];
$('nav').innerHTML=items.map(([v,label])=>'<button type="button" onclick="nav(\''+v+'\')" class="nav-btn'+(state.view===v?' active':'')+'">'+label+(v==='favorites'?' <span class="badge" id="favBadge">'+favorites.length+'</span>':'')+'</button>').join('')+'<button class="nav-btn theme-toggle" id="themeToggle" type="button" onclick="toggleTheme()" aria-label="Переключить тему"><span id="themeIcon">🌙</span> <span id="themeLabel">Тёмная тема</span></button>';
};
window.nav=function(view){if(view==='guide'){state.view='guide';['home','catalog','map','routes','collections','favorites','guide'].forEach(v=>$('view-'+v)?.classList.toggle('hide',v!=='guide'));renderNav();fillGuide();window.scrollTo({top:0,behavior:'smooth'});return}$('view-guide')?.classList.add('hide');oldNav(view)};
window.populateFilters=function(){oldPopulate();syncMapCats(false);fillGuide()};
window.onMapFilters=function(){const city=$('mapCityFilter').value||'all';syncMapCats(true);state.mapCity=city;state.mapCat=$('mapCatFilter').value||'all';state.mapSearch=$('mapSearchFilter').value||'';state.city=city;state.cat=state.mapCat;state.search=state.mapSearch;$('cityFilter').value=city;$('searchInput').value=state.search;renderChips();renderCatalog();if(state.view==='map')updateMapMarkers()};
window.onCity=function(v){state.city=v;state.mapCity=v;state.cat='all';state.mapCat='all';$('mapCityFilter').value=v;syncMapCats(false);$('mapCatFilter').value='all';renderCatalog();if(state.view==='map')updateMapMarkers()};
window.openHomeCity=function(){const v=$('homeCity').value.trim();if(!v||v==='Все города'){openCity('all');return}const q=v.toLocaleLowerCase('ru');const city=CITIES.find(x=>x.name.toLocaleLowerCase('ru')===q||(x.name+(x.country?' · '+x.country:'')).toLocaleLowerCase('ru')===q||x.name.toLocaleLowerCase('ru').startsWith(q));if(city){openCity(city.key);return}state.city='all';state.cat='all';state.search=v;$('cityFilter').value='all';$('searchInput').value=v;renderChips();nav('catalog')};
window.renderHomePlaces=function(){const list=PLACES.slice().sort((a,b)=>(Number(b.rating)||0)-(Number(a.rating)||0)).slice(0,8);$('homePlaces').innerHTML=list.map(placeCardHTML).join('');renderRecent()};
function renderRecent(){const ids=recent.filter(id=>findPlace(id)).slice(0,6);const sec=$('recentSection');if(!sec)return;sec.hidden=!ids.length;$('recentGrid').innerHTML=ids.map(id=>placeCardHTML(findPlace(id))).join('')}
window.clearRecent=function(){recent=[];saveRecent();renderRecent();toast('История просмотров очищена')};
window.openPlace=function(id){id=String(id);recent=[id,...recent.filter(x=>x!==id)].slice(0,8);saveRecent();renderRecent();const out=oldOpen(id);const actions=$('modal')?.querySelector('.modal-actions');if(actions&&!actions.querySelector('[data-route-add]')){const b=document.createElement('button');b.type='button';b.className='btn btn-ghost';b.dataset.routeAdd='1';b.textContent=myRoute.includes(id)?'✓ В моём маршруте':'+ В мой маршрут';b.addEventListener('click',()=>{addToRoute(id);b.textContent='✓ В моём маршруте'});actions.insertBefore(b,actions.children[1]||null)}return out};
function addToRoute(id){id=String(id);const p=findPlace(id);if(!p)return;if(myRoute.includes(id)){toast('Это место уже есть в маршруте');return}if(myRoute.length>=12){toast('В маршруте может быть не больше 12 мест');return}const first=myRoute.length?findPlace(myRoute[0]):null;if(first&&first.city_key!==p.city_key){toast('В одном маршруте пока можно объединять места только одного города');return}myRoute.push(id);saveRoute();renderMyRoute();toast('Добавлено в ваш маршрут')}
window.addToMyRoute=addToRoute;
window.removeFromMyRoute=function(id){myRoute=myRoute.filter(x=>x!==String(id));saveRoute();renderMyRoute()};
window.moveMyRoute=function(id,delta){const i=myRoute.indexOf(String(id)),j=i+delta;if(i<0||j<0||j>=myRoute.length)return;[myRoute[i],myRoute[j]]=[myRoute[j],myRoute[i]];saveRoute();renderMyRoute()};
window.clearMyRoute=function(){myRoute=[];saveRoute();renderMyRoute();toast('Маршрут очищен')};
function renderMyRoute(){const list=$('myRouteList'),count=$('myRouteCount');if(!list)return;const pts=myRoute.map(findPlace).filter(Boolean);if(count)count.textContent=String(pts.length);list.innerHTML=pts.length?pts.map((p,i)=>'<div class="builder-stop"><span class="builder-stop-num">'+(i+1)+'</span><div class="builder-stop-info"><b>'+esc(p.title)+'</b><small>'+esc(p.address||p.city)+'</small></div><button type="button" aria-label="Выше" onclick="moveMyRoute(\''+p.id+'\',-1)">↑</button><button type="button" aria-label="Ниже" onclick="moveMyRoute(\''+p.id+'\',1)">↓</button><button type="button" aria-label="Удалить" onclick="removeFromMyRoute(\''+p.id+'\')">×</button></div>').join(''):'<div class="route-empty">Добавьте первое место из его карточки — здесь появится ваш план прогулки.</div>'}
window.renderRoutes=function(){oldRenderRoutes();renderMyRoute()};
window.openMyRouteMap=function(){const pts=myRoute.map(findPlace).filter(p=>p&&hasMapCoords(p)&&!p.is_approx);if(pts.length<2){toast('Добавьте минимум два места с точными координатами');return}const q=pts.map(p=>p.latitude+','+p.longitude);const url='https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(q[0])+'&destination='+encodeURIComponent(q[q.length-1])+(q.length>2?'&waypoints='+encodeURIComponent(q.slice(1,-1).join('|')):'')+'&travelmode=walking';window.open(url,'_blank','noopener')};
function distance(a,b,c,d){const r=x=>x*Math.PI/180,dl=r(c-a),dn=r(d-b),x=Math.sin(dl/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(dn/2)**2;return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
window.findNearby=function(){if(!navigator.geolocation){toast('Геолокация недоступна');return}toast('Определяем местоположение…');navigator.geolocation.getCurrentPosition(({coords})=>{const near=PLACES.filter(p=>hasMapCoords(p)&&!p.is_approx).map(p=>({...p,_km:distance(coords.latitude,coords.longitude,p.latitude,p.longitude)})).sort((a,b)=>a._km-b._km).slice(0,8);$('nearbySection').hidden=false;$('nearbyCaption').textContent='Ближайшие места по расстоянию от вашей геопозиции';$('nearbyGrid').innerHTML=near.map(p=>placeCardHTML({...p,description:(p._km<1?Math.round(p._km*1000)+' м от вас':p._km.toFixed(1)+' км от вас')+(p.description?' · '+p.description:'')})).join('');$('nearbySection').scrollIntoView({behavior:'smooth',block:'start'});toast('Нашли '+near.length+' мест поблизости')},()=>toast('Разрешите доступ к геолокации в браузере'),{enableHighAccuracy:false,timeout:10000,maximumAge:300000})};
window.generateGuide=function(){const city=$('guideCity').value||'all',budget=Math.max(0,Number($('guideBudget').value||0)),dur=Number($('guideDuration').value||4),cat=$('guideCategory').value||'all';let list=PLACES.filter(p=>(city==='all'||p.city_key===city)&&(cat==='all'||p.category===cat));const cost=p=>Number(p.avg_check||p.price_min||p.price_max||0);if(budget>0)list=list.filter(p=>!cost(p)||cost(p)<=budget);list.sort((a,b)=>(Number(b.rating)||0)-(Number(a.rating)||0));list=list.slice(0,dur===2?4:dur===4?6:8);$('guideCaption').textContent=list.length?'Подобрали '+list.length+' вариантов'+(budget?' в пределах '+budget.toLocaleString('ru-RU')+' '+unit+' по известным ценам':'')+'.':'По этим параметрам пока ничего не нашлось.';$('guideResults').innerHTML=list.length?list.map(placeCardHTML).join(''):'<div class="empty" style="grid-column:1/-1"><div class="empty-title">Попробуем иначе?</div><div class="empty-text">Увеличьте бюджет или выберите другой город.</div></div>'};
window.setGuideMood=function(m){const groups={nature:['park','nature','garden','sea','beach','embankment','trips','resort'],food:['cafe','coffee','restaurant','bakery','fastfood'],culture:['museum','historic','monument','theatre','cultural_space','attraction'],active:['gaming','karting','aquapark','entertainment','vr','quest']};const keys=groups[m]||[];const found=keys.find(k=>[...$('guideCategory').options].some(o=>o.value===k));$('guideCategory').value=found||'all';generateGuide()};
window.createWeekendRoute=function(){const city=$('guideCity').value||'all';if(city==='all'){toast('Сначала выберите город');return}const pts=PLACES.filter(p=>p.city_key===city&&hasMapCoords(p)&&!p.is_approx).sort((a,b)=>(Number(b.rating)||0)-(Number(a.rating)||0)).slice(0,6);if(pts.length<2){toast('Недостаточно мест с точными координатами');return}myRoute=pts.map(p=>p.id);saveRoute();nav('routes');renderMyRoute();toast('Маршрут на выходные собран: '+pts.length+' мест')};
document.addEventListener('DOMContentLoaded',()=>{fillGuide();syncMapCats(false);renderRecent();renderMyRoute();try{history.scrollRestoration='manual'}catch(e){}if(!location.hash)window.scrollTo(0,0)});
})();

/* ---- next feature module ---- */

(function(){
const baseOpen=window.openPlace;
const baseFiltered=window.filteredPlaces;
const baseReset=window.resetFilters;
const baseUpdateMap=window.updateMapMarkers;
window.filteredPlaces=function(map){let list=baseFiltered(map);if(!map){const max=Number($('priceFilter')?.value||0);if(max>0)list=list.filter(p=>{const price=Number(p.avg_check||p.price_min||p.price_max||0);return !price||price<=max})}return list};
window.resetFilters=function(){if($('priceFilter'))$('priceFilter').value='0';baseReset()};
window.toggleMapList=function(){const el=$('mapList');if(!el)return;el.hidden=!el.hidden;$('mapListToggle').textContent=el.hidden?'Показать список':'Скрыть список'};
function renderMapList(){const el=$('mapList');if(!el)return;const all=filteredPlaces(true).filter(p=>hasMapCoords(p)&&!p.is_approx);$('mapListCount').textContent=all.length+' точек с учётом выбранных фильтров';el.innerHTML=all.slice(0,12).map(placeCardHTML).join('');if(all.length>12)el.insertAdjacentHTML('beforeend','<div style="grid-column:1/-1;text-align:center;color:var(--kw-muted);font-size:12px;padding:8px">Показаны первые 12 мест. Уточните город или категорию, чтобы сузить список.</div>')}
window.updateMapMarkers=function(){baseUpdateMap();renderMapList()};
window.openPlace=function(id){
 const result=baseOpen(id),p=findPlace(id);if(!p)return result;const modal=$('modal');if(!modal)return result;
 const photos=[...new Set((Array.isArray(p.photos)?p.photos:[]).filter(x=>typeof x==='string'&&/^https?:\/\//i.test(x)))].slice(0,10);
 if(photos.length>1&&!modal.querySelector('.modal-gallery')){const hero=modal.querySelector('.modal-hero img'),body=modal.querySelector('.modal-body'),gallery=document.createElement('div');gallery.className='modal-gallery';gallery.innerHTML=photos.map((url,i)=>'<button type="button" class="'+(i===0?'active':'')+'" aria-label="Фото '+(i+1)+'"><img src="'+esc(url)+'" alt="" loading="lazy"></button>').join('');gallery.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!hero)return;gallery.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));hero.src=b.querySelector('img').src});if(body)modal.insertBefore(gallery,body)}
 const info=modal.querySelector('.modal-info');
 if(info&&!info.dataset.priceAdded){const min=Number(p.price_min||0),max=Number(p.price_max||0),avg=Number(p.avg_check||0),unit=window.currencyForCity?.(p.city_key)||'₽',label=avg?'Средний чек':(min||max?'Стоимость':''),value=avg?avg.toLocaleString('ru-RU')+' '+unit:(min&&max?min.toLocaleString('ru-RU')+'–'+max.toLocaleString('ru-RU')+' '+unit:min?'от '+min.toLocaleString('ru-RU')+' '+unit:max?'до '+max.toLocaleString('ru-RU')+' '+unit:'');if(label&&value){const card=document.createElement('div');card.className='modal-info-card';card.innerHTML='<div class="label">'+label+'</div><div class="value">'+value+'</div>';info.appendChild(card)}info.dataset.priceAdded='1'}
 const body=modal.querySelector('.modal-body');
 if(body&&!body.querySelector('.similar-section')){const similar=PLACES.filter(x=>String(x.id)!==String(p.id)&&x.city_key===p.city_key&&x.category===p.category).slice(0,3);if(similar.length){const section=document.createElement('section');section.className='similar-section';section.innerHTML='<h3>Похожие места в этом городе</h3><div class="grid">'+similar.map(placeCardHTML).join('')+'</div>';body.appendChild(section)}}
 return result;
};
document.addEventListener('DOMContentLoaded',()=>{if($('mapList'))renderMapList()});
})();

/* ---- next feature module ---- */

(function(){
function hasPrice(p){return Number(p.avg_check||p.price_min||p.price_max||0)>0}
function currencyFor(cityKey){
 const p=PLACES.find(x=>x.city_key===cityKey&&hasPrice(x)&&x.price_unit),unit=p?.price_unit||'';
 if(/AZN/i.test(unit))return 'AZN';if(/GEL/i.test(unit))return 'GEL';if(/KZT/i.test(unit))return 'KZT';if(/RUB|₽/i.test(unit))return '₽';
 const c=CITIES.find(x=>x.key===cityKey)?.country||'';
 return ({'Россия':'₽','Азербайджан':'AZN','Казахстан':'KZT','Грузия':'GEL','Турция':'TRY','Узбекистан':'UZS','Армения':'AMD','Беларусь':'BYN'})[c]||'местная валюта';
}
window.currencyForCity=currencyFor;
function updateCatalogBudget(){
 const el=$('priceFilter');if(!el)return;const city=$('cityFilter')?.value||'all';
 const data=PLACES.filter(p=>p.city_key===city&&hasPrice(p));
 if(city==='all'){el.innerHTML='<option value="0">Выберите город для бюджета</option>';el.value='0';el.disabled=true;return}
 if(!data.length){el.innerHTML='<option value="0">Цены не указаны</option>';el.value='0';el.disabled=true;return}
 const old=el.value||'0',cur=currencyFor(city);el.disabled=false;
 const maxPrice=Math.max(...data.map(p=>Math.max(Number(p.avg_check)||0,Number(p.price_min)||0,Number(p.price_max)||0)));
 const nice=n=>{const power=Math.pow(10,Math.floor(Math.log10(Math.max(1,n))));return Math.ceil(n/power)*power};
 const thresholds=[.2,.4,.6,.8,1].map(r=>nice(maxPrice*r)).filter((n,i,a)=>n>0&&a.indexOf(n)===i).sort((a,b)=>a-b);
 el.innerHTML='<option value="0">Любой бюджет</option>'+thresholds.map(n=>'<option value="'+n+'">До '+n.toLocaleString('ru-RU')+' '+cur+'</option>').join('');
 el.value=[...el.options].some(o=>o.value===old)?old:'0';
}
window.updateGuideBudget=function(){
 const city=$('guideCity')?.value||'all',input=$('guideBudget'),unit=$('guideCurrency');if(!input||!unit)return;
 const data=PLACES.filter(p=>p.city_key===city&&hasPrice(p));
 if(city==='all'){input.disabled=true;input.value='';input.placeholder='Сначала выберите город';unit.textContent='—';return}
 if(!data.length){input.disabled=true;input.value='';input.placeholder='Цены не указаны';unit.textContent=currencyFor(city);return}
 input.disabled=false;input.placeholder='Например, 3000';unit.textContent=currencyFor(city);
};
const oldRender=window.renderCatalog;
window.renderCatalog=function(){oldRender();updateCatalogBudget()};
const oldOnCity=window.onCity;
window.onCity=function(v){oldOnCity(v);updateCatalogBudget()};
const oldMapFilters=window.onMapFilters;
window.onMapFilters=function(){oldMapFilters();updateCatalogBudget()};
window.generateGuide=function(){
 const city=$('guideCity')?.value||'all',budget=city==='all'?0:Math.max(0,Number($('guideBudget')?.value||0)),duration=Number($('guideDuration')?.value||4),cat=$('guideCategory')?.value||'all';
 let list=PLACES.filter(p=>(city==='all'||p.city_key===city)&&(cat==='all'||p.category===cat));
 if(budget>0)list=list.filter(p=>{const n=Number(p.avg_check||p.price_min||p.price_max||0);return !n||n<=budget});
 list.sort((a,b)=>(Number(b.rating)||0)-(Number(a.rating)||0));list=list.slice(0,duration===2?4:duration===4?6:8);
 const unit=city==='all'?'':currencyFor(city);
 $('guideCaption').textContent=list.length?'Подобрали '+list.length+' вариантов'+(budget?' в пределах '+budget.toLocaleString('ru-RU')+' '+unit:'')+'.':'По этим параметрам пока ничего не нашлось.';
 $('guideResults').innerHTML=list.length?list.map(placeCardHTML).join(''):'<div class="empty" style="grid-column:1/-1"><div class="empty-title">Попробуем иначе?</div><div class="empty-text">Измените город, бюджет или категорию.</div></div>';
};
window.createWeekendRoute=function(){
 const city=$('guideCity')?.value||'all';if(city==='all'){toast('Сначала выберите город');return}
 let pts=PLACES.filter(p=>p.city_key===city&&hasMapCoords(p)&&!p.is_approx).sort((a,b)=>(Number(b.rating)||0)-(Number(a.rating)||0));
 if(pts.length<2){toast('Недостаточно мест с точными координатами');return}
 const ordered=[pts.shift()];while(pts.length&&ordered.length<6){const last=ordered[ordered.length-1];let best=0,bestD=Infinity;pts.forEach((p,i)=>{const r=x=>x*Math.PI/180,dl=r(p.latitude-last.latitude),dn=r(p.longitude-last.longitude),a=Math.sin(dl/2)**2+Math.cos(r(last.latitude))*Math.cos(r(p.latitude))*Math.sin(dn/2)**2,d=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));if(d<bestD){bestD=d;best=i}});ordered.push(pts.splice(best,1)[0])}
 window.clearMyRoute();ordered.forEach(p=>window.addToMyRoute(p.id));nav('routes');toast('Маршрут на выходные собран из '+ordered.length+' мест');
};
document.addEventListener('DOMContentLoaded',()=>{updateCatalogBudget();updateGuideBudget()});
})();

/* ---- next feature module ---- */

(function(){
const oldRender=window.renderCollections;
const defs=[
{id:'outdoor',name:'На свежем воздухе',icon:'🌿',desc:'Парки, сады, набережные и красивые виды',cats:['park','nature','garden','embankment','viewpoint','square','beach','sea','trips','resort']},
{id:'family',name:'С детьми',icon:'🧸',desc:'Зоопарки, аквапарки и семейные развлечения',cats:['zoo','aquarium','aquapark','park','attraction','entertainment']},
{id:'date',name:'Идея для свидания',icon:'♥',desc:'Красивые виды, уютные кафе и спокойный отдых',cats:['viewpoint','embankment','sea','beach','restaurant','cafe','lounge','spa','resort']},
{id:'culture',name:'История и культура',icon:'🏛️',desc:'Музеи, исторические места, театры и пространства',cats:['museum','historic','monument','theatre','cultural_space']},
{id:'active',name:'Активный отдых',icon:'🎯',desc:'Игры, развлечения, VR и поездки',cats:['gaming','aquapark','entertainment','trips','vr','quest','karting','bowling','billiards','gamecenter']},
{id:'evening',name:'Вечерний город',icon:'🌙',desc:'Кафе, рестораны, кино, театр и вечерние места',cats:['restaurant','cafe','coffee','lounge','nightclub','cinema','theatre','embankment','viewpoint']},
{id:'wellness',name:'Спа и перезагрузка',icon:'♨️',desc:'Бани, SPA и места для спокойного отдыха',cats:['spa','bath','thermal','resort']},
{id:'rainy',name:'На случай дождя',icon:'☔',desc:'Музеи, кафе, кино и развлечения в помещении',cats:['museum','cafe','coffee','mall','cinema','theatre','gaming','entertainment','spa','bath','aquarium','aquapark','cultural_space']},
{id:'photos',name:'Красивые виды',icon:'📸',desc:'Смотровые площадки, набережные и фотолокации',cats:['viewpoint','embankment','sea','beach','square','garden','historic','attraction','park']},
{id:'free',name:'Бесплатно',icon:'🆓',desc:'Места, для которых в каталоге указано бесплатное посещение',free:true},
{id:'coffee',name:'Кофе-пауза',icon:'☕',desc:'Кофейни, кафе и пекарни для короткого отдыха',cats:['coffee','cafe','bakery']}
];
function themePlaces(d){return PLACES.filter(p=>d.free?(Number(p.price_min)===0||/бесплат|свободн/i.test(String(p.price_unit||''))):d.cats.includes(p.category))}
function themeCardMarkup(d){const list=themePlaces(d);if(list.length<3)return '';const p=list.find(x=>x.image)||list[0];return '<article class="place-card theme-collection-card" role="button" tabindex="0" data-theme-id="'+d.id+'"><div class="place-img"><img src="'+esc(photo(p))+'" alt="" loading="lazy"><div class="place-cat">'+d.icon+' Подборка</div></div><div class="place-body"><h3 class="place-title">'+esc(d.name)+'</h3><p class="place-desc">'+esc(d.desc)+'</p><div class="place-foot"><span class="theme-count">'+list.length+' мест</span><span class="place-more">Смотреть →</span></div></div></article>'}
function bindThemeCards(grid){grid?.querySelectorAll('[data-theme-id]').forEach(card=>{card.addEventListener('click',()=>window.openThemeCollection(card.dataset.themeId));card.addEventListener('keydown',e=>{if(e.key==='Enter')window.openThemeCollection(card.dataset.themeId)})})}
function renderHomeThemes(){const grid=$('homeThemesGrid');if(!grid)return;grid.innerHTML=['outdoor','family','date','active'].map(id=>themeCardMarkup(defs.find(d=>d.id===id))).join('');bindThemeCards(grid)}
const oldHome=window.renderHomePlaces;
window.renderHomePlaces=function(){oldHome();renderHomeThemes()};
window.renderCollections=function(){oldRender();const grid=$('themedCollectionsGrid');if(!grid)return;grid.innerHTML=defs.map(themeCardMarkup).join('');bindThemeCards(grid)};

window.openThemeCollection=function(id){
 const d=defs.find(x=>x.id===id);if(!d)return;const list=themePlaces(d);
 $('modal').innerHTML='<div style="padding:28px;background:linear-gradient(135deg,#344f3c,#202b29);color:#fff;position:relative"><button class="modal-close" onclick="closeModal()">✕</button><div style="font-size:36px;margin-bottom:10px">'+d.icon+'</div><div class="eyebrow" style="color:#e6c18a">Подборка по настроению</div><h2 style="font:700 30px Fraunces,Georgia,serif;margin-bottom:7px">'+esc(d.name)+'</h2><p style="color:#e3e8e2;font-size:13px">'+esc(d.desc)+'</p><p style="margin-top:10px;color:#d4dfd4;font-size:11px">'+list.length+' мест в каталоге</p></div><div class="modal-body"><div class="grid">'+list.map(placeCardHTML).join('')+'</div></div>';
 $('overlay').classList.add('open');document.body.style.overflow='hidden';
};
})();

/* ---- next feature module ---- */

(function(){
window.openMyRouteMap=function(){
 let ids=[];try{ids=JSON.parse(localStorage.getItem('kwk_my_route')||'[]').map(String)}catch(e){}
 const pts=ids.map(findPlace).filter(p=>p&&hasMapCoords(p)&&!p.is_approx);
 if(pts.length<2){toast('Добавьте минимум два места с точными координатами');return}
 const id='__my_custom_route__';let route=ROUTES.find(r=>String(r.id)===id);
 if(!route){route={id,city:pts[0].city,name:'Мой маршрут',duration:'',distance:'',desc:'Ваш личный маршрут из сохранённых мест.',points:ids};ROUTES.unshift(route)}
 else{route.city=pts[0].city;route.points=ids;route.desc='Ваш личный маршрут из сохранённых мест.'}
 openRoute(id);
 openRouteMapChooser(id);
};
})();
