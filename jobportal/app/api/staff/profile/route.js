import { NextResponse } from "next/server";
import qs from "qs";
import { requireAuth } from "@/lib/requireAuth";
import { buildSafeUserFromStaff, setUserSession } from "@/lib/auth";
import { connectReactDebugChannel } from "next/dist/server/dev/debug-channel";
import { CreateNotification } from "@/lib/server/notification";

export const runtime = "nodejs";

const STRAPI_API_BASE =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.STRAPI_BASE_URL ||
    "";

const STRAPI_TOKEN =
    process.env.STRAPI_TOKEN ||
    process.env.API_TOKEN ||
    "";

function getStrapiOrigin() {
    return STRAPI_API_BASE.replace(/\/api\/?$/, "");
}

function absMediaUrl(url) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    return `${getStrapiOrigin()}${url}`;
}

function getJsonHeaders() {
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${STRAPI_TOKEN}`,
    };
}

function getAuthHeaders() {
    return {
        Authorization: `Bearer ${STRAPI_TOKEN}`,
    };
}

function staffAttrs(item) {
    return item?.attributes || item || {};
}

function normalizeProfileResponse(staff) {
    const a = staffAttrs(staff);
    const relUser =
        a?.users_permissions_user?.data?.attributes ||
        a?.users_permissions_user ||
        {};

    const media =
        a?.profileImage?.data?.attributes ||
        a?.profileImage ||
        null;

    return {
        id: staff?.id ?? a?.id ?? null,
        documentId: staff?.documentId || a?.documentId || null,
        fullName: a?.fullName || "",
        mobile: a?.mobile || "",
        designation: a?.designation || "",
        email: relUser?.email || a?.email || "",
        username: relUser?.username || a?.username || "",
        profileImageUrl: (staff.image?.url || ""),
    };
}

async function fetchStaffBySessionUser(sessionUser) {
    const documentId = sessionUser?.documentId || null;
    const email = sessionUser?.email || null;


    console.log("[fetchStaffBySessionUser] sessionUser:", documentId, email, sessionUser);

    let query = "";

    if (documentId) {
        query = qs.stringify({
            filters: {
                documentId: {
                    $eq: documentId,
                },
            },
            populate: {
                image: true,
                users_permissions_user: {
                    populate: {
                        role: true,
                    },
                },
            },
            pagination: {
                page: 1,
                pageSize: 1,
            },
        });
    } else if (email) {
        query = qs.stringify({
            filters: {
                users_permissions_user: {
                    email: {
                        $eq: email,
                    },
                },
            },
            populate: {
                image: true,
                users_permissions_user: {
                    populate: {
                        role: true,
                    },
                },
            },
            pagination: {
                page: 1,
                pageSize: 1,
            },
        });
    } else {
        throw new Error("Session user is missing documentId/email.");
    }

    console.log("[fetchStaffBySessionUser] Constructed query:", query);

    const res = await fetch(`${STRAPI_API_BASE}staffs?${query}`, {
        method: "GET",
        headers: getAuthHeaders(),
        cache: "no-store",
    });



    const json = await res.json().catch(() => null);
    console.log("[fetchStaffBySessionUser] Strapi response status:", json);




    if (!res.ok) {
        throw new Error(json?.error?.message || "Failed to fetch staff profile.");
    }

    const data = json?.data || [];

    return json?.data?.[0] || null;
}

async function uploadMedia(file) {
    const fd = new FormData();

    fd.append("files", file);           // Always use 'files' key



    const res = await fetch(`${STRAPI_API_BASE}upload`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: fd,
    });


    const json = await res.json().catch(() => null);



    if (!res.ok || !Array.isArray(json) || !json[0]?.id) {
        throw new Error("Failed to upload profile image.");
    }

    console.log("[uploadMedia] Upload response:", json);

    return json[0];
}

async function updateStrapiUser(userId, payload) {
    const data = {};

    console.log("[updateStrapiUser] Payload for user update:", userId, payload);

    if (payload.username) data.username = payload.username;
    if (payload.email) data.email = payload.email;
    if (payload.password) data.password = payload.password;

    if (!Object.keys(data).length || !userId) return null;

    console.log(`${STRAPI_API_BASE}users/${userId}`);

    const res = await fetch(`${STRAPI_API_BASE}users/${userId}`, {
        method: "PUT",
        headers: getJsonHeaders(),
        body: JSON.stringify(data),
    });

    const json = await res.json().catch(() => null);

    console.log("[updateStrapiUser] Update response:", res, json);

    if (!res.ok) {
        throw new Error(json?.error?.message || "Failed to update login user.");
    }

    return json;
}

export async function GET() {
    try {
        const auth = await requireAuth();


        if (!auth.ok) return auth.response;

        const staff = await fetchStaffBySessionUser(auth.session.user);

        console.log("[STAFF_PROFILE_GET] fetched staff:", staff);

        if (!staff) {
            return NextResponse.json(
                { ok: false, error: "Staff profile not found." },
                { status: 404 }
            );
        }

        return NextResponse.json({
            ok: true,
            profile: normalizeProfileResponse(staff),
        });
    } catch (error) {
        console.error("[STAFF_PROFILE_GET_ERROR]", error);
        return NextResponse.json(
            { ok: false, error: error?.message || "Failed to load staff profile." },
            { status: 500 }
        );
    }
}

export async function PUT(req) {
    try {
        const auth = await requireAuth();
        if (!auth.ok) return auth.response;

        const currentStaff = await fetchStaffBySessionUser(auth.session.user);

        if (!currentStaff) {
            return NextResponse.json(
                { ok: false, error: "Staff profile not found." },
                { status: 404 }
            );
        }

        const currentAttrs = staffAttrs(currentStaff);
        const currentUser =
            currentAttrs?.users_permissions_user?.data ||
            currentAttrs?.users_permissions_user ||
            {};

        console.log("[STAFF_PROFILE_PUT] Current staff:", currentAttrs, currentStaff);

        const formData = await req.formData();

        const rawData = formData.get("data");
        const imageFile = formData.get("files.profileImage");

        console.log("[STAFF_PROFILE_PUT] Received form data:", {
            rawData,
            hasImageFile: imageFile instanceof File,
            imageFileName: imageFile instanceof File ? imageFile.name : null,
        });

        const data = rawData ? JSON.parse(rawData) : {};

        console.log("[STAFF_PROFILE_PUT] Parsed data:", data);

        let uploadedImageId = null;

        if (imageFile && typeof imageFile === "object" && imageFile.size > 0) {
            console.log("[STAFF_PROFILE_PUT] Uploading new profile image...");
            const uploaded = await uploadMedia(imageFile);
            uploadedImageId = uploaded.id;
        }

        const payload = {
            fullName: String(data?.fullName || "").trim(),
            mobile: String(data?.mobile || "").trim(),
            designation: String(data?.designation || "").trim(),
        };


        if (uploadedImageId) {
            payload.image = uploadedImageId;
        }

        if (data?.removeProfileImage === true && !uploadedImageId) {
            payload.image = null;
        }

        const staffDocumentId =
            currentStaff?.documentId || currentAttrs?.documentId;


        console.log("[STAFF_PROFILE_PUT] Final payload for staff update:", payload);


        const updateRes = await fetch(
            `${STRAPI_API_BASE}staffs/${staffDocumentId}?status=published`,
            {
                method: "PUT",
                headers: getJsonHeaders(),
                body: JSON.stringify({ data: payload }),
            }
        );

        const updateJson = await updateRes.json().catch(() => null);


        if (!updateRes.ok) {
            throw new Error(updateJson?.error?.message || "Failed to update staff profile.");
        }

        await updateStrapiUser(currentUser?.id, {
            username: String(data?.username || "").trim(),
            email: String(data?.email || "").trim(),
            password: String(data?.password || "").trim(),
        });

        const freshStaff = await fetchStaffBySessionUser({
            ...auth.session.user,
            email: String(data?.email || auth.session.user?.email || "").trim(),
            documentId: staffDocumentId,
        });



        await CreateNotification({
            title: "updated Staff profile",
            details: "Staff profile is updated.",
            email: false,
        });

        // const safeUser = buildSafeUserFromStaff(freshStaff);
        //await setUserSession(safeUser);

        return NextResponse.json({
            ok: true,
            profile: normalizeProfileResponse(freshStaff),
            user: freshStaff,
            role: "staff",
            message: "Profile updated successfully.",
        });
    } catch (error) {
        console.error("[STAFF_PROFILE_PUT_ERROR]", error);
        return NextResponse.json(
            { ok: false, error: error?.message || "Failed to update staff profile." },
            { status: 500 }
        );
    }
}