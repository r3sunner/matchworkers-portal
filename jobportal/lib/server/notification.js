import qs from "qs";
import { Resend } from "resend";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

const LOG_PREFIX = "[CreateNotification]";

function logInfo(message, data = undefined) {
    if (data === undefined) {
        // console.log(`${LOG_PREFIX} ${message}`);
        return;
    }

    // console.log(`${LOG_PREFIX} ${message}`, data);
}

function logError(message, error = undefined) {
    if (error === undefined) {
        console.error(`${LOG_PREFIX} ${message}`);
        return;
    }

    console.error(`${LOG_PREFIX} ${message}`, error);
}

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
    return String(process.env.RESEND_FROM_EMAIL || "").trim();
}

function resendReplyTo() {
    return (process.env.RESEND_REPLY_TO || "").trim();
}

function text(value) {
    return String(value || "").trim();
}

function roleName(user) {
    const possibleRoles = [
        user?.type,
        user?.role?.type,
        user?.role?.name,
        user?.role?.code,
        user?.role?.attributes?.type,
        user?.role?.attributes?.name,
        user?.roleRaw?.type,
        user?.roleRaw?.name,
        user?.roleRaw?.code,
        user?.roleRaw?.attributes?.type,
        user?.roleRaw?.attributes?.name,
        typeof user?.role === "string" ? user.role : "",
        typeof user?.roleRaw === "string" ? user.roleRaw : "",
    ];

    return text(possibleRoles.find((item) => text(item)) || "").toLowerCase();
}

function isClientRole(role) {
    return ["client", "clients"].includes(text(role).toLowerCase());
}

function isAllowedNotificationRole(role) {
    return ["client", "clients", "staff", "staffs", "candidate", "candidates"].includes(
        text(role).toLowerCase()
    );
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

function safeUserDebug(user) {
    if (!user) return null;

    return {
        id: user?.id || null,
        documentId: user?.documentId || null,
        email: user?.email || null,
        role: roleName(user) || null,
        hasRoleObject: Boolean(user?.role && typeof user.role === "object"),
        hasRoleRawObject: Boolean(user?.roleRaw && typeof user.roleRaw === "object"),
        displayName: user?.fullName || user?.name || user?.companyName || null,
    };
}

function safeError(error) {
    return {
        name: error?.name || "Error",
        message: error?.message || String(error || "Unknown error"),
        stack: error?.stack || null,
    };
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
    const method = options.method || "GET";

    logInfo("Strapi request start", {
        method,
        path,
        hasBaseUrl: Boolean(base),
        hasToken: Boolean(token),
    });

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

    logInfo("Strapi request finish", {
        method,
        path,
        status: res.status,
        ok: res.ok,
        hasError: Boolean(json?.error),
    });

    if (!res.ok || json?.error) {
        logError("Strapi request failed", {
            method,
            path,
            status: res.status,
            response: json,
        });

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
    return [
        ...new Set(
            (items || [])
                .map((item) => text(item).toLowerCase())
                .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))
        ),
    ];
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

    logInfo("Loading email receivers from Strapi Email Setting");

    const json = await strapiFetch(`/email-setting?${query}`);
    const data = json?.data?.attributes || json?.data || {};
    const emails = collectEmailsFromValue(data?.SendEmailList || []);
    const receivers = uniqueEmails(emails);

    logInfo("Email receivers loaded", {
        totalRawEmailsFound: emails.length,
        totalValidUniqueReceivers: receivers.length,
        receivers,
    });

    return receivers;
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

    logInfo("Saving notification in Strapi", {
        title: payload.title,
        sendEmail: payload.sendEmail,
        openMessage: payload.openMessage,
        receiverCount: Array.isArray(receiverEmails) ? receiverEmails.length : 0,
        relationKeys: Object.keys(relation),
        user: safeUserDebug(user),
    });

    const result = await strapiFetch(`/client-notifications?status=published`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: payload }),
    });

    logInfo("Notification saved in Strapi", {
        notificationId: result?.data?.id || null,
        notificationDocumentId: result?.data?.documentId || null,
    });

    return result;
}

async function sendNotificationEmail({ title, details, receiverEmails, user }) {
    const apiKey = String(process.env.RESEND_API_KEY || "").trim();

    /* console.log("[CreateNotification] API key fingerprint", {
         length: apiKey.length,
         startsWithRe: apiKey.startsWith("re_"),
         last4: apiKey.slice(-4),
     });  */

    const from = resendFromEmail();
    const replyTo = resendReplyTo();
    const receivers = uniqueEmails(receiverEmails);

    logInfo("Resend email debug", {
        hasApiKey: Boolean(apiKey),
        from,
        hasReplyTo: Boolean(replyTo),
        replyTo: replyTo || null,
        receiverCount: receivers.length,
        receivers,
    });

    if (!apiKey) {
        return {
            sent: false,
            reason: "Missing RESEND_API_KEY env",
            receivers,
        };
    }

    if (!from) {
        return {
            sent: false,
            reason: "Missing RESEND_FROM_EMAIL env",
            receivers,
        };
    }

    if (!receivers.length) {
        return {
            sent: false,
            reason: "No receiver emails found in EmailSetting.SendEmailList",
            receivers: [],
        };
    }

    try {
        const resend = new Resend(apiKey);

        const detailsHtml = htmlEscape(details || "").replace(/\r\n|\r|\n/g, "<br />");
        const userRole = roleName(user) || "N/A";
        const userName = user?.fullName || user?.name || user?.companyName || "N/A";
        const userEmail = user?.email || "N/A";
        const websiteUrl = appUrl();

        const html = `
            <div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
                <div style="background:#b91c1c;padding:14px 20px">
                    <h2 style="margin:0;color:#fff;font-size:20px">${htmlEscape(title)}</h2>
                </div>

                <div style="padding:20px;color:#111827;font-size:14px;line-height:1.4">
                    <p style="margin:0 0 8px"><strong>User:</strong> ${htmlEscape(userName)}</p>
                    <p style="margin:0 0 8px"><strong>Email:</strong> ${htmlEscape(userEmail)}</p>
                    <p style="margin:0 0 8px"><strong>User Role:</strong> ${htmlEscape(userRole)}</p>
                    ${websiteUrl
                ? `<p style="margin:0 0 8px"><strong>Website:</strong> <a href="${htmlEscape(websiteUrl)}" style="color:#b91c1c">${htmlEscape(websiteUrl)}</a></p>`
                : ""
            }

                    <div style="padding-top:12px;margin-top:12px;border-top:1px solid #e5e7eb">
                        ${detailsHtml}
                    </div>
                </div>
            </div>
        `;

        const emailPayload = {
            from,
            to: receivers,
            subject: text(title) || "New Notification",
            html,
            ...(replyTo ? { replyTo } : {}),
        };

        /*  logInfo("Sending email with Resend", {
              from: emailPayload.from,
              to: emailPayload.to,
              subject: emailPayload.subject,
              hasReplyTo: Boolean(replyTo),
          });  */

        const result = await resend.emails.send(emailPayload);

        /*  logInfo("Resend send result", JSON.stringify(result, null, 2));  */

        if (result?.error) {
            return {
                sent: false,
                reason: result.error?.message || "Resend returned an error",
                receivers,
                result,
            };
        }

        return {
            sent: true,
            receivers,
            result,
        };
    } catch (error) {
        logError("Resend send failed", safeError(error));

        return {
            sent: false,
            reason: error?.message || "Resend send failed",
            receivers,
        };
    }
}

export async function CreateNotification({ title, details, email = false } = {}) {
    try {
        /*  logInfo("CreateNotification started", {
              receivedTitle: text(title),
              receivedEmailParameter: Boolean(email),
          });
     */
        const session = await getSession();
        const user = session?.user || null;
        const role = roleName(user);
        const clientRole = isClientRole(role);

        /*  logInfo("Session user resolved", {
              user: safeUserDebug(user),
              role,
              isAllowedRole: isAllowedNotificationRole(role),
              isClientRole: clientRole,
          });  */

        if (!user || !isAllowedNotificationRole(role)) {
            const skippedResult = {
                ok: true,
                skipped: true,
                reason: "Logged-in user is not client, staff, or candidate",
                role,
            };

            //  logInfo("CreateNotification skipped", skippedResult);
            return skippedResult;
        }

        if (!text(user?.documentId)) {
            const skippedResult = {
                ok: true,
                skipped: true,
                reason: "Logged-in user documentId missing",
                role,
            };

            //  logInfo("CreateNotification skipped", skippedResult);
            return skippedResult;
        }

        let finalTitle = text(title);
        const finalDetails = text(details);

        if (clientRole && !finalTitle.toLowerCase().startsWith("client update:")) {
            finalTitle = `Client Update: ${finalTitle}`;
        }

        // Important rule:
        // If role is client/clients, email must be sent even if parameter email=false.
        const shouldSendEmail = clientRole || Boolean(email);

        /*  logInfo("Email decision", {
              role,
              isClientRole: clientRole,
              receivedEmailParameter: Boolean(email),
              finalShouldSendEmail: shouldSendEmail,
              finalTitle,
          });  */

        const receiverEmails = shouldSendEmail ? await getNotificationEmailReceivers() : [];

        const notification = await saveNotification({
            title: finalTitle,
            details: finalDetails,
            email: shouldSendEmail,
            receiverEmails,
            user,
        });

        const emailResult = shouldSendEmail
            ? await sendNotificationEmail({
                title: finalTitle,
                details: finalDetails,
                receiverEmails,
                user,
            })
            : {
                sent: false,
                reason: "email parameter is false and role is not client/clients",
                receivers: [],
            };

        const result = {
            ok: true,
            skipped: false,
            role,
            userDocumentId: user.documentId,
            notification: notification?.data || notification,
            email: emailResult,
        };

        logInfo("CreateNotification finished", {
            ok: result.ok,
            skipped: result.skipped,
            role: result.role,
            userDocumentId: result.userDocumentId,
            emailSent: emailResult?.sent,
            emailReason: emailResult?.reason || null,
            emailReceiverCount: Array.isArray(emailResult?.receivers) ? emailResult.receivers.length : 0,
        });

        return result;
    } catch (error) {
        logError("CreateNotification error", safeError(error));

        return {
            ok: false,
            skipped: false,
            error: error?.message || "CreateNotification failed",
        };
    }
}
