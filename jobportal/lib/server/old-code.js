import qs from "qs";
import { Resend } from "resend";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

function strapiBase() {
    return (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/$/, "");
}

function strapiToken() {
    return process.env.STRAPI_TOKEN || "";
}

function appUrl() {
    return (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
}

function resendFromEmail() {
    return process.env.RESEND_FROM_EMAIL || "";
}

function resendReplyTo() {
    return process.env.RESEND_REPLY_TO || "";
}

function text(value) {
    return String(value || "").trim();
}

function roleName(user) {
    return text(
        user?.type ||
        user?.role?.name ||
        user?.roleRaw?.name ||
        user?.role ||
        ""
    ).toLowerCase();
}

function isAllowedNotificationRole(role) {
    return ["client", "clients", "staff", "staffs", "candidate", "candidates"].includes(role);
}

function relationPayloadByRole(user) {
    const role = roleName(user);
    const documentId = text(user?.documentId);

    if (!documentId) return {};

    if (role === "client" || role === "clients") {
        return { client: { connect: [documentId] } };
    }

    if (role === "staff" || role === "staffs") {
        return { staff: { connect: [documentId] } };
    }

    if (role === "candidate" || role === "candidates") {
        return { candidate: { connect: [documentId] } };
    }

    return {};
}

function htmlEscape(value) {
    return text(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function readJsonSafe(res) {
    const raw = await res.text();

    try {
        return raw ? JSON.parse(raw) : null;
    } catch {
        return { raw };
    }
}

async function strapiFetch(path, options = {}) {
    const base = strapiBase();
    const token = strapiToken();

    if (!base) throw new Error("Missing NEXT_PUBLIC_API_BASE_URL env");
    if (!token) throw new Error("Missing STRAPI_TOKEN env");

    const res = await fetch(`${base}${path}`, {
        cache: "no-store",
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(options.headers || {}),
        },
    });

    const json = await readJsonSafe(res);

    if (!res.ok || json?.error) {
        throw new Error(json?.error?.message || json?.error || "Strapi request failed");
    }

    return json;
}

function collectEmailsFromValue(value, list = []) {
    if (!value) return list;

    if (typeof value === "string") {
        const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
        list.push(...matches);
        return list;
    }

    if (Array.isArray(value)) {
        value.forEach((item) => collectEmailsFromValue(item, list));
        return list;
    }

    if (typeof value === "object") {
        Object.values(value).forEach((item) => collectEmailsFromValue(item, list));
    }

    return list;
}

function uniqueEmails(items) {
    return [...new Set((items || [])
        .map((item) => text(item).toLowerCase())
        .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))
    )];
}

export async function getNotificationEmailReceivers() {
    const query = qs.stringify(
        {
            populate: {
                SendEmailList: true,
            },
        },
        { encodeValuesOnly: true }
    );

    const json = await strapiFetch(`/email-setting?${query}`);
    const data = json?.data?.attributes || json?.data || {};
    const emails = collectEmailsFromValue(data?.SendEmailList || []);

    return uniqueEmails(emails);
}

async function saveNotification({ title, details, email, receiverEmails, user }) {
    const shouldSendEmail = Boolean(email);
    const relation = relationPayloadByRole(user);

    const payload = {
        title: text(title),
        details: text(details),
        sendEmail: shouldSendEmail,
        openMessage: shouldSendEmail,
        openHistory: shouldSendEmail
            ? JSON.stringify(
                {
                    receivers: receiverEmails || [],
                    total: Array.isArray(receiverEmails) ? receiverEmails.length : 0,
                    createdAt: new Date().toISOString(),
                },
                null,
                2
            )
            : "",
        ...relation,
    };

    return await strapiFetch(`/client-notifications?status=published`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: payload }),
    });
}



async function sendNotificationEmail({ title, details, receiverEmails, user }) {




    const apiKey = process.env.RESEND_API_KEY || "";
    const from = resendFromEmail();

    if (!apiKey) throw new Error("Missing RESEND_API_KEY env");
    if (!from) throw new Error("Missing RESEND_FROM_EMAIL env");

    const receivers = uniqueEmails(receiverEmails);

    if (!receivers.length) {
        return {
            sent: false,
            reason: "No receiver emails found in EmailSetting.SendEmailList",
            receivers: [],
        };
    }


    const resend = new Resend(apiKey);

    const detailsHtml = htmlEscape(details || "").replace(/\r\n|\r|\n/g, "<br />");
    const html = `
        <div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
    
    <div style="background:#b91c1c;padding:14px 20px">
        <h2 style="margin:0;color:#fff;font-size:20px">${htmlEscape(title)}</h2>
    </div>

    <div style="padding:20px;color:#111827;font-size:14px;line-height:1.2">

        <p style="margin:0 0 8px"><strong>User:</strong> ${htmlEscape(user.fullName || user.name || user.companyName || "N/A")}</p>
        <p style="margin:0 0 8px"><strong>Email:</strong> ${htmlEscape(user.email || "N/A")}</p>
        <p style="margin:0 0 8px"><strong>User Role:</strong> ${htmlEscape(user.name || "N/A")}</p>
        
        <div style="padding-top:12px;border-top:1px solid #e5e7eb">
    ${detailsHtml}
</div>

   

    </div>

</div>
`;

    const result = await resend.emails.send({
        from,
        to: receivers,
        subject: text(title) || "New Notification",
        html,
        ...(resendReplyTo() ? { replyTo: resendReplyTo() } : {}),
    });

    return {
        sent: true,
        receivers,
        result,
    };
}

export async function CreateNotification({ title, details, email = false } = {}) {
    try {
        const session = await getSession();
        const user = session?.user || null;
        const role = roleName(user);

        if (!user || !isAllowedNotificationRole(role)) {
            return {
                ok: true,
                skipped: true,
                reason: "Logged-in user is not client, staff, or candidate",
            };
        }

        if (!text(user?.documentId)) {
            return {
                ok: true,
                skipped: true,
                reason: "Logged-in user documentId missing",
            };
        }

        console.log(role);

        if (role === "client" || role === "clients") {
            email = true; // Force email for clients
            title = "Client Update:" + title;
        }



        const shouldSendEmail = Boolean(email);
        const receiverEmails = shouldSendEmail ? await getNotificationEmailReceivers() : [];

        const notification = await saveNotification({
            title,
            details,
            email: shouldSendEmail,
            receiverEmails,
            user,
        });

        console.log(user);



        const emailResult = shouldSendEmail
            ? await sendNotificationEmail({ title, details, receiverEmails, user })
            : {
                sent: false,
                reason: "email parameter is false",
                receivers: [],
            };

        return {
            ok: true,
            skipped: false,
            role,
            userDocumentId: user.documentId,
            notification: notification?.data || notification,
            email: emailResult,
        };
    } catch (error) {
        console.error("CreateNotification error:", error);
        return {
            ok: false,
            skipped: false,
            error: error?.message || "CreateNotification failed",
        };
    }
}
