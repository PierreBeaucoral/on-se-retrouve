// Computes one round trip (outbound + return) for a group, entirely in the browser.
import { carLeg } from "./car-client.ts";
import { railLeg } from "./rail-client.ts";
import type { Mode, Trip } from "./model.ts";

export type TravelJob = { origin: string; destination: string; mode: Mode };

export async function computeTrip(job: TravelJob, outbound: string, inbound: string, signal?: AbortSignal): Promise<Trip> {
  const { origin, destination, mode } = job;
  if (origin === destination) {
    const leg = { minutes: 0, source: "Même ville · trajet local non inclus", retrievedAt: new Date().toISOString() };
    return { out: leg, back: leg };
  }
  const run = (when: string, reverse: boolean) => mode === "car"
    ? carLeg(reverse ? destination : origin, reverse ? origin : destination, signal)
    : railLeg(reverse ? destination : origin, reverse ? origin : destination, when);
  const [out, back] = await Promise.allSettled([run(outbound, false), run(inbound, true)]);
  const result: Trip = {};
  const message = (r: PromiseRejectedResult, fallback: string) => (r.reason instanceof Error ? r.reason.message : fallback);
  if (out.status === "fulfilled") result.out = out.value; else result.error = `Aller : ${message(out, "indisponible.")}`;
  if (back.status === "fulfilled") result.back = back.value; else result.error = `${result.error ? `${result.error} ` : ""}Retour : ${message(back, "indisponible.")}`;
  return result;
}
