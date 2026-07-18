import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ADMIN_API_BASE_URL = process.env.ADMIN_API_BASE_URL!;
const PM_SERVICE_KEY = process.env.PM_SERVICE_KEY!;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse(null, { status: 401 });
  }

  // RLS (attachments_select) gates this: no row back means no access.
  const { data: attachment } = await supabase
    .from("attachments")
    .select("id, file_name, mime_type")
    .eq("id", id)
    .maybeSingle();
  if (!attachment) {
    return new NextResponse(null, { status: 404 });
  }

  const adminRes = await fetch(`${ADMIN_API_BASE_URL}/api/pm/attachments/${id}`, {
    headers: { "X-Pm-Key": PM_SERVICE_KEY },
  });
  if (!adminRes.ok || !adminRes.body) {
    return new NextResponse(null, { status: adminRes.status || 502 });
  }

  // RFC 6266: provide both ASCII fallback and UTF-8 extended parameter for filename
  const asciiFallback = attachment.file_name
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/"/g, "'");
  const encodedFilename = encodeURIComponent(attachment.file_name);

  return new NextResponse(adminRes.body, {
    status: 200,
    headers: {
      "Content-Type": attachment.mime_type ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`,
    },
  });
}
