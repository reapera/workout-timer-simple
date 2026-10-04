import { feedToken, lockSecret, safeEqual } from "@/lib/auth";
import { NotionConfigError } from "@/lib/notion";
import { buildCalendar } from "@/lib/training/calendar";
import { loadProgramme, TrainingSetupError } from "@/lib/training/notion";
import { localDate } from "@/lib/training/schedule";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

const plain = (message: string, status: number) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/** The plan as an iCalendar feed. Public to whoever has the link — the token is the key. */
export async function GET(request: Request, { params }: Context) {
  const { token } = await params;
  if (!safeEqual(token.replace(/\.ics$/, ""), await feedToken(lockSecret()))) return plain("Not found", 404);

  try {
    const programme = await loadProgramme();
    const ics = buildCalendar(programme, { appUrl: new URL(request.url).origin, today: localDate() });
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="dumbbell-plan.ics"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof TrainingSetupError) return plain("No training plan has been set up yet.", 404);
    if (error instanceof NotionConfigError) return plain("Notion isn't connected.", 503);
    return plain("Couldn't read the plan from Notion. Your calendar will try again later.", 502);
  }
}
