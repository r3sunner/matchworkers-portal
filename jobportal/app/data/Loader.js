import qs from 'qs';

let baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
let appMode = process.env.NEXT_PUBLIC_MODE;
let cacheSystem = "";
let prettyUrl = false;
if (appMode == "dev") {
    cacheSystem = "no-cache";
    prettyUrl = true;
}
const authToken = null;

export async function fetchData(path, filter) {


    const header =
    {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
        },
        cache: cacheSystem,

    }


    const url = new URL(path, baseUrl);
    url.search = filter;

    // show API links
    //console.log(url.href);

    try {

        const response = await fetch(url.href, authToken ? header : {});
        const data = await response.json();
        //  const flattenedData = flattenAttributes(data);
        return data;
    } catch (error) {
        console.log(error);
    }
}


export async function getAllJobRoles() {
    let allJobRoles = [];
    let page = 1;
    let pageSize = 20;

    while (true) {
        const query = qs.stringify({
            pagination: {
                page,
                pageSize,
            },
        });

        const response = await fetchData("job-roles", query);

        const jobRoles = response?.data || [];
        const pagination = response?.meta?.pagination;

        allJobRoles.push(...jobRoles);

        if (pagination.page >= pagination.pageCount) {
            break;
        }
        page++;
    }

    return allJobRoles;
}


export async function getCandidateEnums() {

    const query = qs.stringify({
        encodeValuesOnly: prettyUrl, // Recommended
    });

    let candidateEnums = await fetchData("candidate-enums", query);
    return candidateEnums
}


/* ✅ Create Candidate (multipart with files) */
export async function createCandidate(payload) {
    // payload is your form data from react-hook-form
    // IMPORTANT: payload.job_roles should be array of IDs (recommended) OR array of strings if your backend maps it
    // For Strapi relations, IDs is best.

    //const authToken = null; // put real token when you add login

    // ✅ build JSON part
    const data = {
        firstName: payload.firstName,
        lastName: payload.lastName,
        fullName: payload.fullName,
        gender: payload.gender,
        birthDate: payload.birthDate,

        nationality: payload.nationality,
        maritalStatus: payload.maritalStatus,
        seasonalStatus: payload.seasonalStatus,
        englishLevel: payload.englishLevel,


        mobile: payload.mobile,


        jobStatus: payload.jobStatus,
        job_roles: payload.job_roles, // ✅ ideally array of IDs

        passportExpireDate: payload.passportExpireDate,

        shortSummary: payload.shortSummary || "",
        privateNotes: payload.privateNotes || "",

        numberOfExperience: payload.numberOfExperience ?? 0,
        currentJobExperiece: payload.currentJobExperiece || "",
        previousJobExperiece: payload.previousJobExperiece || "",
        previousCompany: payload.previousCompany || "",

        dateScreeningInterview: payload.dateScreeningInterview || null,
        screeningVideoLink: payload.screeningVideoLink || "",

        currentlyEmployed: !!payload.currentlyEmployed,
        source: payload.source || "",

        username: payload.username,
        email: payload.email,
        password: payload.password, // only if your API supports it
    };

    // ✅ repeatable component "documents" (NO file here, only name/remarks)
    // Strapi expects something like: documents: [{ name, remarks }, ...]
    data.documents = (payload.documents || [])
        .filter((d) => (d?.name || "").trim() || (d?.remarks || "").trim() || d?.file)
        .map((d) => ({
            name: d?.name || "",
            remarks: d?.remarks || "",
            // file will be attached via FormData below
        }));

    // ✅ build FormData
    const fd = new FormData();
    fd.append("data", JSON.stringify(data));

    // ✅ Single media fields (field names MUST match Strapi model)
    if (payload.profileImageFile instanceof File) {
        fd.append("files.profileImage", payload.profileImageFile);
    }
    if (payload.cvFile instanceof File) {
        fd.append("files.CV", payload.cvFile);
    }
    if (payload.passportFile instanceof File) {
        fd.append("files.passport", payload.passportFile);
    }

    // ✅ workingVideos (multiple media)
    if (Array.isArray(payload.workingVideos)) {
        payload.workingVideos.forEach((f) => {
            if (f instanceof File) fd.append("files.workingVideos", f);
        });
    }

    // ✅ miScreeningVideo (single media)
    if (payload.miScreeningVideo instanceof File) {
        fd.append("files.miScreeningVideo", payload.miScreeningVideo);
    }

    // ✅ documents component files
    // Strapi expects: files.documents[0].file, files.documents[1].file, ...
    (payload.documents || []).forEach((doc, idx) => {
        if (doc?.file instanceof File) {
            fd.append(`files.documents.${idx}.file`, doc.file);
        }
    });

    const url = new URL("candidates", baseUrl);

    const headers = authToken
        ? {
            Authorization: `Bearer ${authToken}`,
        }
        : {};

    const res = await fetch(url.href, {
        method: "POST",
        headers,
        body: fd, // ✅ do NOT set Content-Type manually for FormData
        cache: cacheSystem,
    });

    const result = await res.json();

    if (!res.ok) {
        // show Strapi error details
        throw new Error(result?.error?.message || "Failed to create candidate");
    }

    return result;
}


