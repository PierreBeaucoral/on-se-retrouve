export type Mode = "car" | "train";
export type Choice = Mode | "both";
import { places, type Place } from "./places.ts";
export { places, type Place };
export type Group = {id:string; name:string; place:string; railPlace?:string; choice:Choice; note:string; access:number};
export const initialGroups:Group[] = [
{id:"g1",name:"Groupe 1",place:"sainte-verge",railPlace:"thouars",choice:"both",note:"",access:0},
{id:"clermont",name:"Groupe 2",place:"clermont",choice:"both",note:"",access:0},
{id:"g3",name:"Groupe 3",place:"lyon",choice:"both",note:"",access:0},
{id:"g4",name:"Groupe 4",place:"mulhouse",choice:"train",note:"",access:0},
{id:"g5",name:"Groupe 5",place:"lyon",choice:"both",note:"",access:0},
{id:"g6",name:"Groupe 6",place:"paris",choice:"train",note:"",access:0},
];
export const defaultDestinations = ["bourges","nevers","dijon","tours","orleans","auxerre","macon","chalon","beaune","vichy","moulins","montlucon","poitiers","besancon","le-creusot","sens","lyon","clermont","paris","blois"];
export type Leg = {minutes:number; source:string; departure?:string; arrival?:string; transfers?:number; via?:string[]; retrievedAt:string};
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
export function duration(n:number|null|undefined){if(n==null||!Number.isFinite(n))return "—";const m=Math.round(n);return `${Math.floor(m/60)} h ${String(m%60).padStart(2,"0")}`;}
export function validMinutes(value:unknown):value is number {return typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=2880;}
