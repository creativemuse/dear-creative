import { NextResponse } from "next/server";

export function paymentsDisabledResponse() {
  return NextResponse.json(
    {
      error: "Payments are disabled",
      code: "payments_disabled",
    },
    { status: 501 },
  );
}
