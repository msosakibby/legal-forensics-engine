import { Storage } from '@google-cloud/storage';
import { PubSub } from '@google-cloud/pubsub';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib';

// --- INITIALIZE CLIENTS ---
const storage = new Storage();
const pubsub = new PubSub();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

async function main() {
  // 1. Validate Environment
  const {
    INPUT_BUCKET,
    PROCESSING_BUCKET,
    TOPIC_NAME,
    FILE_NAME
  } = process.env;

  if (!INPUT_BUCKET || !PROCESSING_BUCKET || !TOPIC_NAME || !FILE_NAME) {
    // Log what we have for debugging (masking values)
    console.error("Missing Env Vars. Present:", {
      INPUT_BUCKET: !!INPUT_BUCKET,
      PROCESSING_BUCKET: !!PROCESSING_BUCKET,
      TOPIC_NAME: !!TOPIC_NAME,
      FILE_NAME: !!FILE_NAME
    });
    throw new Error("Missing required environment variables for splitter job.");
  }

  console.log(`Splitting file: ${FILE_NAME} from bucket: ${INPUT_BUCKET}`);

  try {
    // 2. Download the original file
    const [fileBuffer] = await storage.bucket(INPUT_BUCKET).file(FILE_NAME).download();

    // 3. Create a master document record in Supabase
    // We start with status 'splitting'
    const { data: docData, error: docError } = await supabase
      .from('documents')
      .insert({
        filename: FILE_NAME,
        status: 'splitting',
      })
      .select()
      .single();

    if (docError || !docData) {
      throw new Error(`Failed to create document record: ${docError?.message}`);
    }
    
    const docId = docData.id;
    console.log(`Created document record with ID: ${docId}`);

    // 4. Load the PDF and split it into pages
    // CRITICAL FIX: ignoreEncryption: true allows reading "owner password" protected files
    const pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();
    console.log(`PDF has ${pageCount} pages. Starting split and publish...`);

    const publishPromises: Promise<string>[] = [];

    for (let i = 0; i < pageCount; i++) {
      // Create a new document for each page
      const newPdf = await PDFDocument.create();
      const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
      newPdf.addPage(copiedPage);

      const pageBuffer = await newPdf.save();
      const pageFileName = `${docId}/${FILE_NAME}-page-${i}.pdf`;

      // Upload the single page to the processing bucket
      await storage.bucket(PROCESSING_BUCKET).file(pageFileName).save(pageBuffer);

      // Publish a message for the processor job
      const message = {
        docId: docId,
        pageIndex: i,
        file: pageFileName,
        bucket: PROCESSING_BUCKET,
      };

      publishPromises.push(
        pubsub.topic(TOPIC_NAME).publishMessage({ json: message })
      );
    }

    // Wait for all messages to be published
    await Promise.all(publishPromises);
    console.log(`Published ${pageCount} messages to topic: ${TOPIC_NAME}`);

    // 5. Update the master document with the total page count
    // Status moves to 'processing' so the Aggregator knows what to expect
    await supabase
      .from('documents')
      .update({ total_pages: pageCount, status: 'processing' })
      .eq('id', docId);

    console.log('Splitter job finished successfully.');

  } catch (err: any) {
    console.error(`Fatal Error in Splitter: ${err.message}`, err.stack);
    // If we have a docId (from earlier in the process), we could update the status to 'error'
    // But since we might fail before creating the doc, we just exit 1.
    process.exit(1);
  }
}

main();