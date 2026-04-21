import { NextResponse } from "next/server";
import { z } from "zod";
import Razorpay from "razorpay";

export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    amount: z.number().int().min(100), // paise
    currency: z.string().min(1).default("INR"),
    receipt: z.string().min(1).max(80),
  })
  .strict();

function getRazorpay() {
  const key_id = process.env.RAZORPAY_KEY_ID?.trim();
  const key_secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!key_id || !key_secret) {
    throw new Error("Missing Razorpay env. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }
  return new Razorpay({ key_id, key_secret });
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const razorpay = getRazorpay();
    const { amount, currency, receipt } = parsed.data;

    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt,
    });

    return NextResponse.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (e: any) {
    const status = typeof e?.statusCode === "number" ? e.statusCode : null;
    const msg = typeof e?.error?.description === "string" ? e.error.description : e?.message;
    if (status === 401) return NextResponse.json({ error: "Razorpay auth failed" }, { status: 401 });
    console.error("[razorpay/create-order]", e);
    return NextResponse.json({ error: "Failed to create order", ...(msg ? { details: String(msg) } : {}) }, { status: 500 });
  }
}

