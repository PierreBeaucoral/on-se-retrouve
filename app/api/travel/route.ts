import { NextResponse } from "next/server";
import { type Trip } from "@/lib/travel/model";
import { carLeg, railLeg, validateTravelRequest } from "@/lib/travel/providers";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON invalide." }, { status: 400 }); }
  const validation = validateTravelRequest(body);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
  const { origin, destination, mode, outbound, inbound } = validation.value;
  if (origin === destination) {
    const now = new Date().toISOString();
    const leg = { minutes: 0, source: "Même ville", retrievedAt: now };
    return NextResponse.json({ out: leg, back: { ...leg, retrievedAt: now } } satisfies Trip);
  }
  const result: Trip = {};
  const run = (when: string, reverse = false) => mode === "car"
    ? carLeg(reverse ? destination : origin, reverse ? origin : destination)
    : railLeg(reverse ? destination : origin, reverse ? origin : destination, when);
  const [out, back] = await Promise.allSettled([run(outbound), run(inbound, true)]);
  if (out.status === "fulfilled") result.out = out.value; else result.error = out.reason instanceof Error ? out.reason.message : "Aller indisponible.";
  if (back.status === "fulfilled") result.back = back.value; else result.error = result.error ? `${result.error} Retour : ${back.reason instanceof Error ? back.reason.message : "indisponible."}` : `Retour : ${back.reason instanceof Error ? back.reason.message : "indisponible."}`;
  return NextResponse.json(result);
}
