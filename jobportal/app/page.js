// D:\Atlantic Projects\macthworkers\nextjs\job-portal\app\page.js

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function normalizeRole(role) {
  const value = String(role || "").toLowerCase().trim();

  if (value === "staff") return "staff";
  if (value === "client" || value === "clients") return "client";
  if (value === "candidate" || value === "candidates") return "candidate";

  return "";
}

export default async function HomePage() {
  const cookieStore = await cookies();

  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  let user = null;

  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL;

    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/auth/me`, {
      method: "GET",
      headers: {
        Cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      redirect("/login");
    }

    const data = await res.json();

    if (!data?.ok || !data?.user) {
      redirect("/login");
    }

    user = data.user;
  } catch (error) {
    redirect("/login");
  }

  const role =
    normalizeRole(user?.role?.name) ||
    normalizeRole(user?.roleRaw?.name);


  if (role === "staff") {
    redirect("/staff");
  }

  if (role === "client") {
    redirect(`/client/${user?.documentId}`);
  }

  if (role === "candidate") {
    redirect(`/candidate/${user?.documentId}/dashboard`);
  }

  redirect("/login");
}