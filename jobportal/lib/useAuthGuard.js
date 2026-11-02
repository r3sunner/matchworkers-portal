"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function useAuthGuard(allowedRoles = []) {
    const router = useRouter();
    const pathname = usePathname();

    const [authLoading, setAuthLoading] = useState(true);
    const [authChecked, setAuthChecked] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);

    const rolesKey = Array.isArray(allowedRoles)
        ? allowedRoles.map((r) => String(r).toLowerCase()).sort().join("|")
        : "";

    useEffect(() => {
        let ignore = false;

        async function checkAuth() {
            try {
                setAuthLoading(true);

                const res = await fetch("/api/auth/me", {
                    method: "GET",
                    cache: "no-store",
                });

                const json = await res.json().catch(() => null);

                if (ignore) return;

                const user = json?.user || null;
                const role = String(json?.user.type || "").toLowerCase();
                const normalizedAllowedRoles = rolesKey ? rolesKey.split("|") : [];
                const nextUrl = pathname || "/";

                //  console.log("[useAuthGuard] /api/auth/me response:", json);
                //  console.log("[useAuthGuard] role:", role);
                //  console.log("[useAuthGuard] allowedRoles:", normalizedAllowedRoles);

                if (!res.ok || !json?.ok || !user) {
                    router.replace(`/login?next=${encodeURIComponent(nextUrl)}`);
                    return;
                }

                if (normalizedAllowedRoles.length > 0 && !normalizedAllowedRoles.includes(role)) {
                    if (role === "staff") {
                        router.replace("/staff");
                    } else if (role === "clients") {
                        router.replace("/client");
                    } else if (role === "candidates") {
                        router.replace("/candidate");
                    } else {
                        router.replace("/login");
                    }
                    return;
                }

                setCurrentUser(user);
                setAuthChecked(true);
            } catch (error) {
                console.error("[useAuthGuard] error:", error);
                if (!ignore) {
                    router.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
                }
            } finally {
                if (!ignore) {
                    setAuthLoading(false);
                }
            }
        }

        checkAuth();

        return () => {
            ignore = true;
        };
    }, [router, pathname, rolesKey]);

    return {
        authLoading,
        authChecked,
        currentUser,
    };
}