import { handle, json } from "@/server/api";
import { requireUser } from "@/server/auth";
import { globalSearch } from "@/server/services/search";

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return json(await globalSearch(user, q));
  });
}
