const CLIENT_JOBS_CONTEXT_KEY = "mw_client_jobs_context";

export function saveClientJobsContext(client) {
    if (typeof window === "undefined") return false;

    const documentId = String(client?.documentId || "").trim();
    if (!documentId) return false;

    try {
        window.sessionStorage.setItem(
            CLIENT_JOBS_CONTEXT_KEY,
            JSON.stringify({
                documentId,
                companyName: String(client?.companyName || "").trim(),
                selectedAt: Date.now(),
            })
        );
        return true;
    } catch {
        return false;
    }
}

export function readClientJobsContext() {
    if (typeof window === "undefined") return null;

    try {
        const raw = window.sessionStorage.getItem(CLIENT_JOBS_CONTEXT_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw);
        const documentId = String(parsed?.documentId || "").trim();

        if (!documentId) return null;

        return {
            documentId,
            companyName: String(parsed?.companyName || "").trim(),
            selectedAt: Number(parsed?.selectedAt || 0),
        };
    } catch {
        return null;
    }
}

export function clearClientJobsContext() {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(CLIENT_JOBS_CONTEXT_KEY);
}
