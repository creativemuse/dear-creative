import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { runScheduledIssueDraft } from "@/lib/adam/gemini-studio";
import {
  getOrCreateAdamSchedule,
  updateAdamSchedule,
} from "@/lib/adam/schedule";
import { requireStudioOrAdamAuth } from "@/lib/adam/studio-auth";

export async function GET(request: Request) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const schedule = await getOrCreateAdamSchedule(getDb());
  return NextResponse.json({ schedule });
}

type UpdateScheduleBody = {
  enabled?: boolean;
  cronExpression?: string;
  timezone?: string;
  instructions?: string | null;
};

export async function PUT(request: Request) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  let body: UpdateScheduleBody;
  try {
    body = (await request.json()) as UpdateScheduleBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const schedule = await updateAdamSchedule(getDb(), {
      enabled: body.enabled,
      cronExpression: body.cronExpression,
      timezone: body.timezone,
      instructions: body.instructions,
      actor: auth.actor,
    });
    return NextResponse.json({ schedule });
  } catch (error) {
    const errMsg =
      error instanceof Error ? error.message : "Failed to update schedule";
    return NextResponse.json({ error: errMsg }, { status: 400 });
  }
}

type TriggerScheduleBody = {
  force?: boolean;
};

export async function POST(request: Request) {
  const auth = await requireStudioOrAdamAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  let body: TriggerScheduleBody = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      body = JSON.parse(text) as TriggerScheduleBody;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await runScheduledIssueDraft(getDb(), {
      force: Boolean(body.force),
      actor: auth.actor,
    });

    if (result.draft) {
      revalidateTag("posts-recent", "max");
    }

    return NextResponse.json(result);
  } catch (error) {
    const errMsg =
      error instanceof Error
        ? error.message
        : "Scheduled issue draft run failed";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
