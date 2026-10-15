import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionUser } from "@/lib/db";
import Portal from "@/components/portal";
export const dynamic = "force-dynamic";
export default async function Page() {
  const cookieStore = await cookies();
  if (!(await sessionUser(cookieStore.get("ptat_session")?.value || "")))
    redirect("/login");
  return <Portal />;
}
