"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

function normalizeRole(role) {
    const value = String(role || "").trim().toLowerCase();

    if (value === "client" || value === "clients") return "clients";
    if (value === "candidate" || value === "candidates") return "candidates";
    if (value === "staff" || value === "staffs") return "staff";

    return value;
}

function normalizePath(pathname) {
    const value = String(pathname || "/").trim();

    if (!value || value === "/") return "/";

    return value.replace(/\/+$/, "");
}

function isValidImage(image) {
    const value = String(image || "").trim();
    return value !== "" && value !== "null" && value !== "undefined";
}

function getMenuLinksByRole(role, userDocumentId) {
    const normalized = normalizeRole(role);

    if (normalized === "staff") {
        return [
            {
                label: "Dashboard",
                href: "/staff/",
                icon: "dashboard",
                exact: true,
            },
            {
                label: "Advance Search Candidates",
                href: "/search-candidates/",
                icon: "search",
            },
            {
                label: "Clients",
                href: "/staff/client/",
                icon: "clients",
            },
            {
                label: "Candidates",
                href: "/staff/candidates",
                icon: "candidates",
            },
            {
                label: "Agents",
                href: "/staff/agent",
                icon: "agents",
            },
            {
                label: "Jobs",
                href: "/jobs/job-list",
                icon: "jobs",
            },
            {
                label: "My Profile",
                href: "/staff/profile",
                icon: "profile",
            },
            {
                label: "File Manager",
                href: "/staff/file-manager",
                icon: "files",
            },
        ];
    }

    if (normalized === "clients") {
        return [
            {
                label: "Dashboard",
                href: "/client/",
                icon: "dashboard",
                exact: true,
            },
            {
                label: "Advance Search Candidates",
                href: "/search-candidates/",
                icon: "search",
            },
            {
                label: "Jobs",
                href: "/client/jobs/",
                icon: "jobs",
            },
            {
                label: "My Profile",
                href: "/client/profile/",
                icon: "profile",
            },
        ];
    }

    if (normalized === "candidates") {
        return [
            {
                label: "Dashboard",
                href: "/candidate",
                icon: "dashboard",
                exact: true,
            },
            {
                label: "My Jobs",
                href: `/candidate/${userDocumentId}/jobs`,
                icon: "jobs",
            },
            {
                label: "My Profile",
                href: `/candidate/${userDocumentId}/profile`,
                icon: "profile",
            },
        ];
    }

    return [
        {
            label: "Dashboard",
            href: "/",
            icon: "dashboard",
            exact: true,
        },
    ];
}

function isMenuItemActive(pathname, item) {
    const currentPath = normalizePath(pathname);
    const itemPath = normalizePath(item?.href);

    if (item?.exact) {
        return currentPath === itemPath;
    }

    return (
        currentPath === itemPath ||
        currentPath.startsWith(`${itemPath}/`)
    );
}

function getProfileImageUrl(image) {
    const img = String(image || "").trim();

    if (!img) return "";

    if (img.startsWith("http://") || img.startsWith("https://")) {
        return img;
    }

    const baseUrl = process.env.NEXT_PUBLIC_ADMIN_BASE_URL || "";
    return `${baseUrl}${img}`;
}

function passthroughImageLoader({ src }) {
    return src;
}

function ProfileAvatar({ src, alt, size, className }) {
    const [failed, setFailed] = useState(false);
    const fallbackText =
        String(alt || "User").charAt(0).toUpperCase() || "U";

    if (!src || failed) {
        return (
            <div
                className={`flex shrink-0 items-center justify-center rounded-full bg-red-100 font-bold text-red-700 ${className || ""}`}
                role="img"
                aria-label={`${alt || "User"} profile placeholder`}
            >
                {fallbackText}
            </div>
        );
    }

    return (
        <Image
            key={src}
            loader={passthroughImageLoader}
            unoptimized
            src={src}
            alt={alt || "User"}
            width={size}
            height={size}
            onError={() => setFailed(true)}
            className={className}
        />
    );
}

function MenuIcon({
    name,
    className = "h-4 w-4",
}) {
    const commonProps = {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.8,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        className,
        "aria-hidden": true,
    };

    if (name === "dashboard") {
        return (
            <svg {...commonProps}>
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
        );
    }

    if (name === "search") {
        return (
            <svg {...commonProps}>
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m15.5 15.5 5 5" />
                <path d="M8.2 10.5h4.6" />
                <path d="M10.5 8.2v4.6" />
            </svg>
        );
    }

    if (name === "clients") {
        return (
            <svg {...commonProps}>
                <path d="M4 21V7l8-4 8 4v14" />
                <path d="M8 9h1" />
                <path d="M15 9h1" />
                <path d="M8 13h1" />
                <path d="M15 13h1" />
                <path d="M9 21v-4h6v4" />
            </svg>
        );
    }

    if (name === "candidates") {
        return (
            <svg {...commonProps}>
                <circle cx="9" cy="8" r="3" />
                <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
                <circle cx="17" cy="9" r="2.5" />
                <path d="M15.5 14.5A4.5 4.5 0 0 1 21 19" />
            </svg>
        );
    }

    if (name === "agents") {
        return (
            <svg {...commonProps}>
                <circle cx="12" cy="7" r="3" />
                <path d="M5 21a7 7 0 0 1 14 0" />
                <path d="m9.5 14 2.5 3 2.5-3" />
                <path d="M12 17v4" />
            </svg>
        );
    }

    if (name === "jobs") {
        return (
            <svg {...commonProps}>
                <rect x="3" y="7" width="18" height="13" rx="2" />
                <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <path d="M3 12h18" />
                <path d="M10 12v2h4v-2" />
            </svg>
        );
    }

    if (name === "profile") {
        return (
            <svg {...commonProps}>
                <circle cx="12" cy="8" r="4" />
                <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
            </svg>
        );
    }

    if (name === "files") {
        return (
            <svg {...commonProps}>
                <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v8A3.5 3.5 0 0 1 17.5 20h-11A3.5 3.5 0 0 1 3 16.5z" />
                <path d="M3 9h18" />
            </svg>
        );
    }

    if (name === "logout") {
        return (
            <svg {...commonProps}>
                <path d="M10 17l5-5-5-5" />
                <path d="M15 12H3" />
                <path d="M14 3h4a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-4" />
            </svg>
        );
    }

    if (name === "menu") {
        return (
            <svg {...commonProps}>
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
            </svg>
        );
    }

    if (name === "close") {
        return (
            <svg {...commonProps}>
                <path d="m6 6 12 12" />
                <path d="M18 6 6 18" />
            </svg>
        );
    }

    return null;
}

function MenuLinks({
    menuLinks,
    pathname,
    onClick,
}) {
    return (
        <ul className="flex flex-col gap-1.5 text-sm font-semibold">
            {menuLinks.map((item) => {
                const active = isMenuItemActive(pathname, item);

                return (
                    <li key={item.href}>
                        <Link
                            href={item.href}
                            onClick={onClick}
                            aria-current={active ? "page" : undefined}
                            className={`flex items-center gap-3 rounded-xl px-3 py-3 transition-colors ${active
                                ? "bg-red-50 text-red-700 ring-1 ring-red-100"
                                : "text-gray-700 hover:bg-amber-50 hover:text-red-700"
                                }`}
                        >
                            <span
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active
                                    ? "bg-red-100 text-red-700"
                                    : "bg-gray-100 text-gray-600"
                                    }`}
                            >
                                <MenuIcon
                                    name={item.icon}
                                    className="h-5 w-5"
                                />
                            </span>

                            <span>{item.label}</span>
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
}

export default function Header({ user }) {
    const router = useRouter();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    const closeDrawer = () => setOpen(false);
    const openDrawer = () => setOpen(true);

    const role = normalizeRole(
        user?.role?.name ||
        user?.type
    );

    const userDocumentId = user?.documentId || "";

    const firstName =
        user?.name ||
        user?.fullName ||
        user?.username ||
        user?.email ||
        "User";

    const profileImage =
        isValidImage(user?.image)
            ? user.image
            : "";

    const profileImageUrl =
        getProfileImageUrl(profileImage);

    const hasProfileImage =
        isValidImage(profileImageUrl);

    const menuLinks = useMemo(
        () =>
            getMenuLinksByRole(
                role,
                userDocumentId
            ),
        [role, userDocumentId]
    );

    useEffect(() => {
        if (!open) return undefined;

        const onKey = (event) => {
            if (event.key === "Escape") {
                closeDrawer();
            }
        };

        window.addEventListener("keydown", onKey);

        return () => {
            window.removeEventListener(
                "keydown",
                onKey
            );
        };
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;

        const previousOverflow =
            document.body.style.overflow;

        document.body.style.overflow =
            "hidden";

        return () => {
            document.body.style.overflow =
                previousOverflow;
        };
    }, [open]);

    async function handleLogout(event) {
        event.preventDefault();

        try {
            await fetch("/api/auth/logout", {
                method: "POST",
            });
        } catch (error) {
            console.error(
                "[LOGOUT_ERROR]",
                error
            );
        } finally {
            closeDrawer();
            router.replace("/login");
            router.refresh();
        }
    }

    return (
        <header className="w-full overflow-x-hidden border-b border-gray-200 bg-white shadow-sm">
            <div className="mx-auto flex w-full max-w-full items-center gap-3 px-4 py-3">
                {/* Left: profile and welcome message */}
                <div className="flex min-w-0 shrink items-center gap-3">
                    <ProfileAvatar
                        src={
                            hasProfileImage
                                ? profileImageUrl
                                : ""
                        }
                        alt={firstName}
                        size={48}
                        className="h-12 w-12 rounded-full border-2 border-white bg-white object-cover text-sm shadow"
                    />

                    <div className="min-w-0 leading-tight">
                        <div className="text-sm text-gray-500">
                            Welcome,
                        </div>

                        <div className="max-w-36 truncate text-sm font-semibold text-red-700 sm:max-w-48 sm:text-base">
                            {firstName}
                        </div>
                    </div>
                </div>

                {/* Desktop navigation */}
                <nav
                    className="hidden min-w-0 flex-1 justify-center md:flex"
                    aria-label="Main navigation"
                >
                    <ul className="flex flex-wrap items-center justify-center gap-1 text-xs font-semibold lg:gap-1.5 lg:text-sm">
                        {menuLinks.map((item) => {
                            const active =
                                isMenuItemActive(
                                    pathname,
                                    item
                                );

                            return (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        title={item.label}
                                        aria-current={
                                            active
                                                ? "page"
                                                : undefined
                                        }
                                        className={`group inline-flex items-center gap-1.5 rounded-lg px-2 py-2 transition-colors lg:px-2.5 ${active
                                            ? "bg-red-50 text-red-700 ring-1 ring-red-100"
                                            : "text-gray-700 hover:bg-amber-50 hover:text-red-700"
                                            }`}
                                    >
                                        <MenuIcon
                                            name={item.icon}
                                            className="h-4 w-4 shrink-0"
                                        />

                                        <span className="whitespace-nowrap">
                                            {item.label}
                                        </span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                {/* Right controls */}
                <div className="ml-auto flex shrink-0 items-center gap-2">
                    <div className="hidden items-center justify-center lg:flex">
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 hover:text-red-800"
                        >
                            <MenuIcon
                                name="logout"
                                className="h-4 w-4"
                            />
                            Logout
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={openDrawer}
                        className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-gray-800 transition-colors hover:bg-amber-50 md:hidden"
                        aria-label="Open menu"
                        aria-expanded={open}
                        aria-controls="mobile-drawer"
                    >
                        <MenuIcon
                            name="menu"
                            className="h-6 w-6"
                        />

                        <span className="text-sm font-bold">
                            Menu
                        </span>
                    </button>
                </div>
            </div>

            {open && (
                <div
                    className="fixed inset-0 z-50 overflow-hidden"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Navigation menu"
                >
                    <button
                        type="button"
                        onClick={closeDrawer}
                        className="absolute inset-0 h-full w-full bg-black/50"
                        aria-label="Close menu overlay"
                    />

                    <div
                        id="mobile-drawer"
                        className="absolute right-0 top-0 h-full w-[85%] max-w-sm border-l-4 border-red-700 bg-white shadow-2xl"
                    >
                        <div className="flex items-center justify-between border-b px-4 py-4">
                            <div className="flex min-w-0 items-center gap-3">
                                <ProfileAvatar
                                    src={
                                        hasProfileImage
                                            ? profileImageUrl
                                            : ""
                                    }
                                    alt={firstName}
                                    size={44}
                                    className="h-11 w-11 rounded-full border-2 border-white bg-white object-cover text-sm shadow"
                                />

                                <div className="min-w-0 leading-tight">
                                    <div className="text-sm text-gray-500">
                                        Signed in as
                                    </div>

                                    <div className="truncate text-base font-bold text-red-700">
                                        {firstName}
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={closeDrawer}
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-700 transition-colors hover:bg-gray-100"
                                aria-label="Close menu"
                            >
                                <MenuIcon
                                    name="close"
                                    className="h-5 w-5"
                                />
                            </button>
                        </div>

                        <div className="h-[calc(100%-158px)] overflow-y-auto p-4 pb-6">
                            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                Menu
                            </div>

                            <MenuLinks
                                menuLinks={menuLinks}
                                pathname={pathname}
                                onClick={closeDrawer}
                            />
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 border-t bg-white p-4">
                            <button
                                type="button"
                                onClick={handleLogout}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                            >
                                <MenuIcon
                                    name="logout"
                                    className="h-5 w-5"
                                />
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
}
