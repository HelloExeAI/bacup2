"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

type Props = {
  amountPaise: number;
  receipt: string;
  label?: string;
};

function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Razorpay) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-razorpay-checkout]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpayCheckout = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay"));
    document.body.appendChild(script);
  });
}

export function RazorpayCheckoutButton({ amountPaise, receipt, label = "Pay" }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

  const onClick = async () => {
    setErr(null);
    setSuccess(null);
    if (!keyId) {
      setErr("Missing NEXT_PUBLIC_RAZORPAY_KEY_ID.");
      return;
    }
    if (!Number.isFinite(amountPaise) || amountPaise < 100) {
      setErr("Amount must be at least 100 paise.");
      return;
    }

    setBusy(true);
    try {
      await loadRazorpayScript();

      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "Failed to create order");

      const options: any = {
        key: keyId,
        order_id: String(j.order_id),
        amount: Number(j.amount),
        currency: String(j.currency),
        name: "The Bacup",
        handler: async (response: any) => {
          try {
            const vr = await fetch("/api/verify-payment", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const vj = await vr.json().catch(() => null);
            if (!vr.ok) throw new Error(typeof vj?.error === "string" ? vj.error : "Verification failed");
            setSuccess(`Payment verified: ${response.razorpay_payment_id}`);
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Verification failed");
          }
        },
        modal: {
          ondismiss: () => setErr("Payment cancelled."),
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (resp: any) => {
        const msg = resp?.error?.description || resp?.error?.reason || "Payment failed";
        setErr(String(msg));
      });
      rzp.open();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button type="button" onClick={() => void onClick()} disabled={busy}>
        {busy ? "Opening…" : label}
      </Button>
      {err ? <div className="text-xs text-red-600 dark:text-red-400">{err}</div> : null}
      {success ? <div className="text-xs text-emerald-700 dark:text-emerald-300">{success}</div> : null}
    </div>
  );
}

