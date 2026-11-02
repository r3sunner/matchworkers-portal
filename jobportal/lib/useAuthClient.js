"use client";

import { useEffect, useState } from "react";

export default function useAuthClient() {
    const [user, setUser] = useState(null);
    const [role, setRole] = useState(null);
    const [loadingAuth, setLoadingAuth] = useState(true);

    useEffect(() => {
        let mounted = true;

        async function fetchMe() {
            try {
                const res = await fetch("/api/auth/me", {
                    method: "GET",
                    credentials: "include",
                    cache: "no-store",
                });

                const data = await res.json().catch(() => null);

                console.log("[useAuth] /api/auth/me:", data.user.role);
                //console, log("[useAuth] /api/auth/me status:", data.user?.role);

                if (!mounted) return;

                if (res.ok && data?.ok) {
                    setUser(data.user || null);
                    setRole(data.user.role || null);
                } else {
                    setUser(null);
                    setRole(null);
                }
            } catch (error) {
                console.error("[useAuth] fetch error:", error);
                if (mounted) {
                    setUser(null);
                    setRole(null);
                }
            } finally {
                if (mounted) {
                    setLoadingAuth(false);
                }
            }
        }

        fetchMe();

        return () => {
            mounted = false;
        };
    }, []);

    return { user, role, loadingAuth };
}