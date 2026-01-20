import { Storage } from '@google-cloud/storage';
import { createClient } from '@supabase/supabase-js';
import { VertexAI } from '@google-cloud/vertexai';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { NamingService } from './services/naming.js';
import { ArtifactService } from './services/artifactService.js';

// ============================================================================
// 1. INITIALIZATION
// ============================================================================
const storage = new Storage();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
const vertexAI = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT!,
  location: process.env.REGION!
});

// ============================================================================
// 2. HELPER FUNCTIONS
// ============================================================================



// ============================================================================
// 3. MAIN AGGREGATOR LOGIC
// ============================================================================
async function main() {
  console.log('>>> [AGGREGATOR] Job Starting...');
  const docId = process.env.DOC_ID;
  if (!docId) throw new Error('Missing DOC_ID environment variable');

  try {
    // 1. Fetch Master Record
    console.log(`1. Fetching Document Record: ${docId}`);
    const { data: docRecord } = await supabase.from('documents').select('*').eq('id', docId).single();
    if (!docRecord) throw new Error(`Document not found: ${docId}`);

    // 2. Fetch Pages
    console.log(`2. Fetching Page Records...`);
    const { data: pages } = await supabase
      .from('pages')
      .select('*')
      .eq('doc_id', docId)
      .order('page_index', { ascending: true });

    if (!pages || pages.length === 0) throw new Error('No processed pages found in DB.');
    console.log(`   Found ${pages.length} pages.`);

    // 3. Naming & Meta
    const firstPageData = pages[0].extracted_data || {};
    const reportMeta = firstPageData._reporting || { lane: "Unknown", table: "Unknown", elements: [] };

    const targetName = NamingService.determineTargetName(firstPageData);
    const folderPath = targetName;
    console.log(`3. Target Folder Determined: ${folderPath}`);

    // 4. Generate & Upload Artifacts
    const artifactService = new ArtifactService(storage, vertexAI);
    const fullJson = await artifactService.generateAndUploadArtifacts(docRecord, pages, targetName, folderPath);

    // ============================================================================
    // 6. CLEANUP & FINALIZE
    // ============================================================================
    console.log("6. Finalizing...");

    // Remove original from Input bucket
    await storage.bucket(process.env.INPUT_BUCKET!).file(docRecord.filename).delete();

    // Update DB
    await supabase.from('documents').update({
      status: 'archived',
      gcs_archive_path: `${folderPath}/`,
      summary_data: fullJson
    }).eq('id', docId);

    console.log(`>>> [AGGREGATOR] Success! Created folder: ${folderPath}`);

  } catch (err: any) {
    console.error(`🔥 FATAL AGGREGATOR ERROR: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();