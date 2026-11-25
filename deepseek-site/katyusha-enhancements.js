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
window.renderHomePlaces=function(){const ranked=PLACES.filter(p=>p.image&&p.image!==PLACEHOLDER).slice().sort((a,b)=>(Number(b.rating)||0)-(Number(a.rating)||0));const list=spreadPlacesAcrossCities(ranked).slice(0,8);$('homePlaces').innerHTML=list.map(placeCardHTML).join('');renderRecent()};
function renderRecent(){const ids=recent.filter(id=>{const p=findPlace(id);return p&&p.image&&p.image!==PLACEHOLDER}).slice(0,6);const sec=$('recentSection');if(!sec)return;sec.hidden=!ids.length;$('recentGrid').innerHTML=ids.map(id=>placeCardHTML(findPlace(id))).join('')}
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
window.findNearby=function(){if(!navigator.geolocation){toast('Геолокация недоступна');return}toast('Определяем местоположение…');navigator.geolocation.getCurrentPosition(({coords})=>{const near=PLACES.filter(p=>hasMapCoords(p)&&!p.is_approx&&p.image&&p.image!==PLACEHOLDER).map(p=>({...p,_km:distance(coords.latitude,coords.longitude,p.latitude,p.longitude)})).sort((a,b)=>a._km-b._km).slice(0,8);$('nearbySection').hidden=false;$('nearbyCaption').textContent='Ближайшие места по расстоянию от вашей геопозиции';$('nearbyGrid').innerHTML=near.map(p=>placeCardHTML({...p,description:(p._km<1?Math.round(p._km*1000)+' м от вас':p._km.toFixed(1)+' км от вас')+(p.description?' · '+p.description:'')})).join('');$('nearbySection').scrollIntoView({behavior:'smooth',block:'start'});toast('Нашли '+near.length+' мест поблизости')},()=>toast('Разрешите доступ к геолокации в браузере'),{enableHighAccuracy:false,timeout:10000,maximumAge:300000})};
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
function themeCardMarkup(d){const list=themePlaces(d).filter(x=>x.image&&x.image!==PLACEHOLDER);if(!list.length)return '';const p=list[0];return '<article class="place-card theme-collection-card" role="button" tabindex="0" data-theme-id="'+d.id+'"><div class="place-img"><img src="'+esc(photo(p))+'" alt="" loading="lazy"><div class="place-cat">'+d.icon+' Подборка</div></div><div class="place-body"><h3 class="place-title">'+esc(d.name)+'</h3><p class="place-desc">'+esc(d.desc)+'</p><div class="place-foot"><span class="theme-count">'+list.length+' мест</span><span class="place-more">Смотреть →</span></div></div></article>'}
function bindThemeCards(grid){grid?.querySelectorAll('[data-theme-id]').forEach(card=>{card.addEventListener('click',()=>window.openThemeCollection(card.dataset.themeId));card.addEventListener('keydown',e=>{if(e.key==='Enter')window.openThemeCollection(card.dataset.themeId)})})}
function renderHomeThemes(){const grid=$('homeThemesGrid');if(!grid)return;grid.innerHTML=['outdoor','family','date','active'].map(id=>themeCardMarkup(defs.find(d=>d.id===id))).join('');bindThemeCards(grid)}
const oldHome=window.renderHomePlaces;
window.renderHomePlaces=function(){oldHome();renderHomeThemes()};
window.renderCollections=function(){oldRender();const grid=$('themedCollectionsGrid');if(!grid)return;grid.innerHTML=defs.map(themeCardMarkup).join('');bindThemeCards(grid)};

window.openThemeCollection=function(id){
 const d=defs.find(x=>x.id===id);if(!d)return;const list=themePlaces(d).filter(x=>x.image&&x.image!==PLACEHOLDER);
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

/* ===== Premium UX and interaction layer ===== */
(function(){
'use strict';
const $=function(id){return document.getElementById(id)};
const icons={all:'layers',park:'trees',nature:'mountain',garden:'flower-2',embankment:'waves',viewpoint:'binoculars',square:'landmark',beach:'umbrella',sea:'waves',trips:'route',resort:'palmtree',restaurant:'utensils',cafe:'coffee',coffee:'coffee',bakery:'croissant',museum:'landmark',historic:'landmark',monument:'landmark',theatre:'drama',cultural_space:'building-2',gaming:'gamepad-2',karting:'flag',aquapark:'waves',entertainment:'ticket',vr:'glasses',quest:'puzzle',zoo:'paw-print',aquarium:'fish',hotel:'bed-double',cinema:'clapperboard',spa:'sparkles',bath:'bath',mall:'shopping-bag',nightclub:'music-2',default:'map-pin'};
function iconFor(k){return icons[k]||icons.default}
function drawChips(){
 const host=$('chips');if(!host)return;
 const used=[...new Set(PLACES.map(p=>p.category).filter(Boolean))].sort((a,b)=>categoryName(a).localeCompare(categoryName(b),'ru'));
 const selected=Array.isArray(state.catalogCats)?state.catalogCats:[];
 host.innerHTML=[['all','Все'],...used.map(k=>[k,categoryName(k)])].map(([k,label])=>'<button type="button" class="chip'+((k==='all'?!selected.length:selected.includes(k))?' active':'')+'" data-category="'+encodeURIComponent(k)+'" aria-pressed="'+(k==='all'?!selected.length:selected.includes(k))+'"><i class="chip-icon" data-lucide="'+iconFor(k)+'" aria-hidden="true"></i><span>'+esc(label)+'</span></button>').join('');
 let note=host.parentElement.querySelector('.kw-multi-filter-note');
 if(!note){note=document.createElement('div');note.className='kw-multi-filter-note';host.parentElement.insertBefore(note,host);}
 note.textContent=selected.length?'Выбрано категорий: '+selected.length+' · показаны места из любой выбранной категории':'Можно выбрать несколько категорий одновременно';
 if(window.lucide&&lucide.createIcons)lucide.createIcons({attrs:{'stroke-width':1.8}});
 if(!host.dataset.multiFilterBound){host.dataset.multiFilterBound='1';host.addEventListener('click',event=>{const button=event.target.closest('button[data-category]');if(!button)return;const value=decodeURIComponent(button.dataset.category||'all');if(typeof window.filterCat==='function')window.filterCat(value);});}
}
window.renderChips=drawChips;
function priceText(p){
 const avg=Number(p.avg_check)||0,minRaw=p.price_min,maxRaw=p.price_max,min=minRaw===null||minRaw===undefined||minRaw===''?NaN:Number(minRaw),max=maxRaw===null||maxRaw===undefined||maxRaw===''?NaN:Number(maxRaw),unit=window.currencyForCity?currencyForCity(p.city_key):(p.price_unit||'');
 if(p.is_free===true||(min===0&&minRaw!==null&&minRaw!==undefined&&minRaw!=='')||/бесплат/i.test(String(p.price_unit||'')))return 'Бесплатно';
 if(avg>0)return '≈ '+avg.toLocaleString('ru-RU')+' '+unit;
 if(min>0&&max>0)return min.toLocaleString('ru-RU')+'–'+max.toLocaleString('ru-RU')+' '+unit;
 if(max>0)return 'до '+max.toLocaleString('ru-RU')+' '+unit;
 if(min>0)return 'от '+min.toLocaleString('ru-RU')+' '+unit;
 return '';
}
window.kwImageError=function(img){
 if(!img||img.dataset.kwFailed)return;img.dataset.kwFailed='1';
 const holder=img.closest('.place-img,.city-card,.modal-hero,.route-point');
 if(holder){holder.classList.add('image-fallback');const cat=img.closest('.place-card')?.dataset.category||'default';holder.dataset.fallbackIcon=({park:'🌳',nature:'🏞',restaurant:'🍽',cafe:'☕',museum:'🏛',beach:'🏖',hotel:'⌂',gaming:'🎮'})[cat]||'✦'}
 img.onerror=null;if(window.PLACEHOLDER)img.src=PLACEHOLDER;
};
document.addEventListener('error',function(e){if(e.target&&e.target.tagName==='IMG')window.kwImageError(e.target)},true);
window.placeCardHTML=function(p){
 let fav=false;try{fav=favorites.includes(String(p.id))}catch(e){}
 const price=priceText(p);
 return '<article class="place-card" data-place-id="'+esc(p.id)+'" data-category="'+esc(p.category||'')+'" tabindex="0" role="button" aria-label="Открыть место '+esc(p.title)+'" onclick="openPlace(\''+esc(p.id)+'\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openPlace(\''+esc(p.id)+'\')}"><div class="place-img"><img src="'+esc(photo(p))+'" alt="'+esc(p.title)+'" loading="lazy" onerror="window.kwImageError(this)">'+(p.rating?'<div class="place-rating">★ '+esc(p.rating)+(p.review_count?' · '+Number(p.review_count).toLocaleString('ru-RU')+' отзывов':'')+'</div>':'')+(price?'<div class="place-price">'+esc(price)+'</div>':'')+'<button class="place-fav'+(fav?' active':'')+'" type="button" onclick="event.stopPropagation();toggleFav(\''+esc(p.id)+'\')" aria-label="'+(fav?'Убрать из избранного':'В избранное')+'">'+(fav?'♥':'♡')+'</button><div class="place-cat">'+esc(categoryName(p.category))+'</div></div><div class="place-body"><h3 class="place-title">'+esc(p.title)+'</h3><div class="place-addr">'+esc(p.address||p.city)+'</div><p class="place-desc">'+esc(p.description||'Описание этого места скоро появится.')+'</p><div class="place-foot"><span class="place-city">'+esc(p.city)+'</span><span class="place-more">Подробнее →</span></div></div></article>';
};
function wrapChips(){
 const host=$('chips');if(!host||host.closest('.kw-chip-shell'))return;
 const shell=document.createElement('div'),left=document.createElement('button'),right=document.createElement('button');
 shell.className='kw-chip-shell';left.type=right.type='button';left.className=right.className='kw-chip-arrow';left.textContent='‹';right.textContent='›';left.setAttribute('aria-label','Прокрутить категории влево');right.setAttribute('aria-label','Прокрутить категории вправо');
 host.parentNode.insertBefore(shell,host);shell.append(left,host,right);host.classList.add('kw-chip-scroll');
 const refresh=function(){left.disabled=host.scrollLeft<=2;right.disabled=host.scrollLeft+host.clientWidth>=host.scrollWidth-2};
 left.onclick=function(){host.scrollBy({left:-Math.max(220,host.clientWidth*.7),behavior:'smooth'})};right.onclick=function(){host.scrollBy({left:Math.max(220,host.clientWidth*.7),behavior:'smooth'})};
 host.addEventListener('scroll',refresh,{passive:true});if(window.ResizeObserver)new ResizeObserver(refresh).observe(host);
 host.addEventListener('wheel',function(e){if(Math.abs(e.deltaY)>Math.abs(e.deltaX)){host.scrollLeft+=e.deltaY;e.preventDefault()}},{passive:false});
 let down=false,start=0,origin=0;
 host.addEventListener('pointerdown',function(e){if(e.pointerType==='touch')return;down=true;start=e.clientX;origin=host.scrollLeft;host.classList.add('is-dragging');host.setPointerCapture(e.pointerId)});
 host.addEventListener('pointermove',function(e){if(down)host.scrollLeft=origin-(e.clientX-start)});
 const stop=function(){down=false;host.classList.remove('is-dragging')};host.addEventListener('pointerup',stop);host.addEventListener('pointercancel',stop);host.addEventListener('lostpointercapture',stop);refresh();
}
const oldRender=window.renderCatalog;
window.renderCatalog=function(){oldRender();wrapChips();drawChips()};
const oldFilter=window.filterCat;
window.filterCat=function(k){oldFilter(k);drawChips()};
function findCity(value){
 const q=String(value||'').toLowerCase().trim();if(!q)return null;
 const entries=CITIES.map(c=>({city:c,full:(c.name+' '+(c.country||'')).toLowerCase()}));
 return (entries.find(x=>x.full===q)||entries.find(x=>x.city.name.toLowerCase().startsWith(q))||entries.find(x=>x.full.includes(q))||{}).city||null;
}
window.openHomeCity=function(){
 const input=$('homeCity'),q=(input?.value||'').toLowerCase().trim();
 if(!q||q==='все города'){openCity('all');return}
 const city=findCity(q);
 if(city){input.value=city.name;openCity(city.key);return}
 state.city='all';state.cat='all';state.search=q;$('cityFilter').value='all';$('searchInput').value=q;drawChips();nav('catalog');
};
function setupMapSplit(){
 const view=$('view-map'),stage=view?.querySelector('.map-stage'),bar=view?.querySelector('.map-list-bar'),list=$('mapList');
 if(!view||!stage||!bar||!list||view.querySelector('.kw-map-split'))return;
 const split=document.createElement('div'),left=document.createElement('div'),right=document.createElement('div');
 split.className='kw-map-split';left.className='kw-map-results';right.className='kw-map-canvas';
 stage.parentNode.insertBefore(split,stage);left.append(bar,list);right.append(stage);split.append(left,right);
 list.hidden=false;if($('mapListToggle'))$('mapListToggle').hidden=true;
 const count=document.createElement('p');count.id='kwMapLiveCount';count.className='kw-map-count';bar.insertBefore(count,bar.querySelector('button'));
}
function highlight(id,on){
 if(typeof markers==='undefined')return;
 const marker=markers.find(m=>String(m._kwPlaceId)===String(id));if(marker&&marker._icon)marker._icon.classList.toggle('kw-marker-active',on);
 const card=$('mapList')?.querySelector('[data-place-id="'+CSS.escape(String(id))+'"]');if(card)card.classList.toggle('is-map-active',on);
}
function renderSplitList(){
 const list=$('mapList');if(!list)return;const all=filteredPlaces(true),exact=all.filter(p=>!p.is_approx&&hasMapCoords(p));
 const counter=$('kwMapLiveCount');if(counter)counter.textContent='Найдено '+all.length+' мест · на карте '+exact.length;
 const parent=list.parentElement,oldScroll=parent?parent.scrollTop:0;
 list.innerHTML=all.map(placeCardHTML).join('')||'<div class="empty">По этим фильтрам мест не найдено.</div>';
 if(parent)parent.scrollTop=oldScroll;
 list.querySelectorAll('[data-place-id]').forEach(card=>{const id=card.dataset.placeId;card.addEventListener('mouseenter',()=>highlight(id,true));card.addEventListener('mouseleave',()=>highlight(id,false))});
}
const oldUpdate=window.updateMapMarkers;
window.updateMapMarkers=function(){
 oldUpdate();setupMapSplit();renderSplitList();
 const exact=filteredPlaces(true).filter(p=>!p.is_approx&&hasMapCoords(p));
 if(typeof markers!=='undefined')markers.forEach((m,i)=>m._kwPlaceId=exact[i]?.id);
};
window.toggleMapList=function(){setupMapSplit();renderSplitList()};
const oldNav=window.nav;
window.nav=function(view){oldNav(view);if(view==='map')setTimeout(function(){setupMapSplit();renderSplitList();if(typeof mapInst!=='undefined')mapInst?.invalidateSize()},180)};
const oldMapFilter=window.onMapFilters;
window.onMapFilters=function(){oldMapFilter();renderSplitList()};
const oldOpen=window.openPlace;
window.openPlace=function(id){
 const result=oldOpen(id),modal=$('modal');if(!modal)return result;
 const hero=modal.querySelector('.modal-hero'),title=modal.querySelector('.modal-title'),body=modal.querySelector('.modal-body');
 if(hero&&title&&body){hero.classList.add('kw-modal-photo');modal.insertBefore(title,modal.querySelector('.modal-gallery')||modal.querySelector('#photoCredit')||body)}
 const p=findPlace(id);
 if(p&&title){
  const reviews=Number(p.reviews_count||p.review_count||p.reviews||0),rating=title.querySelector('.modal-badge-rating');
  if(rating)rating.textContent='★ '+Number(p.rating||0).toFixed(1)+(reviews?' · '+reviews.toLocaleString('ru-RU')+' отзывов':'');
  if(body&&!body.querySelector('.modal-map-credit'))body.insertAdjacentHTML('beforeend','<div class="modal-map-credit"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a></div>');
 }
 return result;
};
function ids(){try{return JSON.parse(localStorage.getItem('kwk_my_route')||'[]').map(String).slice(0,12)}catch(e){return[]}}
function addFloat(){
 if($('kwRouteFloat'))return;
 const el=document.createElement('aside');el.id='kwRouteFloat';el.className='kw-route-float';el.hidden=true;
 el.innerHTML='<strong id="kwRouteFloatCount">Мой маршрут (0 мест)</strong><button type="button" onclick="nav(\'routes\');document.getElementById(\'view-routes\').scrollIntoView({behavior:\'smooth\'})">К маршруту</button><button type="button" class="secondary" onclick="shareMyRoute()">Поделиться маршрутом</button>';
 document.body.appendChild(el);
}
function updateFloat(){addFloat();const a=ids(),el=$('kwRouteFloat'),count=$('kwRouteFloatCount');el.hidden=!a.length;if(count)count.textContent='Мой маршрут ('+a.length+' '+(a.length===1?'место':a.length<5?'места':'мест')+')'}
window.shareMyRoute=async function(){
 const a=ids();if(!a.length){toast('Сначала добавьте места в маршрут');return}
 const u=new URL(location.href);u.searchParams.set('route',a.join(','));const value=u.toString();
 try{await navigator.clipboard.writeText(value)}catch(e){const t=document.createElement('textarea');t.value=value;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove()}
 toast('Ссылка на маршрут скопирована');
};
const oldAdd=window.addToMyRoute,oldRemove=window.removeFromMyRoute,oldClear=window.clearMyRoute,oldRoutes=window.renderRoutes;
if(oldAdd)window.addToMyRoute=function(id){oldAdd(id);updateFloat()};
if(oldRemove)window.removeFromMyRoute=function(id){oldRemove(id);updateFloat()};
if(oldClear)window.clearMyRoute=function(){oldClear();updateFloat()};
if(oldRoutes)window.renderRoutes=function(){oldRoutes();updateFloat()};
function importRoute(){
 const raw=new URLSearchParams(location.search).get('route');if(!raw||window._kwSharedRouteLoaded)return;window._kwSharedRouteLoaded=true;
 const valid=raw.split(',').map(x=>x.trim()).filter(x=>findPlace(x));
 if(!valid.length)return;valid.forEach(x=>window.addToMyRoute?.(x));updateFloat();toast('Маршрут загружен по ссылке');
}
const oldRenderNav=window.renderNav;
if(oldRenderNav)window.renderNav=function(){oldRenderNav();importRoute();updateFloat()};
document.addEventListener('DOMContentLoaded',function(){wrapChips();setupMapSplit();addFloat();updateFloat();if(window.lucide?.createIcons)lucide.createIcons()});
})();


/* ===== Country-first filter repair: keep catalog and map in sync ===== */
(function(){
'use strict';
const $=id=>document.getElementById(id);
function categoriesFor(country,city){
 return [...new Set(PLACES.filter(p=>(country==='all'||p.country===country)&&(city==='all'||p.city_key===city)).map(p=>p.category).filter(Boolean))]
 .sort((a,b)=>categoryName(a).localeCompare(categoryName(b),'ru'));
}
function syncMapCategory(country,city,preserve){
 const el=$('mapCatFilter');if(!el)return;
 const old=preserve?(el.value||state.mapCat||state.cat):'all',used=categoriesFor(country,city);
 el.innerHTML='<option value="all">Все категории</option>'+used.map(k=>'<option value="'+esc(k)+'">'+esc(categoryName(k))+'</option>').join('');
 el.value=used.includes(old)?old:'all';state.mapCat=el.value;
}
function syncControls(country,city){
 const c=$('countryFilter'),mc=$('mapCountryFilter');
 if(c)c.value=country;if(mc)mc.value=country;
 if(typeof updateCityFilterOptions==='function')updateCityFilterOptions(country,city);
 const ci=$('cityFilter'),mi=$('mapCityFilter');
 if(ci)ci.value=city;if(mi)mi.value=city;
}
function repaint(mapToo){
 if(typeof window.renderCatalog==='function')window.renderCatalog();
 if((mapToo||state.view==='map')&&typeof window.updateMapMarkers==='function')window.updateMapMarkers();
}
window.onCountry=function(value){
 const country=value||'all',city='all';
 state.country=state.mapCountry=country;state.city=state.mapCity=city;
 syncControls(country,city);syncMapCategory(country,city,true);
 state.cat=state.mapCat||'all';if($('mapCatFilter'))$('mapCatFilter').value=state.cat;
 repaint(true);
};
window.onCity=function(value){
 const country=$('countryFilter')?.value||state.country||'all',city=value||'all';
 state.country=state.mapCountry=country;state.city=state.mapCity=city;
 syncControls(country,city);syncMapCategory(country,city,true);
 state.cat=state.mapCat||'all';if($('mapCatFilter'))$('mapCatFilter').value=state.cat;
 repaint(true);
};
window.onMapCountry=function(value){
 const country=value||'all',city='all';
 state.country=state.mapCountry=country;state.city=state.mapCity=city;
 syncControls(country,city);syncMapCategory(country,city,true);
 state.cat=state.mapCat||'all';if($('mapCatFilter'))$('mapCatFilter').value=state.cat;
 repaint(true);
};
window.onMapFilters=function(){
 const country=$('mapCountryFilter')?.value||'all';
 const city=$('mapCityFilter')?.value||'all';
 syncControls(country,city);syncMapCategory(country,city,true);
 state.country=state.mapCountry=country;state.city=state.mapCity=city;
 state.cat=state.mapCat=$('mapCatFilter')?.value||'all';
 state.search=state.mapSearch=$('mapSearchFilter')?.value||'';
 if($('searchInput'))$('searchInput').value=state.search;
 if($('mapSearchFilter'))$('mapSearchFilter').value=state.search;
 repaint(true);
};
window.filterCat=function(value){
 const key=value||'all';
 if(key==='all')state.catalogCats=[];
 else{const selected=new Set(Array.isArray(state.catalogCats)?state.catalogCats:[]);if(selected.has(key))selected.delete(key);else selected.add(key);state.catalogCats=[...selected];}
 state.cat=state.catalogCats.length===1?state.catalogCats[0]:'all';
 state.mapCat=state.cat;
 if($('mapCatFilter'))$('mapCatFilter').value=state.mapCat;
 repaint(true);
 if(typeof window.renderChips==='function')window.renderChips();
 if(typeof window.renderCatalog==='function')window.renderCatalog();
};
})();



/* ===== v13 mobile catalog safety net ===== */
(function(){
 const baseNav=window.nav;
 if(typeof baseNav==='function'&&!baseNav.__kwMobileCatalogFix){
  const wrapped=function(view){
   const result=baseNav.apply(this,arguments);
   if(view==='catalog'){
    const host=document.getElementById('chips');
    if(host){host.hidden=false;host.removeAttribute('hidden');host.style.display='flex';drawChips();}
   }
   return result;
  };
  wrapped.__kwMobileCatalogFix=true;
  window.nav=wrapped;
 }
 const host=document.getElementById('chips');
 if(host){host.hidden=false;host.removeAttribute('hidden');}
})();

/* ===== HOME PAGE PHOTO INTEGRITY ===== */
(function(){
 const root=document.getElementById('view-home');if(!root)return;
 document.addEventListener('error',function(event){
  const img=event.target;if(!(img instanceof HTMLImageElement)||!root.contains(img)||img.closest('.hero'))return;
  const card=img.closest('.place-card,.city-card');if(!card)return;
  const grid=card.parentElement;card.remove();
  if(grid&&!grid.children.length){const section=grid.closest('section');if(section)section.hidden=true;}
 },true);
})();


