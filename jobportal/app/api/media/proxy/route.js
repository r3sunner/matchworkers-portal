import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_ADMIN_ORIGIN = "https://admin.matchworkers.com";
const DEFAULT_S3_HOSTNAME =
    "amzn-s3-strapi-uploads.s3.eu-north-1.amazonaws.com";

function normalizeOrigin(value, fallback) {
    const raw = String(value || fallback || "").trim().replace(/\/+$/, "");

    if (!raw) return "";

    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function normalizeHostname(value, fallback = "") {
    const raw = String(value || fallback || "").trim();

    if (!raw) return "";

    try {
        const url = /^https?:\/\//i.test(raw)
            ? new URL(raw)
            : new URL(`https://${raw}`);

        return url.hostname.toLowerCase();
    } catch {
        return "";
    }
}

const ADMIN_ORIGIN = normalizeOrigin(
    process.env.ADMIN_BASE_URL ||
    process.env.NEXT_PUBLIC_ADMIN_BASE_URL,
    DEFAULT_ADMIN_ORIGIN
);

const S3_MEDIA_HOSTNAME = normalizeHostname(
    process.env.S3_MEDIA_HOSTNAME ||
    process.env.S3_IMAGE_HOSTNAME,
    DEFAULT_S3_HOSTNAME
);

const ALLOWED_HOSTS = new Set(
    [
        "admin.matchworkers.com",
        "www.admin.matchworkers.com",
        "admin.enginemover.com",
        "www.admin.enginemover.com",
        "127.0.0.1",
        "localhost",
        S3_MEDIA_HOSTNAME,
    ].filter(Boolean)
);

function normalizeFileUrl(inputUrl) {
    const raw = String(inputUrl || "").trim();

    if (!raw) return null;

    if (raw.startsWith("/uploads/")) {
        try {
            return new URL(raw, `${ADMIN_ORIGIN}/`);
        } catch {
            return null;
        }
    }

    try {
        const url = new URL(raw);
        const hostname = url.hostname.toLowerCase();
        const isLocalhost =
            hostname === "localhost" || hostname === "127.0.0.1";

        if (
            url.protocol !== "https:" &&
            !(isLocalhost && url.protocol === "http:")
        ) {
            return null;
        }

        if (!ALLOWED_HOSTS.has(hostname)) {
            return null;
        }

        if (url.username || url.password) {
            return null;
        }

        return url;
    } catch {
        return null;
    }
}

function copyHeader(targetHeaders, sourceHeaders, name) {
    const value = sourceHeaders.get(name);

    if (value) {
        targetHeaders.set(name, value);
    }
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const inputUrl = searchParams.get("url");
        const fileUrl = normalizeFileUrl(inputUrl);

        if (!fileUrl) {
            return NextResponse.json(
                {
                    error: "Blocked file url",
                    received: inputUrl || null,
                },
                { status: 403 }
            );
        }

        const requestHeaders = new Headers({
            Accept: "application/pdf,image/*,*/*",
        });

        const range = req.headers.get("range");

        if (range) {
            requestHeaders.set("Range", range);
        }

        const upstream = await fetch(fileUrl, {
            method: "GET",
            headers: requestHeaders,
            cache: "no-store",
            redirect: "follow",
        });

        if (!upstream.ok && upstream.status !== 206) {
            return NextResponse.json(
                {
                    error: "Failed to load file",
                    status: upstream.status,
                    fileUrl: fileUrl.toString(),
                },
                { status: upstream.status }
            );
        }

        const finalUpstreamUrl = new URL(upstream.url || fileUrl);
        const finalHostname = finalUpstreamUrl.hostname.toLowerCase();

        if (!ALLOWED_HOSTS.has(finalHostname)) {
            return NextResponse.json(
                { error: "Blocked redirected file url" },
                { status: 403 }
            );
        }

        const headers = new Headers();
        const isPdf = finalUpstreamUrl.pathname.toLowerCase().endsWith(".pdf");

        headers.set(
            "Content-Type",
            isPdf
                ? "application/pdf"
                : upstream.headers.get("content-type") ||
                "application/octet-stream"
        );
        headers.set("Content-Disposition", "inline");
        headers.set("Cache-Control", "private, no-store, max-age=0");
        headers.set("X-Content-Type-Options", "nosniff");

        copyHeader(headers, upstream.headers, "accept-ranges");
        copyHeader(headers, upstream.headers, "content-range");
        copyHeader(headers, upstream.headers, "content-length");
        copyHeader(headers, upstream.headers, "etag");
        copyHeader(headers, upstream.headers, "last-modified");

        // Stream the upstream file instead of buffering the complete PDF
        // in the Next.js server before sending the first byte.
        return new NextResponse(upstream.body, {
            status: upstream.status,
            headers,
        });
    } catch (error) {
        console.error("[MEDIA_PROXY_ERROR]", error);

        return NextResponse.json(
            {
                error: "Server error while loading media",
                details:
                    process.env.NODE_ENV === "development"
                        ? error?.message || String(error)
                        : undefined,
            },
            { status: 500 }
        );
    }
}
