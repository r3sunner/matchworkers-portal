export const runtime = "nodejs";

import { GET as getSearchCandidatesMeta } from "../meta/route";

export async function GET(request) {
    return getSearchCandidatesMeta(request);
}
