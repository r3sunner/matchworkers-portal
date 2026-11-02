"use client";

// app/restallcookies/page.js
import { useEffect, useRef, useState } from "react";
import { ClipLoader } from "react-spinners";

const LOGIN_URL = "/login/";

function goToLogin() {
    // Full document navigation avoids Next.js router cache.
    window.location.replace(LOGIN_URL);
}

async function clearClientBrowserData() {
    try {
        window.localStorage.clear();
    } catch (error) {
        console.warn("Could not clear localStorage:", error);
    }

    try {
        window.sessionStorage.clear();
    } catch (error) {
        console.warn("Could not clear sessionStorage:", error);
    }

    if ("caches" in window) {
        try {
            const cacheNames = await window.caches.keys();
            await Promise.all(
                cacheNames.map((cacheName) => window.caches.delete(cacheName))
            );
        } catch (error) {
            console.warn("Could not clear Cache Storage:", error);
        }
    }

    if ("serviceWorker" in navigator) {
        try {
            const registrations =
                await navigator.serviceWorker.getRegistrations();

            await Promise.all(
                registrations.map((registration) =>
                    registration.unregister()
                )
            );
        } catch (error) {
            console.warn("Could not unregister service workers:", error);
        }
    }
}

export default function ResetAllCookiesPage() {
    const startedRef = useRef(false);
    const [status, setStatus] = useState(
        "Removing old login cookies and cached data..."
    );

    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;

        // Guaranteed escape hatch. Even if cache deletion or fetch hangs,
        // the browser will still leave this page.
        const fallbackTimer = window.setTimeout(goToLogin, 5000);

        async function resetEverything() {
            try {
                const response = await fetch("/api/auth/reset-all", {
                    method: "POST",
                    credentials: "include",
                    cache: "no-store",
                    headers: {
                        "Content-Type": "application/json",
                    },
                });

                if (!response.ok) {
                    throw new Error("Reset API failed");
                }

                // Do not wait forever for optional browser cleanup.
                await Promise.race([
                    clearClientBrowserData(),
                    new Promise((resolve) =>
                        window.setTimeout(resolve, 1800)
                    ),
                ]);

                setStatus("Reset complete. Opening login page...");
                window.clearTimeout(fallbackTimer);
                goToLogin();
            } catch (error) {
                console.error("[RESET_ALL_COOKIES_ERROR]", error);

                // Redirect even if one cleanup operation fails.
                window.clearTimeout(fallbackTimer);
                goToLogin();
            }
        }

        resetEverything();

        return () => window.clearTimeout(fallbackTimer);
    }, []);

    return (
        <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-red-50 via-white to-red-100 px-4 py-10">
            <div className="w-full max-w-md overflow-hidden rounded-3xl border border-red-100 bg-white shadow-2xl">
                <div className="bg-gradient-to-r from-red-800 via-red-700 to-gray-950 px-6 py-5 text-white">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-100">
                        MatchWorkers
                    </p>
                    <h1 className="mt-2 text-2xl font-extrabold">
                        Reset Login Session
                    </h1>
                </div>

                <div className="flex items-center gap-4 p-7">
                    <ClipLoader size={34} color="#b91c1c" />
                    <div>
                        <p className="font-bold text-gray-900">Please wait</p>
                        <p className="mt-1 text-sm text-gray-600">{status}</p>
                    </div>
                </div>
            </div>
        </main>
    );
}
