// RAPTOR (Delling, Pajor, Werneck 2012) earliest-arrival routing over one service day.
// Rounds bound the number of trips, so K = 3 rounds means at most 2 transfers.
// After the search, `tightenJourney` pushes each leg to the latest trip that keeps the
// same arrival, so reported durations do not include avoidable waiting at the origin.
import type { Trip } from "./gtfs.ts";

export type PatternTrip = { id: string; arr: number[]; dep: number[]; board: boolean[]; alight: boolean[] };
export type Pattern = { stops: number[]; trips: PatternTrip[] };
export type Footpath = { from: string; to: string; seconds: number };
export type Network = {
  stationIds: string[];
  stationIndex: Map<string, number>;
  patterns: Pattern[];
  patternsAtStation: { pattern: number; index: number }[][];
  footpaths: { to: number; seconds: number }[][];
};
export type Leg = { tripId: string; pattern: number; trip: number; boardIndex: number; alightIndex: number; from: string; to: string; dep: number; arr: number };
export type Journey = { departure: number; arrival: number; transfers: number; legs: Leg[] };
export type Options = { maxRounds?: number; minTransferSeconds?: number };

type Parent = { kind: "trip"; round: number; pattern: number; trip: number; boardIndex: number; alightIndex: number; boardStop: number } | { kind: "walk"; round: number; from: number };

export function buildNetwork(trips: Trip[], footpaths: Footpath[] = []): Network {
  const stationIndex = new Map<string, number>();
  const stationIds: string[] = [];
  const idx = (id: string) => { let i = stationIndex.get(id); if (i === undefined) { i = stationIds.length; stationIds.push(id); stationIndex.set(id, i); } return i; };
  const byKey = new Map<string, Pattern>();
  for (const trip of trips) {
    const stops = trip.stops.map((s) => idx(s.station));
    const key = stops.join(",");
    let pattern = byKey.get(key);
    if (!pattern) { pattern = { stops, trips: [] }; byKey.set(key, pattern); }
    pattern.trips.push({ id: trip.id, arr: trip.stops.map((s) => s.arr), dep: trip.stops.map((s) => s.dep), board: trip.stops.map((s) => s.board), alight: trip.stops.map((s) => s.alight) });
  }
  const patterns = [...byKey.values()];
  for (const p of patterns) p.trips.sort((a, b) => a.dep[0] - b.dep[0]);
  const patternsAtStation: Network["patternsAtStation"] = stationIds.map(() => []);
  patterns.forEach((p, pi) => p.stops.forEach((s, i) => patternsAtStation[s].push({ pattern: pi, index: i })));
  const paths: Network["footpaths"] = stationIds.map(() => []);
  for (const f of footpaths) {
    if (!stationIndex.has(f.from) || !stationIndex.has(f.to) || f.from === f.to) continue;
    paths[stationIndex.get(f.from)!].push({ to: stationIndex.get(f.to)!, seconds: f.seconds });
  }
  return { stationIds, stationIndex, patterns, patternsAtStation, footpaths: paths };
}

export type SearchResult = { network: Network; tau: Float64Array[]; parents: (Parent | null)[][]; best: Float64Array; minTransfer: number };

export function plan(network: Network, origins: string[], destinations: string[], departure: number, options: Options = {}): Journey | null {
  const result = search(network, origins, departure, options);
  return result ? journeyTo(result, destinations) : null;
}

// One search from an origin set serves every destination: labels are kept for all stations.
export function search(network: Network, origins: string[], departure: number, options: Options = {}): SearchResult | null {
  const maxRounds = options.maxRounds ?? 3;
  const minTransfer = options.minTransferSeconds ?? 600;
  const n = network.stationIds.length;
  const originIdx = origins.map((id) => network.stationIndex.get(id)).filter((i): i is number => i !== undefined);
  if (!originIdx.length) return null;

  const tau: Float64Array[] = [new Float64Array(n).fill(Infinity)];
  const parents: (Parent | null)[][] = [new Array<Parent | null>(n).fill(null)];
  const best = new Float64Array(n).fill(Infinity);
  let marked = new Set<number>();
  for (const o of originIdx) { tau[0][o] = departure; best[o] = departure; marked.add(o); }

  for (let k = 1; k <= maxRounds && marked.size; k++) {
    tau[k] = Float64Array.from(tau[k - 1]);
    parents[k] = parents[k - 1].slice();
    const change = k === 1 ? 0 : minTransfer;
    const queue = new Map<number, number>(); // pattern -> earliest marked index
    for (const s of marked) for (const { pattern, index } of network.patternsAtStation[s]) {
      const current = queue.get(pattern);
      if (current === undefined || index < current) queue.set(pattern, index);
    }
    const newlyMarked = new Set<number>();
    for (const [pi, start] of queue) {
      const p = network.patterns[pi];
      let trip = -1, boardIndex = -1;
      for (let i = start; i < p.stops.length; i++) {
        const stop = p.stops[i];
        if (trip >= 0) {
          const t = p.trips[trip];
          if (t.alight[i] && t.arr[i] < best[stop]) {
            tau[k][stop] = t.arr[i]; best[stop] = t.arr[i];
            parents[k][stop] = { kind: "trip", round: k, pattern: pi, trip, boardIndex, alightIndex: i, boardStop: p.stops[boardIndex] };
            newlyMarked.add(stop);
          }
        }
        const ready = tau[k - 1][stop] + change;
        if (Number.isFinite(ready)) {
          const limit = trip >= 0 ? trip : p.trips.length;
          for (let c = 0; c < limit; c++) {
            if (p.trips[c].board[i] && p.trips[c].dep[i] >= ready) { trip = c; boardIndex = i; break; }
          }
        }
      }
    }
    for (const s of [...newlyMarked]) for (const { to, seconds } of network.footpaths[s]) {
      const t = tau[k][s] + seconds;
      if (t < tau[k][to] && t < best[to]) { tau[k][to] = t; best[to] = t; parents[k][to] = { kind: "walk", round: k, from: s }; newlyMarked.add(to); }
    }
    marked = newlyMarked;
  }
  return { network, tau, parents, best, minTransfer };
}

export function journeyTo(result: SearchResult, destinations: string[]): Journey | null {
  const { network, tau, parents, best, minTransfer } = result;
  const destIdx = destinations.map((id) => network.stationIndex.get(id)).filter((i): i is number => i !== undefined);
  let target = -1, arrival = Infinity, round = -1;
  for (const d of destIdx) {
    if (best[d] >= arrival) continue;
    const k = tau.findIndex((row) => row[d] === best[d]);
    if (k > 0) { target = d; arrival = best[d]; round = k; }
  }
  if (target < 0) return null;
  const legs: Leg[] = [];
  let stop = target, k = round;
  while (k > 0) {
    const parent = parents[k][stop];
    if (!parent) { k--; continue; }
    if (parent.kind === "walk") { stop = parent.from; k = parent.round; continue; }
    const p = network.patterns[parent.pattern]; const t = p.trips[parent.trip];
    legs.unshift({ tripId: t.id, pattern: parent.pattern, trip: parent.trip, boardIndex: parent.boardIndex, alightIndex: parent.alightIndex, from: network.stationIds[parent.boardStop], to: network.stationIds[stop], dep: t.dep[parent.boardIndex], arr: t.arr[parent.alightIndex] });
    stop = parent.boardStop; k = parent.round - 1;
  }
  if (!legs.length) return null;
  const journey = { departure: legs[0].dep, arrival, transfers: legs.length - 1, legs };
  return tightenJourney(network, journey, minTransfer);
}

// Replace each leg by the latest trip on the same stop pattern that preserves the final arrival
// and the connections, walking backwards from the last leg.
export function tightenJourney(network: Network, journey: Journey, minTransfer: number): Journey {
  const legs = journey.legs.map((l) => ({ ...l }));
  let latestArrival = journey.arrival;
  for (let i = legs.length - 1; i >= 0; i--) {
    const leg = legs[i]; const p = network.patterns[leg.pattern];
    let chosen = leg.trip;
    for (let c = p.trips.length - 1; c > leg.trip; c--) {
      const t = p.trips[c];
      if (t.board[leg.boardIndex] && t.alight[leg.alightIndex] && t.arr[leg.alightIndex] <= latestArrival) { chosen = c; break; }
    }
    const t = p.trips[chosen];
    legs[i] = { ...leg, trip: chosen, tripId: t.id, dep: t.dep[leg.boardIndex], arr: t.arr[leg.alightIndex] };
    const walk = i > 0 ? walkSeconds(network, legs[i - 1].to, leg.from) : 0;
    latestArrival = legs[i].dep - minTransfer - walk;
  }
  return { departure: legs[0].dep, arrival: legs[legs.length - 1].arr, transfers: legs.length - 1, legs };
}

function walkSeconds(network: Network, from: string, to: string): number {
  if (from === to) return 0;
  const f = network.stationIndex.get(from); const t = network.stationIndex.get(to);
  if (f === undefined || t === undefined) return 0;
  return network.footpaths[f].find((x) => x.to === t)?.seconds ?? 0;
}
