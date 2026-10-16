import { paymentsDisabledResponse } from "@/lib/payments/disabled-response";
import { isPaymentsEnabled } from "@/lib/payments/feature-flag";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  if (!isPaymentsEnabled()) {
    return paymentsDisabledResponse();
  }

  const { slug } = await context.params;
  return Response.json(
    {
      error: "CRTVAI checkout is not available yet",
      code: "crtvai_checkout_deferred",
      slug,
    },
    { status: 501 },
  );
}
