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

const {
  INPUT_BUCKET,
  PROCESSING_BUCKET,
  TOPIC_NAME,
  FILE_NAME, // Provided by the Dispatcher
} = process.env;

async function main() {
  if (!INPUT_BUCKET || !PROCESSING_BUCKET || !TOPIC_NAME || !FILE_NAME) {
    throw new Error("Missing required environment variables for splitter job.");
  }

  console.log(`Splitting file: ${FILE_NAME} from bucket: ${INPUT_BUCKET}`);

  // 1. Download the original file
  const [fileBuffer] = await storage.bucket(INPUT_BUCKET).file(FILE_NAME).download();

  // 2. Create a master document record in Supabase
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

  // 3. Load the PDF and split it into pages
  const pdfDoc = await PDFDocument.load(fileBuffer);
  const pageCount = pdfDoc.getPageCount();

  console.log(`PDF has ${pageCount} pages. Starting split and publish...`);

  const publishPromises: Promise<string>[] = [];

  for (let i = 0; i < pageCount; i++) {
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

  await Promise.all(publishPromises);
  console.log(`Published ${pageCount} messages to topic: ${TOPIC_NAME}`);

  // 4. Update the master document with the total page count
  await supabase
    .from('documents')
    .update({ total_pages: pageCount, status: 'processing' })
    .eq('id', docId);

  console.log('Splitter job finished successfully.');
}

main().catch(err => {
  console.error(`Fatal Error in Splitter: ${err.message}`, err.stack);
  process.exit(1);
});