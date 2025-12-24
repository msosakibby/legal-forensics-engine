// aggregator/src/settings.ts

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
    runtime: {
        docId: process.env.DOC_ID,
        inputBucket: process.env.INPUT_BUCKET,
        processingBucket: process.env.PROCESSING_BUCKET,
        archiveBucket: process.env.ARCHIVE_BUCKET,
    }
};