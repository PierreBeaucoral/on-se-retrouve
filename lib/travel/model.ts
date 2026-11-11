export type Mode = "car" | "train";
export type Choice = Mode | "both";
import { places, type Place } from "./places.ts";
export { places, type Place };
// people: travellers (1 when absent). custom: a town outside the list, found by search (its id equals place).
export type Group = {id:string; name:string; place:string; railPlace?:string; choice:Choice; note:string; access:number; people?:number; custom?:Place};

// Towns added by search live in this registry for the session; groups carry them so they survive reloads and share links.
const extraPlaces = new Map<string, Place>();
export const placeOf = (id:string):Place|undefined => places.find(p=>p.id===id) ?? extraPlaces.get(id);
export function registerPlace(p:Place){ if(!places.some(x=>x.id===p.id)) extraPlaces.set(p.id,p); }
// Searched towns: id "commune-<INSEE code>", inside metropolitan France, and always paired with a listed rail departure.
export function validCustom(g:Group):boolean {
 const c=g.custom;
 return !!c&&c.id===g.place&&/^commune-\d[\dAB]\d{3}$/.test(c.id)&&typeof c.name==="string"&&c.name.length>0&&c.name.length<=80&&c.lon>=-5.5&&c.lon<=10&&c.lat>=41&&c.lat<=51.5&&!!g.railPlace&&places.some(p=>p.id===g.railPlace);
}
// Nearest listed city among candidates (great-circle distance), used as the rail departure of a searched town.
export function nearestPlace(lon:number, lat:number, candidates:Place[]):Place|undefined {
 const r=Math.PI/180;const d=(p:Place)=>{const a=Math.sin((p.lat-lat)*r/2)**2+Math.cos(lat*r)*Math.cos(p.lat*r)*Math.sin((p.lon-lon)*r/2)**2;return a;};
 return candidates.reduce<Place|undefined>((best,p)=>!best||d(p)<d(best)?p:best,undefined);
}
// Neutral placeholders: real groups live only in the visitor's browser (localStorage) or in a share link.
export const initialGroups:Group[] = [
{id:"g1",name:"Groupe 1",place:"paris",choice:"both",note:"",access:0,people:1},
{id:"g2",name:"Groupe 2",place:"lyon",choice:"both",note:"",access:0,people:1},
{id:"g3",name:"Groupe 3",place:"bordeaux",choice:"train",note:"",access:0,people:1},
];
export const defaultDestinations = ["bourges","nevers","dijon","tours","orleans","auxerre","macon","chalon","beaune","vichy","moulins","montlucon","poitiers","besancon","le-creusot","sens","lyon","clermont","paris","blois"];
// One train of a rail journey; fare = SNCF full-price range (2nd class, Tarif Normal) when published.
export type Segment = {from:string; to:string; departure:string; arrival:string; brand:string; number:string; fare?:[number,number]};
export type Leg = {minutes:number; source:string; departure?:string; arrival?:string; transfers?:number; via?:string[]; segments?:Segment[]; projected?:boolean; km?:number; retrievedAt:string};
export type Trip = {out?:Leg; back?:Leg; error?:string};
export type Matrix = Record<string,Trip>;
export const tripKey=(origin:string,dest:string,mode:Mode)=>`${origin}|${dest}|${mode}`;
export const originFor=(g:Group,m:Mode)=>m==="train"?(g.railPlace||g.place):g.place;
export function scenarios(groups:Group[]):Mode[][] {
 return groups.reduce<Mode[][]>((rows,g)=>rows.flatMap(row=>(g.choice==="both"?["car","train"]:[g.choice]).map(m=>[...row,m as Mode])),[[]]);
}
export function rank(groups:Group[], destinations:string[], modes:Mode[],matrix:Matrix) {
 return destinations.map(id=>{
 const trips=groups.map((g,i)=>{const m=modes[i];const t=matrix[tripKey(originFor(g,m),id,m)];const extra=m==="train"?g.access:0;return {group:g.id,mode:m,trip:t,out:t?.out&&validMinutes(t.out.minutes)? t.out.minutes+extra:null,back:t?.back&&validMinutes(t.back.minutes)?t.back.minutes+extra:null};});
 const complete=trips.every(t=>t.out!==null&&t.back!==null);
 const durations=trips.flatMap(t=>[t.out,t.back]).filter((x):x is number=>x!==null);
 return {id,trips,complete,max:complete?Math.max(...durations):null,mean:complete?durations.reduce((a,b)=>a+b,0)/durations.length:null,known:durations.length};
 }).sort((a,b)=>Number(b.complete)-Number(a.complete)||(a.max??Infinity)-(b.max??Infinity)||(a.mean??Infinity)-(b.mean??Infinity)||a.id.localeCompare(b.id));
}
// Default car cost per kilometre, close to the French volunteer mileage scale used by associations.
export const DEFAULT_KM_RATE = 0.35;
export type Cost = {min:number; max:number; complete:boolean; people:number};
// Round-trip travel cost of a set of groups. Car: one vehicle per group, distance × rate (tolls and parking
// excluded). Train: every traveller pays each train's published full-price range. A leg without a distance
// or a published fare (TER, manual entry) leaves the estimate incomplete: min/max then cover the known part.
export function tripCost(groups:Group[], trips:{mode:Mode; trip?:Trip}[], rate:number):Cost {
 let min=0,max=0,complete=true,people=0;
 groups.forEach((g,i)=>{const {mode,trip}=trips[i];const n=g.people??1;people+=n;
  for(const leg of [trip?.out,trip?.back]){
   if(mode==="car"){if(leg?.km===undefined){complete=false;continue;}min+=leg.km*rate;max+=leg.km*rate;continue;}
   if(!leg?.segments){complete=false;continue;}
   for(const s of leg.segments){if(!s.fare){complete=false;continue;}min+=s.fare[0]*n;max+=s.fare[1]*n;}
  }});
 return {min,max,complete,people};
}
export function costLabel(c:Cost, divisor=1):string {
 const lo=Math.round(c.min/divisor),hi=Math.round(c.max/divisor);
 if(!c.complete)return lo>0?`≥ ${lo} €`:"—";
 return lo===hi?`${lo} €`:`${lo}–${hi} €`;
}
export function duration(n:number|null|undefined){if(n==null||!Number.isFinite(n))return "—";const m=Math.round(n);return `${Math.floor(m/60)} h ${String(m%60).padStart(2,"0")}`;}
export function validMinutes(value:unknown):value is number {return typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=2880;}
