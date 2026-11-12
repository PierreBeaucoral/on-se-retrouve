import {useState,useEffect,useMemo,useRef} from "react";
import {Minus,Plus,LoaderCircle,ExternalLink,Share2} from "lucide-react";
import {computeTrip} from "@/lib/travel/client";
import {loadRailIndex,timetableDate,type RailIndex} from "@/lib/travel/rail-client";
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from "@/components/ui/select";
import {Tabs,TabsList,TabsTrigger,TabsContent} from "@/components/ui/tabs";
import {Table,TableHeader,TableBody,TableHead,TableCell,TableRow} from "@/components/ui/table";
import {Checkbox} from "@/components/ui/checkbox";
import {Progress} from "@/components/ui/progress";
import {initialGroups,places,placeOf,registerPlace,validCustom,nearestPlace,type Place,defaultDestinations,scenarios,rank,fastestModes,duration,originFor,tripKey,validMinutes,tripCost,costLabel,DEFAULT_KM_RATE,type Group,type Choice,type Mode,type Matrix,type Trip,type Leg} from "@/lib/travel/model";
import FranceMap from "./travel-map";
const nameOf=(id:string)=>placeOf(id)?.name||id;
const modeName=(m:Mode)=>m==="car"?"Voiture":"Train";
const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
function nextWeekend(){const n=new Date();const date=new Date(Date.UTC(n.getFullYear(),n.getMonth(),n.getDate()+((5-n.getDay()+7)%7||7)));const fri=date.toISOString().slice(0,10);date.setUTCDate(date.getUTCDate()+2);return [fri,date.toISOString().slice(0,10)];}
const initialDates=nextWeekend();
export default function Home(){
 const [groups,setGroups]=useState<Group[]>(initialGroups);
 const [destinations,setDestinations]=useState(defaultDestinations);
 const [outDate,setOutDate]=useState(initialDates[0]);const [backDate,setBackDate]=useState(initialDates[1]);
 const [outTime,setOutTime]=useState("14:00");const [backTime,setBackTime]=useState("16:00");
 const [matrix,setMatrix]=useState<Matrix>({});const [manual,setManual]=useState<Matrix>({});
 const [tab,setTab]=useState("car");const [scenarioIndex,setScenarioIndex]=useState(0);
 const [selected,setSelected]=useState<string|null>(null);const [busy,setBusy]=useState(false);const [progress,setProgress]=useState({done:0,total:0});
 const [status,setStatus]=useState("Prêt à calculer les trajets.");const [rail,setRail]=useState<RailIndex|null>(null);const [loaded,setLoaded]=useState(false);
 const [kmRate,setKmRate]=useState(DEFAULT_KM_RATE);
 const [openTickets,setOpenTickets]=useState<Set<string>>(new Set());const [showAllCities,setShowAllCities]=useState(false);
 const [manualSource,setManualSource]=useState("SNCF Connect");const [cityFilter,setCityFilter]=useState("");
 const abort=useRef<AbortController|null>(null);
 const outbound=`${outDate}T${outTime}`,inbound=`${backDate}T${backTime}`;
 const combinations=useMemo(()=>scenarios(groups),[groups]);
 const index=tab==="car"?0:tab==="train"?combinations.length-1:Math.min(scenarioIndex,combinations.length-1);
 const modes=combinations[index];
 const effective=useMemo(()=>({...matrix,...manual}),[matrix,manual]);
 const rows=useMemo(()=>rank(groups,destinations,tab==="fastest"?(d:string)=>fastestModes(groups,d,effective):modes,effective),[groups,destinations,modes,effective,tab]);
 // Who travels how, by group name: "Voiture : A, B · Train : C".
 const whoGoes=(ms:Mode[])=>(["car","train"] as const).map(m=>{const names=groups.filter((_,i)=>ms[i]===m).map(g=>g.name);return names.length?`${m==="car"?"Voiture":"Train"} : ${names.join(", ")}`:"";}).filter(Boolean).join(" · ");
 // The view follows the best destination until someone picks another one.
 const winner=rows.find(r=>r.complete);const activeId=selected&&destinations.includes(selected)?selected:(winner?.id??destinations[0]);
 const active=rows.find(r=>r.id===activeId)||rows[0];
 const carDown=Object.entries(matrix).some(([k,t])=>k.endsWith("|car")&&!t.out&&/IGN/.test(t.error??""));
 const complete=rows.filter(r=>r.complete);const costOf=(r:{trips:{mode:Mode;trip?:Trip}[]})=>tripCost(groups,r.trips,kmRate);const best=complete[0];
 const comparison=useMemo(()=>combinations.map((m,i)=>({i,m,result:rank(groups,destinations,m,effective).find(r=>r.complete)})).sort((a,b)=>(a.result?.max??Infinity)-(b.result?.max??Infinity)||(a.result?.mean??Infinity)-(b.result?.mean??Infinity)||a.i-b.i),[groups,destinations,combinations,effective]);
 const validDates=!!outDate&&!!backDate&&!!outTime&&!!backTime&&inbound>outbound;
 const railOut=rail?timetableDate(rail,outDate):null,railBack=rail?timetableDate(rail,backDate):null;const railCovers=!!railOut&&!!railBack;const railProjected=!!railOut?.projected||!!railBack?.projected;
 const frDate=(d:string)=>d.split("-").reverse().join("/");
 function resetForNewDates(){setMatrix({});setManual({});setProgress({done:0,total:0});setStatus("Dates modifiées : relancez le calcul pour ce week-end.");}
 function updateOutDate(v:string){setOutDate(v);resetForNewDates();}
 function updateBackDate(v:string){setBackDate(v);resetForNewDates();}
 function updateOutTime(v:string){setOutTime(v);resetForNewDates();}
 function updateBackTime(v:string){setBackTime(v);resetForNewDates();}
 // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted preferences after mount (localStorage is unavailable during SSR)
 useEffect(()=>{loadRailIndex().then(setRail);try{const shared=location.hash.startsWith("#partage=")?decodeURIComponent(location.hash.slice(9)):"";if(shared)history.replaceState(null,"",location.pathname+location.search);const saved=JSON.parse(shared||localStorage.getItem("retrouve.preferences.v1")||"null");if(saved){if(typeof saved.kmRate==="number"&&saved.kmRate>=0&&saved.kmRate<=2)setKmRate(saved.kmRate);if(Array.isArray(saved.destinations)&&saved.destinations.length&&saved.destinations.every((id:unknown)=>typeof id==="string"&&places.some(p=>p.id===id)))setDestinations(saved.destinations);if(Array.isArray(saved.groups)&&saved.groups.length>=2&&saved.groups.length<=10&&new Set(saved.groups.map((g:Group)=>g.id)).size===saved.groups.length&&saved.groups.every((g:Group)=>typeof g.id==="string"&&typeof g.name==="string"&&g.name.length<=70&&(places.some(p=>p.id===g.place)||validCustom(g))&&(!g.railPlace||places.some(p=>p.id===g.railPlace))&&["both","train","car"].includes(g.choice)&&validMinutes(g.access)&&(g.people===undefined||(Number.isInteger(g.people)&&g.people>=1&&g.people<=20)))){saved.groups.forEach((g:Group)=>{if(g.custom)registerPlace(g.custom);});setGroups(saved.groups);}}}catch{/* préférences illisibles : on garde les valeurs par défaut */}setLoaded(true);return ()=>abort.current?.abort();},[]);
 useEffect(()=>{if(loaded)try{localStorage.setItem("retrouve.preferences.v1",JSON.stringify({groups,destinations,kmRate}));}catch{/* stockage indisponible */}},[groups,destinations,kmRate,loaded]);
 async function share(){const url=`${location.origin}${location.pathname}#partage=${encodeURIComponent(JSON.stringify({groups,destinations,kmRate}))}`;try{await navigator.clipboard.writeText(url);setStatus("Lien copié. Il contient les noms de vos groupes : envoyez-le en privé.");}catch{setStatus("Copie impossible dans ce navigateur.");}}
 // A searched town: road trips start from it; trains start from the nearest listed city with a station.
 function pickCommune(g:Group,p:Place){registerPlace(p);const withStation=places.filter(x=>rail?x.id in rail.stations:x.stations.length>0);const near=nearestPlace(p.lon,p.lat,withStation);updateGroup(g.id,{place:p.id,custom:p,railPlace:near?.id});setStatus(`${p.name} ajoutée. Train au départ de ${near?.name??"?"} : ajoutez le trajet jusqu’à la gare dans la marge d’accès.`);}
 function updateGroup(id:string,update:Partial<Group>){setGroups(gs=>gs.map(g=>g.id===id?{...g,...update}:g));setScenarioIndex(0);}
 async function calculate(){if(busy||!validDates||!destinations.length)return;const controller=new AbortController();abort.current=controller;setBusy(true);
 const jobs=new Map<string,{origin:string;destination:string;mode:Mode}>();for(const destination of destinations)for(const g of groups)for(const mode of (g.choice==="both"?["car","train"]:[g.choice]) as Mode[]){const origin=originFor(g,mode);const key=tripKey(origin,destination,mode);if(!matrix[key]?.out||!matrix[key]?.back)jobs.set(key,{origin,destination,mode});}
 setProgress({done:0,total:jobs.size});let done=0;const failures={car:0,train:0};
 try{for(const [key,job] of jobs){if(controller.signal.aborted)break;setStatus(`Calcul en cours : ${done+1} sur ${jobs.size} (${modeName(job.mode).toLowerCase()}, ${nameOf(job.origin)} → ${nameOf(job.destination)})`);
 let result:Trip;
 try{result=await computeTrip(job,outbound,inbound,controller.signal);}catch{if(controller.signal.aborted)break;result={error:"Calcul impossible pour ce trajet. Vous pouvez réessayer."};}
 if(!result.out||!result.back)failures[job.mode]++;setMatrix(prev=>({...prev,[key]:result}));setProgress({done:++done,total:jobs.size});}
 setStatus(controller.signal.aborted?"Calcul arrêté. Les trajets obtenus restent disponibles.":jobs.size===0?"Les trajets de ce week-end sont déjà calculés.":`Calcul terminé. ${failures.car+failures.train===0?"Tous les trajets sont disponibles.":`Restent à compléter : ${[failures.car?`${failures.car} aller-retour en voiture`:"",failures.train?`${failures.train} en train`:""].filter(Boolean).join(" et ")}.`}`);
 }finally{setBusy(false);abort.current=null;}}
 function setManualLeg(g:Group,direction:"out"|"back",value:string){if(!active)return;const key=tripKey(originFor(g,"train"),active.id,"train");setManual(prev=>{const t={...(prev[key]||matrix[key]||{})};delete t.error;if(value===""){delete t[direction];}else{const n=Number(value);if(!validMinutes(n))return prev;t[direction]={minutes:n,source:`Saisie manuelle, ${manualSource.trim()||"source non précisée"}`,retrievedAt:new Date().toISOString()};}return {...prev,[key]:t};});}
 // Browser agents use the same scenario state as the controls.
 useEffect(()=>{type MC={registerTool:(tool:{name:string;description:string;inputSchema:object;annotations:object;execute:(input:unknown)=>unknown},options:{signal:AbortSignal})=>void|Promise<void>};const context=(document as Document&{modelContext?:MC}).modelContext;if(!context)return;const lifecycle=new AbortController();void Promise.resolve(context.registerTool({name:"select_travel_scenario",description:"Sélectionner un scénario existant et afficher ses destinations et durées.",inputSchema:{type:"object",properties:{index:{type:"integer",minimum:0,maximum:combinations.length-1}},required:["index"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){const i=(input as {index?:unknown})?.index;if(typeof i!=="number"||!Number.isInteger(i)||i<0||i>=combinations.length)throw Error("Scénario inconnu");setScenarioIndex(i);setTab("scenarios");return {index:i,modes:combinations[i]};}},{signal:lifecycle.signal})).catch(()=>{});return ()=>lifecycle.abort();},[combinations]);
 const dayLabel=(d:string)=>new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",timeZone:"UTC"});
 const tripDates=`${new Date(`${outDate}T12:00:00Z`).toLocaleDateString("fr-FR",{day:"numeric",month:outDate.slice(5,7)===backDate.slice(5,7)?undefined:"long",timeZone:"UTC"})} au ${new Date(`${backDate}T12:00:00Z`).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"})}`;
 const weekends=[0,7].map(offset=>{const [fri,sun]=initialDates.map(d=>{const x=new Date(`${d}T12:00:00Z`);x.setUTCDate(x.getUTCDate()+offset);return x.toISOString().slice(0,10);});return {fri,sun,label:offset?"Le week-end suivant":"Ce week-end"};});
 function pickWeekend(fri:string,sun:string){setOutDate(fri);setBackDate(sun);setOutTime("14:00");setBackTime("16:00");resetForNewDates();}
 function startCalculation(){document.getElementById("resultats")?.scrollIntoView({behavior:"smooth",block:"start"});void calculate();}
 const hasResults=Object.keys(effective).length>0;
 const bestCost=best?costOf(best):null;
 // The longest single leg of the winner, for the one-sentence explanation.
 const worst=best?best.trips.map((t,i)=>({t,g:groups[i],m:Math.max(t.out??0,t.back??0)})).sort((a,b)=>b.m-a.m)[0]:null;
 const onSite=best?best.trips.map((t,i)=>({t,g:groups[i]})).filter(({t,g})=>originFor(g,t.mode)===best.id):[];
 const shownRows=showAllCities?rows:rows.slice(0,6);
 const calcStatus=<div className="calc"><div className="calc-line" role="status"><span>{status}</span>{busy&&<button type="button" onClick={()=>abort.current?.abort()} className="link">Arrêter</button>}</div><div className="progress-slot">{busy&&<Progress aria-label="Progression du calcul des trajets" value={progress.total?progress.done/progress.total*100:0} aria-valuetext={`${progress.done} sur ${progress.total} trajets calculés`}/>}</div></div>;
 return <div className="wrap">
  <a className="skip" href="#resultats">Aller aux résultats</a>
  <header className="mast">
   <a className="brand" href="./">On se retrouve</a>
   <div className="trip-meta"><span className="dates muted">Week-end du {tripDates}</span><a className="link-btn" href="#voyage">Modifier le voyage</a></div>
  </header>
  <main id="resultats">
   <section className="answer" aria-labelledby="answer-title">
    <div>
     {best?<h1 id="answer-title">Rendez-vous à <span>{nameOf(best.id)}.</span></h1>:<h1 id="answer-title">Où se retrouver ?</h1>}
     {best&&worst?<p className="lede">Personne ne voyage plus de <strong>{duration(best.max)}</strong> : c’est le trajet {worst.t.mode==="car"?"en voiture":"en train"} depuis {nameOf(originFor(worst.g,worst.t.mode))} ({worst.g.name}).{onSite.length>0&&<> Déjà sur place : {onSite.map(({g})=>g.name).join(", ")}.</>}</p>
      :<p className="lede">{hasResults?"Aucune ville n’a encore tous ses trajets. Complétez les trains manquants ou changez de scénario.":`Départs : ${groups.map(g=>nameOf(g.place)).join(", ")}. Lancez le calcul : la ville la plus juste pour tout le monde s’affichera ici.`}</p>}
     {best&&<ul className="facts">
      <li><b>{duration(best.max)}</b><span>trajet le plus long</span></li>
      <li><b>{duration(best.mean)}</b><span>moyenne par sens</span></li>
      {bestCost&&costLabel(bestCost)!=="—"&&<li><b>{costLabel(bestCost)}</b><span>aller-retour, {bestCost.people} voyageur{bestCost.people>1?"s":""}</span></li>}
     </ul>}
     <div className="answer-actions"><button type="button" className="btn" disabled={busy||!validDates||!destinations.length} onClick={startCalculation}>{busy?<LoaderCircle size={18} className="spin"/>:null}{busy?"Calcul en cours…":hasResults?"Recalculer":"Calculer les trajets"}</button>{calcStatus}</div>
     {carDown&&tab!=="train"&&<p className="alert" role="alert">Les calculs routiers (IGN et OSRM, son secours) ne répondent pas en ce moment. <button type="button" className="link" disabled={busy} onClick={()=>void calculate()}>Réessayer les trajets en voiture</button> ou <button type="button" className="link" onClick={()=>setTab("train")}>voir le classement en train</button>.</p>}
     {rail&&railProjected&&<p className="note"><strong>Projection :</strong> la SNCF publie ses horaires jusqu’au {frDate(rail.dates[rail.dates.length-1]??"")}. Au-delà, chaque trajet reprend les horaires du dernier jour complet publié tombant le même jour de la semaine ; vérifiez-les à l’ouverture des ventes.</p>}
     {(!rail||!railCovers)&&<p className="note">{rail?<>Horaires de train précalculés pour les vendredis, samedis et dimanches du {frDate(rail.dates[0]??"")} au {frDate(rail.dates[rail.dates.length-1]??"")}, puis projetés sur un an. Pour d’autres dates, <a href="#manual">complétez les durées de train</a>.</>:<>Horaires de train indisponibles. <a href="#manual">Complétez les durées de train</a> ; les temps routiers se calculent automatiquement.</>}</p>}
     <Tabs value={tab} onValueChange={setTab} className="scenario-tabs">
      <TabsList aria-label="Scénario de transport" className="segmented">
       <TabsTrigger value="car"><span>Voiture<span className="long"> si possible</span></span></TabsTrigger>
       <TabsTrigger value="train"><span>Train<span className="long"> si possible</span></span></TabsTrigger>
       <TabsTrigger value="fastest"><span><span className="long">Au plus rapide</span><span className="short">Rapide</span></span></TabsTrigger>
       <TabsTrigger value="scenarios"><span><span className="long">Tous les scénarios</span><span className="short">Scénarios</span></span></TabsTrigger>
      </TabsList>
      <TabsContent value="car"><p className="help">Les groupes « les deux » prennent la voiture ; les groupes en train le restent.</p></TabsContent>
      <TabsContent value="train"><p className="help">Les groupes « les deux » prennent le train.</p></TabsContent>
      <TabsContent value="fastest"><p className="help">Pour chaque ville, chaque groupe « les deux » prend le mode le plus court pour lui, aller et retour compris.</p></TabsContent>
      <TabsContent value="scenarios"><div className="scenario-select"><Select value={String(index)} onValueChange={v=>setScenarioIndex(Number(v))}><SelectTrigger aria-label="Choisir un scénario"><SelectValue/></SelectTrigger><SelectContent>{combinations.map((m,i)=><SelectItem key={i} value={String(i)}>{i+1}. {whoGoes(m)}</SelectItem>)}</SelectContent></Select></div></TabsContent>
     </Tabs>
    </div>
    <figure className="map-plate">
     <FranceMap groups={groups} destinations={destinations} selected={hasResults?active?.id:undefined} onSelect={setSelected} ranked={complete.map(r=>r.id)}/>
     <figcaption>Les traits relient les villes à vol d’oiseau, pas les voies ferrées.<span className="phone-only"> Touchez une ville dans le classement.</span></figcaption>
    </figure>
   </section>
   <div className="sec two">
    <section aria-labelledby="tickets-title">
     <div className="sec-head"><h2 id="tickets-title">{active&&best&&active.id!==best.id?`Les billets pour ${nameOf(active.id)}`:"Les billets de chacun"}</h2><span className="muted">{tab==="fastest"?"Au plus rapide":tab==="scenarios"?`Scénario ${index+1}`:tab==="car"?"Voiture si possible":"Train si possible"}</span></div>
     {!hasResults||!active?<p className="empty">Lancez le calcul : chaque groupe aura ici son billet, avec ses trains, ses horaires et son coût.</p>
      :active.trips.map((t,i)=><Ticket key={t.group} g={groups[i]} t={t} dest={active.id} kmRate={kmRate} outDay={dayLabel(outDate)} backDay={dayLabel(backDate)} open={openTickets.has(groups[i].id)!==(groups.length<=3||i===0)} onToggle={()=>setOpenTickets(s=>{const n=new Set(s);if(n.has(groups[i].id))n.delete(groups[i].id);else n.add(groups[i].id);return n;})}/>)}
    </section>
    <section aria-labelledby="rank-title">
     <div className="sec-head"><h2 id="rank-title">Le classement</h2></div>
     <p className="muted rank-help">Le trajet le plus long d’abord, puis la moyenne.</p>
     <ol className="rank">{shownRows.map((r,i)=>{const c=costOf(r);return <li key={r.id}><button type="button" onClick={()=>setSelected(r.id)} className={r.id===best?.id?"winner":undefined} aria-current={active?.id===r.id||undefined}><span className="pos">{r.complete?i+1:""}</span><span className="city">{nameOf(r.id)}</span><span className="max">{r.complete?duration(r.max):"À compléter"}</span><span className="sub">{r.complete?`moyenne ${duration(r.mean)}`:`${r.known} durées sur ${groups.length*2}`}{costLabel(c)!=="—"?`, ${costLabel(c,c.people)} par pers.`:""}</span></button></li>;})}</ol>
     {rows.length>6&&<p className="more"><button type="button" className="link" onClick={()=>setShowAllCities(v=>!v)}>{showAllCities?"Ne garder que les 6 premières":`Voir les ${rows.length-6} autres villes comparées`}</button></p>}
     <p className="muted small">{complete.length} villes sur {destinations.length} ont tous leurs trajets. Une durée manquante n’est jamais remplacée par zéro.</p>
    </section>
   </div>
   <section className="sec" id="voyage" aria-labelledby="voyage-title">
    <div className="sec-head"><h2 id="voyage-title">Votre voyage</h2><span className="muted">Vos groupes restent dans ce navigateur.</span></div>
    <div className="form-grid">{groups.map((g,i)=><fieldset className="pax" key={g.id} disabled={busy}>
     <legend><input className="pax-name" aria-label={`Nom du groupe ${i+1}`} value={g.name} maxLength={70} onChange={e=>updateGroup(g.id,{name:e.target.value})}/></legend>
     <label>Ville de départ<Select value={g.place} onValueChange={v=>{if(v!==g.custom?.id)updateGroup(g.id,{place:v,railPlace:undefined,custom:undefined});}}><SelectTrigger aria-label={`Ville de ${g.name}`}><SelectValue/></SelectTrigger><SelectContent>{g.custom&&<SelectItem value={g.custom.id}>{g.custom.name}</SelectItem>}{places.map(p=><SelectItem value={p.id} key={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></label>
     <CommuneSearch disabled={busy} onPick={p=>pickCommune(g,p)}/>
     <div className="field"><span className="field-label" id={`mode-${g.id}`}>Transport</span><div className="choice-group" role="radiogroup" aria-labelledby={`mode-${g.id}`}>{([["train","Train"],["car","Voiture"],["both","Les deux"]] as [Choice,string][]).map(([v,l])=><button type="button" key={v} role="radio" aria-checked={g.choice===v} className={g.choice===v?"on":undefined} onClick={()=>updateGroup(g.id,{choice:v})}>{l}</button>)}</div></div>
     <div className="field"><span className="field-label" id={`pax-${g.id}`}>Personnes</span><div className="counter" role="group" aria-labelledby={`pax-${g.id}`}><button type="button" aria-label={`Une personne de moins dans ${g.name}`} disabled={(g.people??1)<=1} onClick={()=>updateGroup(g.id,{people:Math.max(1,(g.people??1)-1)})}><Minus size={18}/></button><output aria-live="polite">{g.people??1}</output><button type="button" aria-label={`Une personne de plus dans ${g.name}`} disabled={(g.people??1)>=20} onClick={()=>updateGroup(g.id,{people:Math.min(20,(g.people??1)+1)})}><Plus size={18}/></button></div></div>
     <details className="more-options"><summary>Plus d’options</summary>
      <label>Gare de départ en train<Select value={g.railPlace||g.place} onValueChange={v=>updateGroup(g.id,{railPlace:v})}><SelectTrigger aria-label={`Départ ferroviaire de ${g.name}`}><SelectValue/></SelectTrigger><SelectContent>{places.map(p=><SelectItem value={p.id} key={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></label>
      <label>Trajet jusqu’à la gare, par sens (min)<input type="number" min="0" max="240" value={g.access} onChange={e=>updateGroup(g.id,{access:Math.max(0,Math.min(240,Number(e.target.value)||0))})}/></label>
      {groups.length>2&&<button type="button" className="link danger" onClick={()=>setGroups(gs=>gs.filter(x=>x.id!==g.id))}>Retirer {g.name}</button>}
     </details>
    </fieldset>)}</div>
    <div className="form-actions">{groups.length<10&&<button type="button" className="link-btn" disabled={busy} onClick={()=>setGroups(gs=>[...gs,{id:crypto.randomUUID(),name:`Groupe ${gs.length+1}`,place:"paris",choice:"both",note:"",access:0,people:1}])}><Plus size={16}/> Ajouter un groupe</button>}<button type="button" className="link-btn" onClick={share}><Share2 size={16}/> Envoyer à la famille</button></div>
    <fieldset className="when" disabled={busy}>
     <legend className="when-title">Quand ?</legend>
     <div className="weekends">{weekends.map(w=><button type="button" key={w.fri} aria-pressed={outDate===w.fri&&backDate===w.sun} onClick={()=>pickWeekend(w.fri,w.sun)}><b>{w.label}</b><span>{new Date(`${w.fri}T12:00:00Z`).toLocaleDateString("fr-FR",{day:"numeric",timeZone:"UTC"})}–{new Date(`${w.sun}T12:00:00Z`).toLocaleDateString("fr-FR",{day:"numeric",month:"long",timeZone:"UTC"})}</span></button>)}</div>
     <div className="pairs">
      <label>Départ à partir du<span className="pair"><input type="date" aria-label="Date de départ" value={outDate} onChange={e=>updateOutDate(e.target.value)}/><input type="time" aria-label="Heure de départ" value={outTime} onChange={e=>updateOutTime(e.target.value)}/></span></label>
      <label>Retour à partir du<span className="pair"><input type="date" aria-label="Date de retour" value={backDate} onChange={e=>updateBackDate(e.target.value)}/><input type="time" aria-label="Heure de retour" value={backTime} onChange={e=>updateBackTime(e.target.value)}/></span></label>
      <label>Voiture, coût au km (€)<input type="number" min="0" max="2" step="0.01" value={kmRate} onChange={e=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v>=0&&v<=2)setKmRate(v);}}/></label>
     </div>
     {!validDates&&<p className="error" role="alert">Choisissez un retour après le départ.</p>}
     <button type="button" className="btn" disabled={!validDates||!destinations.length} onClick={startCalculation}>{hasResults?"Recalculer":"Calculer les trajets"}</button>
    </fieldset>
   </section>
   <section className="sec extras" aria-label="Réglages avancés">
    {active&&<details id="manual" open={!railCovers}><summary>Compléter les trains pour {nameOf(active.id)}</summary><div className="extras-body">
     <p className="muted">Saisissez les durées vérifiées pour ce week-end, correspondances comprises, en minutes. Elles s’appliquent aux groupes ayant le même départ ferroviaire. Changer les dates efface ces saisies.</p>
     <label className="narrow">Source consultée<input value={manualSource} maxLength={120} onChange={e=>setManualSource(e.target.value)} placeholder="SNCF Connect, horaire consulté…"/></label>
     <div className="manual-grid">{groups.filter((g,i)=>g.choice!=="car"&&groups.findIndex(h=>originFor(h,"train")===originFor(g,"train"))===i).map(g=>{const key=tripKey(originFor(g,"train"),active.id,"train");const t=manual[key];return <div className="manual-row" key={g.id}><strong>{nameOf(originFor(g,"train"))} → {nameOf(active.id)}</strong><label>Aller (min)<input type="number" min="0" max="2880" step="1" value={t?.out?.minutes??""} placeholder="—" disabled={busy} onChange={e=>setManualLeg(g,"out",e.target.value)}/></label><label>Retour (min)<input type="number" min="0" max="2880" step="1" value={t?.back?.minutes??""} placeholder="—" disabled={busy} onChange={e=>setManualLeg(g,"back",e.target.value)}/></label></div>;})}</div>
    </div></details>}
    <details><summary>Les villes comparées ({destinations.length} sur {places.length})</summary><div className="extras-body">
     <p className="muted">La meilleure destination est cherchée parmi les villes cochées, pas parmi toutes les communes de France. Les villes cochées restent visibles quel que soit le filtre.</p>
     <label className="narrow">Filtrer les villes<input value={cityFilter} onChange={e=>setCityFilter(e.target.value)} placeholder="Nom de ville…"/></label>
     <div className="city-checks">{places.filter(p=>!cityFilter||normalize(p.name).includes(normalize(cityFilter))||destinations.includes(p.id)).map(p=><label key={p.id}><Checkbox checked={destinations.includes(p.id)} disabled={busy||(destinations.length===1&&destinations[0]===p.id)} onCheckedChange={checked=>setDestinations(prev=>checked?[...prev,p.id]:prev.filter(id=>id!==p.id))}/>{p.name}</label>)}</div>
    </div></details>
    <details><summary>Comparer les {combinations.length} scénarios</summary><div className="extras-body">
     <Table aria-label={`Comparaison des ${combinations.length} scénarios`}><TableHeader><TableRow><TableHead>Scénario</TableHead><TableHead>Meilleure ville</TableHead><TableHead>Maximum</TableHead><TableHead>Moyenne par sens</TableHead><TableHead/></TableRow></TableHeader>
      <TableBody>{comparison.map(c=><TableRow key={c.i}><TableCell>{c.i+1}. {whoGoes(c.m)}</TableCell><TableCell>{c.result?nameOf(c.result.id):"Données incomplètes"}</TableCell><TableCell>{duration(c.result?.max)}</TableCell><TableCell>{duration(c.result?.mean)}</TableCell><TableCell><button type="button" className="link" onClick={()=>{setTab("scenarios");setScenarioIndex(c.i);if(c.result)setSelected(c.result.id);}}>Afficher</button></TableCell></TableRow>)}</TableBody></Table>
    </div></details>
   </section>
   <footer className="notes" aria-labelledby="notes-title">
    <h2 id="notes-title">Conditions du calcul</h2>
    <p>On minimise la plus longue durée parmi tous les allers et retours, puis la moyenne, avec le même poids par groupe. Train : horaires SNCF théoriques{rail?` (données du ${frDate(rail.feedVersion)})`:""}, trajet le plus court parmi les départs des six heures suivant l’heure choisie, trois correspondances au plus, dix minutes minimum pour changer. Vérifiez avant de réserver.</p>
    <p>Prix SNCF plein tarif 2de classe, en fourchette, hors cartes et promotions. La SNCF ne publie plus les tarifs TER : tarif 2025 quand il est connu (Provence-Alpes-Côte d’Azur, Pays de la Loire), sinon estimation large d’après la distance, établie sur ces deux régions seulement. « ≈ » signale une estimation, « ≥ » un minimum. Voiture : kilomètres aller-retour × {kmRate.toLocaleString("fr-FR")} €, une voiture par groupe, péages et parking exclus.</p>
    <p>Temps de route : IGN, de centre-ville à centre-ville, hors trafic ; si l’IGN ne répond pas, OSRM sur les routes OpenStreetMap (© contributeurs OpenStreetMap), indiqué sur chaque trajet. Une durée manquante n’est jamais remplacée par zéro. Sources : <a href="https://www.data.gouv.fr/dataservices/api-geoplateforme-calcul-ditineraire" target="_blank" rel="noreferrer">IGN Géoplateforme</a>, <a href="https://project-osrm.org" target="_blank" rel="noreferrer">OSRM</a>, <a href="https://transport.data.gouv.fr/datasets/horaires-sncf" target="_blank" rel="noreferrer">horaires SNCF</a>, <a href="https://ressources.data.sncf.com/explore/dataset/tarifs-tgv-inoui-ouigo/" target="_blank" rel="noreferrer">tarifs SNCF</a>, <a href="https://geo.api.gouv.fr/decoupage-administratif/communes" target="_blank" rel="noreferrer">communes</a>, <a href="https://github.com/gregoiredavid/france-geojson" target="_blank" rel="noreferrer">contours France</a>.</p>
   </footer>
  </main>
 </div>;
}
function directions(origin:string,destination:string,mode:Mode){const p=new URLSearchParams({api:"1",origin:origin+", France",destination:destination+", France",travelmode:mode==="car"?"driving":"transit"});return `https://www.google.com/maps/dir/?${p}`;}
function displayRailTime(value?:string){if(!value)return "—";if(/^\d{4}-\d{2}-\d{2}T/.test(value))return value.slice(11);return /^\d{8}T\d{6}$/.test(value)?`${value.slice(6,8)}/${value.slice(4,6)} ${value.slice(9,11)}:${value.slice(11,13)}`:value;}
const BRANDS:Record<string,string>={"Train TER":"TER","INTERCITES":"Intercités","INTERCITES de nuit":"Intercités de nuit","TramTrain":"Tram-train"};
const eur=(n:number)=>n.toLocaleString("fr-FR",{maximumFractionDigits:2});
const euros=([min,max]:[number,number])=>min===max?`${eur(min)} €`:`${eur(min)}–${eur(max)} €`;
type RankedTrip={group:string;mode:Mode;trip?:Trip;out:number|null;back:number|null};
// One group's trip to the destination, laid out like a ticket: legs on the left, cost on the stub.
function Ticket({g,t,dest,kmRate,outDay,backDay,open,onToggle}:{g:Group;t:RankedTrip;dest:string;kmRate:number;outDay:string;backDay:string;open:boolean;onToggle:()=>void}){
 const origin=originFor(g,t.mode);const n=g.people??1;const here=origin===dest;
 const cost=tripCost([g],[t],kmRate);const label=costLabel(cost);
 const legs=[["Aller",outDay,t.trip?.out,t.out],["Retour",backDay,t.trip?.back,t.back]] as const;
 const direct=t.mode==="train"&&[t.trip?.out,t.trip?.back].every(l=>l?.transfers===0);
 const book=t.mode==="train"?{href:"https://www.sncf-connect.com/",text:"Voir sur SNCF Connect"}:{href:directions(nameOf(origin),nameOf(dest),"car"),text:"Voir l’itinéraire"};
 return <article className={`ticket${open||here||!t.trip?"":" compact"}`} aria-label={`${g.name}, depuis ${nameOf(origin)}`}>
  <div className="ticket-main">
   <div className="who"><h3>{g.name}</h3><span className="muted">{nameOf(origin)}, {n} voyageur{n>1?"s":""}{here?"":t.mode==="car"?", en voiture":", en train"}</span></div>
   {here?<p className="plain">Déjà sur place. Le trajet en ville n’est pas compté.</p>
    :!t.trip?<p className="plain muted">À calculer.</p>
    :open?legs.map(([kind,day,leg,total])=><div className="leg" key={kind}><div className="leg-kind">{kind}<span className="muted">{day}</span></div><div>{leg?<LegDetail leg={leg} mode={t.mode} total={total}/>:<p className="plain muted">{t.trip?.error??"Indisponible."}</p>}</div></div>)
    :<div className="legs-sum">{legs.map(([kind,,leg,total])=><span key={kind}>{kind} <b>{duration(total)}</b>{leg?.departure?` à ${displayRailTime(leg.departure)}`:""}</span>)}</div>}
   {!here&&t.trip&&<button type="button" className="link" aria-expanded={open} onClick={onToggle}>{open?"Masquer le détail":t.mode==="train"?"Voir les trains":"Voir le détail"}</button>}
   {t.mode==="train"&&g.access>0&&!here&&<p className="small muted">Durées comprenant {g.access} min pour rejoindre la gare, par sens.</p>}
  </div>
  <div className="ticket-stub"><div><div className="cost">{here?"0 €":label}</div><div className="per">{here?"pas de billet":n>1&&label!=="—"?`soit ${costLabel(cost,n)} par personne`:"aller-retour"}</div></div>{!here&&<a className="book" target="_blank" rel="noreferrer" href={book.href}>{book.text} <ExternalLink size={14} aria-hidden="true"/></a>}</div>
  {direct&&open&&<span className="stamp" aria-hidden="true">Direct</span>}
 </article>;}
function LegDetail({leg,mode,total}:{leg:Leg;mode:Mode;total:number|null}){
 const segs=leg.segments??[];const changes=leg.transfers??0;
 if(mode==="car")return <><div className="times">{duration(total)}<span className="dur">en voiture{leg.km!==undefined?`, ${leg.km.toLocaleString("fr-FR")} km`:""}</span></div><p className="source">{leg.source}</p></>;
 return <>
  {leg.departure?<div className="times">{displayRailTime(leg.departure)} → {displayRailTime(leg.arrival)}<span className="dur">{duration(leg.minutes)}, {changes===0?"direct":`${changes} correspondance${changes>1?"s":""}`}</span></div>:<div className="times">{duration(total)}</div>}
  {segs.map((s,k)=><div className="seg" key={k}><p className="stations">{segs.length>1?`${s.departure} `:""}{s.from} → {segs.length>1?`${s.arrival} `:""}{s.to}</p><p className="train"><b>{BRANDS[s.brand]??s.brand}{s.number?` ${s.number}`:""}</b>{s.fare&&<>, {s.fareSource?"≈ ":""}{euros(s.fare)} {s.fareSource?<em className="estimate">({s.fareSource==="ter2025"?"tarif TER 2025":"estimation TER"})</em>:"plein tarif"}</>}</p></div>)}
  {(leg.projected||!segs.length)&&<p className="source">{leg.source}</p>}
 </>;}
// Search any French commune (geo.api.gouv.fr, official, no key) to use as a departure outside the list.
function CommuneSearch({onPick,disabled}:{onPick:(p:Place)=>void;disabled?:boolean}){
 const [query,setQuery]=useState("");const [results,setResults]=useState<Place[]|null>(null);const [error,setError]=useState("");
 async function search(){const q=query.trim();if(q.length<2)return;setError("");try{const r=await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=nom,code,centre,departement&boost=population&limit=5`);if(!r.ok)throw new Error();const list=(await r.json()) as {nom:string;code:string;centre?:{coordinates:[number,number]};departement?:{code:string}}[];setResults(list.filter(c=>c.centre).map(c=>({id:`commune-${c.code}`,name:`${c.nom}${c.departement?` (${c.departement.code})`:""}`,lon:c.centre!.coordinates[0],lat:c.centre!.coordinates[1],stations:[]})));}catch{setResults(null);setError("Recherche indisponible.");}}
 return <div className="commune-search"><label>Autre commune<span className="commune-row"><input value={query} maxLength={60} placeholder="Ex. Sainte-Verge" onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void search();}}}/><button type="button" className="link" disabled={disabled||query.trim().length<2} onClick={()=>void search()}>Chercher</button></span></label>{error&&<p className="error">{error}</p>}{results&&(results.length?<ul className="commune-results">{results.map(p=><li key={p.id}><button type="button" className="link" onClick={()=>{onPick(p);setResults(null);setQuery("");}}>{p.name}</button></li>)}</ul>:<p className="muted">Aucune commune trouvée.</p>)}</div>;}
