export const runtime = "nodejs";

import { CreateNotification } from "@/lib/server/notification";
import { getSession } from "@/lib/auth";
import qs from "qs";

function joinUrl(base, path) {
    const b = String(base || "").replace(/\/+$/, "");
    const p = String(path || "").replace(/^\/+/, "");
    return `${b}/${p}`;
}

async function readBodySafe(res) {
    const text = await res.text();
    try {
        return text ? JSON.parse(text) : {};
    } catch {
        return { raw: text };
    }
}

async function readReqJsonSafe(req) {
    const text = await req.text();
    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return { __raw: text };
    }
}

function normalizeString(v) {
    return String(v || "").trim();
}

function normalizeDateOrNull(v) {
    const s = normalizeString(v);
    return s || null;
}

function toNumberOrNull(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeDetails(details) {
    return Array.isArray(details) ? details : [];
}

function getDocId(row) {
    return row?.documentId || row?.attributes?.documentId || null;
}

function getId(row) {
    return row?.id ?? row?.attributes?.id ?? null;
}

function buildJobData(body, clientDocumentId, relationMode = "connect-documentId") {
    /*
        Your schema:
        job.client = manyToOne -> api::client.client
        client.jobs = oneToMany -> api::job.job

        For Strapi 5, relation with documentId is safest:
        client: { connect: [{ documentId: "clientDocumentId" }] }

        relationMode fallback is only used if your Strapi project still expects
        numeric relation id.
    */

    const data = {
        title: normalizeString(body.title),
        location: normalizeString(body.location),
        jobTypeList: normalizeString(body.jobTypeList),
        closingDate: normalizeDateOrNull(body.closingDate),
        industeryList: normalizeString(body.industeryList),
        showToCandidateList: normalizeString(body.showToCandidateList),
        vacanciesNo: toNumberOrNull(body.vacanciesNo),
        shortDescription: normalizeString(body.shortDescription),
        experience: toNumberOrNull(body.experience),
        details: normalizeDetails(body.details),
        statusList: normalizeString(body.statusList) || "open",
        referenceNo: normalizeString(body.referenceNo),
    };

    if (relationMode === "connect-documentId") {
        data.client = {
            connect: [
                {
                    documentId: clientDocumentId,
                },
            ],
        };
    }

    if (relationMode === "documentId-direct") {
        data.client = clientDocumentId;
    }

    return data;
}

export async function POST(req) {
    const STRAPI_BASE_URL = process.env.STRAPI_BASE_URL;
    const RAW_TOKEN = String(
        process.env.STRAPI_TOKEN ||
        process.env.STRAPI_API_TOKEN ||
        ""
    ).trim();

    if (!STRAPI_BASE_URL || !RAW_TOKEN) {
        return Response.json(
            { ok: false, error: "Missing STRAPI_BASE_URL or STRAPI_TOKEN" },
            { status: 500 }
        );
    }

    const BEARER = RAW_TOKEN.toLowerCase().startsWith("bearer ")
        ? RAW_TOKEN
        : `Bearer ${RAW_TOKEN}`;

    async function strapiFetch(path, opts = {}) {
        const url = joinUrl(STRAPI_BASE_URL, path);
        const method = opts.method || "GET";

        const headers = {
            Authorization: BEARER,
            ...(opts.headers || {}),
        };

        let body = opts.body;

        if (opts.json !== undefined) {
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(opts.json);
        }

        const res = await fetch(url, {
            method,
            headers,
            body,
            redirect: "manual",
            cache: "no-store",
        });

        if (res.status >= 300 && res.status < 400) {
            const loc = res.headers.get("location");
            const err = new Error(
                `Strapi redirect detected (${res.status}). Fix STRAPI_BASE_URL. location=${loc}`
            );
            err.status = 500;
            throw err;
        }

        const parsed = await readBodySafe(res);

        if (!res.ok) {
            const msg =
                parsed?.error?.message ||
                parsed?.message ||
                parsed?.raw ||
                `Strapi error: ${res.status}`;

            const err = new Error(msg);
            err.status = res.status;
            err.details = parsed?.error || parsed;
            throw err;
        }

        return parsed;
    }

    async function findClientByDocumentId(clientDocumentId) {
        const query = qs.stringify(
            {
                // Do not hard filter status here.
                // Some clients may still be draft, and relation can still be needed.
                filters: {
                    documentId: {
                        $eq: clientDocumentId,
                    },
                },
                fields: ["documentId", "companyName"],
                pagination: {
                    page: 1,
                    pageSize: 1,
                },
            },
            { encodeValuesOnly: true }
        );

        const res = await strapiFetch(`clients?${query}`, { method: "GET" });
        return Array.isArray(res?.data) ? res.data[0] : null;
    }

    async function readJobWithClient(jobDocumentId) {
        const query = qs.stringify(
            {
                populate: {
                    client: {
                        fields: ["documentId", "companyName"],
                    },
                },
            },
            { encodeValuesOnly: true }
        );

        return strapiFetch(`jobs/${jobDocumentId}?${query}`, { method: "GET" });
    }

    try {
        const body = await readReqJsonSafe(req);

        if (!body || body.__raw) {
            return Response.json(
                { ok: false, error: "Invalid JSON body", details: body?.__raw || null },
                { status: 400 }
            );
        }

        const session = await getSession();

        if (!session?.isLoggedIn || !session?.user) {
            return Response.json(
                { ok: false, error: "Authentication required" },
                { status: 401 }
            );
        }

        const roleName = String(session?.role || "").trim().toLowerCase();

        if (roleName !== "staff") {
            return Response.json(
                { ok: false, error: "Only staff can create jobs" },
                { status: 403 }
            );
        }

        const clientDocumentId = normalizeString(
            req.headers.get("x-client-document-id")
        );
        const title = normalizeString(body.title);

        if (!clientDocumentId) {
            return Response.json(
                { ok: false, error: "No client was selected by staff" },
                { status: 400 }
            );
        }

        if (!title) {
            return Response.json(
                { ok: false, error: "Job title is required" },
                { status: 400 }
            );
        }

        const clientRow = await findClientByDocumentId(clientDocumentId);

        if (!clientRow) {
            return Response.json(
                {
                    ok: false,
                    error: "Client not found for provided clientDocumentId",
                    clientDocumentId,
                },
                { status: 404 }
            );
        }

        const resolvedClientId = getId(clientRow);
        const resolvedClientDocumentId = getDocId(clientRow) || clientDocumentId;

        /*
            Create job with client relation.

            Important:
            Your old route used client: clientId.
            In Strapi 5, documentId-based connect is more reliable for relations:
            client: { connect: [{ documentId: resolvedClientDocumentId }] }
        */
        let created;

        try {
            created = await strapiFetch("jobs?status=published", {
                method: "POST",
                json: {
                    data: buildJobData(body, resolvedClientDocumentId, "connect-documentId"),
                },
            });
        } catch (connectErr) {
            /*
                Fallback for Strapi setups that still accept direct documentId relation.
                This avoids silently creating a job without client relation.
            */
            try {
                created = await strapiFetch("jobs?status=published", {
                    method: "POST",
                    json: {
                        data: buildJobData(body, resolvedClientDocumentId, "documentId-direct"),
                    },
                });
            } catch (directErr) {
                directErr.details = {
                    connectDocumentIdError: connectErr?.details || connectErr?.message,
                    directDocumentIdError: directErr?.details || directErr?.message,
                };
                throw directErr;
            }
        }

        const createdJob = created?.data || null;
        const jobId = getId(createdJob);
        const jobDocumentId = getDocId(createdJob);

        if (!jobDocumentId) {
            return Response.json(
                {
                    ok: false,
                    error: "Job created but documentId missing in Strapi response",
                    details: created,
                },
                { status: 500 }
            );
        }

        const finalReferenceNo = normalizeString(body.referenceNo) || `JB-${jobId || jobDocumentId}`;

        const updated = await strapiFetch(`jobs/${jobDocumentId}?status=published`, {
            method: "PUT",
            json: {
                data: {
                    referenceNo: finalReferenceNo,

                    // Re-connect client again during update.
                    // This is intentional: even if create ignored relation,
                    // update will force the relation onto the job.
                    client: {
                        connect: [
                            {
                                documentId: resolvedClientDocumentId,
                            },
                        ],
                    },
                },
            },
        });

        const fresh = await readJobWithClient(jobDocumentId);
        const freshJob = fresh?.data || null;
        const linkedClient = freshJob?.client || freshJob?.attributes?.client?.data || null;

        if (!linkedClient) {
            return Response.json(
                {
                    ok: false,
                    error: "Job was created but client relation is still missing. Check Strapi role permissions for Job.client relation and API token permissions.",
                    client: {
                        id: resolvedClientId,
                        documentId: resolvedClientDocumentId,
                    },
                    job: {
                        id: jobId,
                        documentId: jobDocumentId,
                        referenceNo: finalReferenceNo,
                    },
                    created,
                    updated,
                    fresh,
                },
                { status: 500 }
            );
        }

        console.log(freshJob);
        await CreateNotification({
            title: `New Job Created (${freshJob.title})`,
            details: `A new job has been created.
Job Title: ${freshJob.title}
Reference No.: ${freshJob.referenceNo}
Client Name: ${freshJob.client.companyName}`,
            email: false,
        });

        return Response.json(
            {
                ok: true,
                message: "Job created successfully and linked with client",
                client: {
                    id: resolvedClientId,
                    documentId: resolvedClientDocumentId,
                    companyName: clientRow?.companyName || clientRow?.attributes?.companyName || "",
                },
                job: {
                    id: jobId,
                    documentId: jobDocumentId,
                    referenceNo: finalReferenceNo,
                },
                item: freshJob,
            },
            { status: 200 }
        );
    } catch (err) {
        return Response.json(
            {
                ok: false,
                error: err?.message || "Server error",
                details: err?.details || null,
            },
            { status: err?.status || 500 }
        );
    }
}
