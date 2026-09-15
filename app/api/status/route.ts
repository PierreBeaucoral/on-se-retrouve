import { NextResponse } from "next/server";

export async function GET() {
  let configured = typeof process !== "undefined" && Boolean(process.env.SNCF_API_KEY);
  if (!configured) {
    try {
      const workerModule = await import("cloudflare:workers");
      configured = Boolean((workerModule as { env?: { SNCF_API_KEY?: string } }).env?.SNCF_API_KEY);
    } catch { /* Node/test runtime has no Cloudflare binding. */ }
  }
  return NextResponse.json({ railConfigured: configured });
}
