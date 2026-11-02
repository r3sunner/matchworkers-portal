


import qs from "qs";
import { NextResponse } from "next/server";
import { JWT_COOKIE_NAME, USER_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

function normalizeRole(rawRole) {
    const role = String(

        rawRole?.name)
        .trim()
        .toLowerCase();

    if (role === "client") return "clients";
    if (role === "candidate") return "candidates";
    if (role === "staffs") return "staff";

    return role;
}


// helper function
async function findUserProfileByEmail(strapiUrl, apiToken, userEmail) {

    console.log("[LOGIN] Finding user profile for email:", strapiUrl, userEmail);
    const collections = [
        { type: "staff", endpoint: "staffs" },
        { type: "client", endpoint: "clients" },
        { type: "candidate", endpoint: "candidates" },
    ];

    for (const collection of collections) {

        // Dynamic populate based on type
        let extraPopulate = {};

        if (collection.type === "staff") {
            extraPopulate.image = true;
        }

        if (collection.type === "client") {
            extraPopulate.logo = true;
        }

        if (collection.type === "candidate") {
            extraPopulate.profileImage = true;
        }

        const query = qs.stringify(
            {
                filters: {
                    users_permissions_user: {
                        email: {
                            $eq: userEmail,
                        },
                    },


                },
                populate: {
                    users_permissions_user: {
                        populate: {
                            role: true,
                        },
                    },
                    ...extraPopulate,
                },
            },
            { encodeValuesOnly: true }
        );

        const meRes = await fetch(`${strapiUrl}/${collection.endpoint}?${query}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${apiToken}`,
                "Content-Type": "application/json",
            },
            cache: "no-store",
        });

        const meData = await meRes.json().catch(() => null);

        console.log(`[LOGIN] ${collection.endpoint} response:`, meData);

        if (!meRes.ok) {
            continue;
        }

        const foundUser = meData?.data?.[0];
        if (foundUser) {
            return {
                ok: true,
                userType: collection.type,
                profile: foundUser,
            };
        }
    }

    return {
        ok: false,
        error: "User Not Found in any of the supported profiles (Staff, Client, or Candidate)",
    };
}



export async function POST(req) {
    try {
        const body = await req.json();
        const { identifier, password, rememberMe } = body || {};

        if (!identifier || !password) {
            return NextResponse.json(
                { ok: false, error: "Email/Username and password are required." },
                { status: 400 }
            );
        }

        const strapiUrl = process.env.STRAPI_BASE_URL.replace(/\/$/, "");;

        // 1) LOGIN
        const loginRes = await fetch(`${strapiUrl}/auth/local`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                identifier,
                password,
            }),
            cache: "no-store",
        });

        const loginData = await loginRes.json().catch(() => null);

        console.log("[LOGIN] auth/local response:", loginData);

        if (!loginRes.ok || !loginData?.jwt || !loginData?.user) {
            return NextResponse.json(
                {
                    ok: false,
                    error:
                        loginData?.error?.message ||
                        loginData?.message ||
                        "Invalid login credentials.",
                    details: loginData || null,
                },
                { status: loginRes.status || 401 }
            );
        }

        const jwt = loginData.jwt;

        const apiToken = process.env.STRAPI_TOKEN;


        const result = await findUserProfileByEmail(strapiUrl, apiToken, loginData.user.email);


        console.log("[LOGIN] final matched profile:", result);
        if (!result.ok) {
            return NextResponse.json(
                {
                    ok: false,
                    error: result.error || "Login succeeded but failed to load user profile.",
                },
                { status: 404 }
            );
        }

        const fullProfile = result.profile;
        const profileType = result.profile.users_permissions_user.role.name;

        // role
        const role =
            result.profile.users_permissions_user.role ||
            null;

        console.log("[LOGIN] profileType:", profileType);
        console.log("[LOGIN] fullProfile:", fullProfile);
        console.log("[LOGIN] role:", role);


        const safeUser = {
            id: fullProfile.id ?? null,
            name: fullProfile.fullName || fullProfile.companyName || "",
            image: result.profile.image?.url || result.profile.profileImage?.url || result.profile.logo?.url || "",
            documentId: fullProfile?.documentId ?? null,
            type: role.name ?? profileType,
            username: fullProfile.users_permissions_user?.username || "",
            email: fullProfile.users_permissions_user?.email || "",
            role,
            roleRaw: role || null,
        };

        console.log("[LOGIN] safeUser:", safeUser);

        const response = NextResponse.json({
            ok: true,
            user: safeUser,
            redirectTo:
                profileType === "staff"
                    ? "/staff/"
                    : profileType === "clients"
                        ? "/client/"
                        : profileType === "candidates"
                            ? "/candidate/"
                            : "/",
        });

        const maxAge = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24;

        response.cookies.set(JWT_COOKIE_NAME, jwt, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge,
        });

        response.cookies.set(USER_COOKIE_NAME, JSON.stringify(safeUser), {
            httpOnly: false,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge,
        });

        return response;
    } catch (error) {
        console.error("[LOGIN_ROUTE_ERROR]", error);
        return NextResponse.json(
            { ok: false, error: "Server error during login." },
            { status: 500 }
        );
    }
}