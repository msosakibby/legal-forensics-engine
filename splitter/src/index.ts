import { Storage } from '@google-cloud/storage';
import { PubSub } from '@google-cloud/pubsub';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib';

// ============================================================================
// 1. INITIALIZATION
// ============================================================================
const storage = new Storage();
const pubsub = new PubSub();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

async function main() {
  console.log(">>> [SPLITTER] Job Starting...");

  // ============================================================================
  // 2. ENVIRONMENT CHECK
  // ============================================================================
  console.log("1. Validating Environment Variables...");
  const {
    INPUT_BUCKET,
    PROCESSING_BUCKET,
    TOPIC_NAME,
    FILE_NAME
  } = process.env;

  // Log variable presence for debugging (without revealing secrets)
  const envStatus = {
    INPUT_BUCKET: !!INPUT_BUCKET,
    PROCESSING_BUCKET: !!PROCESSING_BUCKET,
    TOPIC_NAME: !!TOPIC_NAME,
    FILE_NAME: !!FILE_NAME,
    SUPABASE_URL: !!process.env.SUPABASE_URL
  };

  if (!INPUT_BUCKET || !PROCESSING_BUCKET || !TOPIC_NAME || !FILE_NAME) {
    console.error("❌ Critical: Missing required environment variables.", envStatus);
    throw new Error("Missing required environment variables for splitter job.");
  }

  console.log(`   Target File: ${FILE_NAME}`);
  console.log(`   Input Bucket: ${INPUT_BUCKET}`);
  console.log(`   Output Bucket: ${PROCESSING_BUCKET}`);

  try {
    // ============================================================================
    // 3. DOWNLOAD SOURCE
    // ============================================================================
    console.log("2. Downloading Source PDF...");
    const [fileBuffer] = await storage.bucket(INPUT_BUCKET).file(FILE_NAME).download();
    console.log(`   Download complete. File size: ${fileBuffer.length} bytes.`);

    // ============================================================================
    // 4. DATABASE RECORD
    // ============================================================================
    console.log("3. Creating Master Document Record in Supabase...");
    // We explicitly set 'total_pages' to 0 initially
    const { data: docData, error: docError } = await supabase
      .from('documents')
      .insert({
        filename: FILE_NAME,
        status: 'splitting',
        total_pages: 0 
      })
      .select()
      .single();

    if (docError || !docData) {
      throw new Error(`Failed to create document record: ${docError?.message}`);
    }
    
    const docId = docData.id;
    console.log(`   ✅ Created DB Record. Doc ID: ${docId}`);

    // ============================================================================
    // 5. PDF PARSING & SPLITTING
    // ============================================================================
    console.log("4. Loading and Parsing PDF...");
    
    // CRITICAL FIX: { ignoreEncryption: true } prevents crash on password-protected bank statements
    const pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
    
    const pageCount = pdfDoc.getPageCount();
    console.log(`   PDF Loaded. Total Pages to Process: ${pageCount}`);

    console.log("5. Processing Pages (Split -> Upload -> Publish)...");
    const publishPromises: Promise<string>[] = [];

    for (let i = 0; i < pageCount; i++) {
      // Isolate the single page
      const newPdf = await PDFDocument.create();
      const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
      newPdf.addPage(copiedPage);

      const pageBuffer = await newPdf.save();
      const pageFileName = `${docId}/${FILE_NAME}-page-${i}.pdf`;

      // Upload page to Processing Bucket
      await storage.bucket(PROCESSING_BUCKET).file(pageFileName).save(pageBuffer);

      // Construct PubSub Message
      const message = {
        docId: docId,
        pageIndex: i,
        file: pageFileName,
        bucket: PROCESSING_BUCKET,
      };

      // Publish Event
      publishPromises.push(
        pubsub.topic(TOPIC_NAME).publishMessage({ json: message })
      );
      
      // Periodic logging for large files
      if ((i + 1) % 5 === 0) {
        console.log(`   -> Processed ${i + 1}/${pageCount} pages...`);
      }
    }

    // Wait for all PubSub messages to trigger
    await Promise.all(publishPromises);
    console.log(`   ✅ Successfully published ${pageCount} messages to topic: ${TOPIC_NAME}`);

    // ============================================================================
    // 6. FINALIZE
    // ============================================================================
    console.log("6. Updating Master Record Status...");
    const { error: updateError } = await supabase
      .from('documents')
      .update({ 
        total_pages: pageCount, 
        status: 'processing' // Handoff to Processor
      })
      .eq('id', docId);

    if (updateError) {
        console.error(`   ⚠️ Warning: Failed to update master record: ${updateError.message}`);
    }

    console.log(">>> [SPLITTER] Job Completed Successfully.");

  } catch (err: any) {
    console.error(`🔥 FATAL SPLITTER ERROR: ${err.message}`);
    console.error(err.stack);
    // Force exit with error code 1 so Cloud Run knows to retry or alert
    process.exit(1);
  }
}

main();