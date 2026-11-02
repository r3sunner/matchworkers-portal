"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [rememberMe, setRememberMe] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const nextUrl = searchParams.get("next") || "";

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");

        if (!identifier.trim() || !password.trim()) {
            setError("Please enter email/username and password.");
            return;
        }

        try {
            setLoading(true);

            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    identifier: identifier.trim(),
                    password,
                    rememberMe,
                }),
            });

            const data = await res.json();

            if (!res.ok || !data?.ok) {
                setError(data?.error || "Login failed.");
                return;
            }

            const redirectTo = nextUrl || data?.redirectTo || "/";
            router.replace(redirectTo);
            router.refresh();
        } catch (err) {
            console.error("[LOGIN_FORM_ERROR]", err);
            setError("Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            ) : null}

            <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Email / Username
                </label>
                <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Enter email or username"
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-800 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
            </div>

            <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Password
                </label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-800 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
            </div>

            <div className="flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                    Remember me
                </label>
            </div>

            <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
                {loading ? "Signing in..." : "Login"}
            </button>
        </form>
    );
}