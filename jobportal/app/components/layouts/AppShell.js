"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Header from "@/app/components/layouts/Header";
import ClipLoader from "react-spinners/ClipLoader";

function isPublicPath(pathname) {
    if (!pathname) return false;

    const publicPaths = ["/login"];
    return publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default function AppShell({ children }) {
    const router = useRouter();
    const pathname = usePathname();

    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);

    const publicPage = isPublicPath(pathname);

    useEffect(() => {
        let ignore = false;

        async function checkSession() {
            if (publicPage) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);

                const res = await fetch("/api/auth/me", {
                    method: "GET",
                    cache: "no-store",
                });

                const json = await res.json().catch(() => null);

                if (ignore) return;

                if (!res.ok || !json?.ok || !json?.user) {
                    router.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
                    return;
                }

                setUser(json.user);
            } catch (error) {
                console.error("[AppShell] auth check error:", error);
                if (!ignore) {
                    router.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
                }
            } finally {
                if (!ignore) {
                    setLoading(false);
                }
            }
        }

        checkSession();

        return () => {
            ignore = true;
        };
    }, [pathname, publicPage, router]);

    if (publicPage) {
        return <>{children}</>;
    }

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50 px-2">
                <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white px-8 py-10 text-center shadow-sm">

                    <div className="text-xl font-bold text-red-700 mb-4">
                        Loading Data....
                    </div>

                    <ClipLoader size={35} color="#b91c1c" speedMultiplier={2} />

                </div>
            </div>

        );
    }

    if (!user) return null;

    return (
        <div className="min-h-screen ">
            <Header user={user} />
            <main>{children}</main>
        </div>
    );
}