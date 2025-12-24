// processor/src/settings.ts

// REMOVED: The line "import 'dotenv/config';" or "require('dotenv').config();"

export default {
    gcp: {
        project: process.env.GOOGLE_CLOUD_PROJECT!,
        region: process.env.REGION!,
    },
    supabase: {
        url: process.env.SUPABASE_URL!,
        key: process.env.SUPABASE_KEY!,
    },
    llama: {
        apiKey: process.env.LLAMA_CLOUD_API_KEY!,
    },
    runtime: { // These are populated by the Dispatcher
        bucket: process.env.BUCKET,
        file: process.env.FILE,
        docId: process.env.DOC_ID,
        pageIndex: process.env.PAGE_INDEX,
    }
};