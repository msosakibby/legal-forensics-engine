import { Storage } from '@google-cloud/storage';
import { PubSub } from '@google-cloud/pubsub';
import { createClient } from '@supabase/supabase-js';
import { VertexAI } from '@google-cloud/vertexai';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { LlamaParseReader } from 'llamaindex';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { retryWithBackoff } from '../../../src/utils/common.js';
import { LaneFactory } from './factory.js';

// Define dirname for local file resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// 1. INITIALIZATION
// ============================================================================
console.log("Initializing Services...");

const storage = new Storage();
const pubsub = new PubSub();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
const vertexAI = new VertexAI({ project: process.env.GOOGLE_CLOUD_PROJECT!, location: process.env.REGION! });
const visionClient = new ImageAnnotatorClient();

// Global Config Holder
let promptConfig: any = null;

// ============================================================================
// 2. HELPER FUNCTIONS
// ============================================================================

/**
 * Loads the forensic prompts from JSON file manually to avoid TS import errors.
 */
async function loadConfig() {
  try {
    // Resolve path relative to the built 'dist' folder structure
    const configPath = path.resolve(__dirname, '../../prompts/forensic_prompts.json');
    console.log(`   Loading prompts from: ${configPath}`);

    const fileContent = await fs.readFile(configPath, 'utf-8');
    promptConfig = JSON.parse(fileContent);
    console.log("   ✅ Forensic Prompts Loaded Successfully.");
  } catch (error: any) {
    console.error(`   ❌ Failed to load prompts: ${error.message}`);
    throw error;
  }
}


/**
 * Generates Layout-Aware Markdown using LlamaParse.
 */
async function generateMarkdown(filePath: string): Promise<string> {
  console.log('   -> Generating Layout-Aware Markdown (LlamaParse)...');
  try {
    const reader = new LlamaParseReader({ apiKey: process.env.LLAMA_CLOUD_API_KEY! });
    const documents = await reader.loadData(filePath);
    const text = documents.map(doc => doc.text).join('\n\n---\n\n');
    console.log(`      LlamaParse success. Length: ${text.length} chars.`);
    return text;
  } catch (error: any) {
    console.warn(`   ⚠️ LlamaParse Warning: ${error.message}. Returning empty string.`);
    return "";
  }
}

/**
 * Extracts raw text using Google Cloud Vision.
 */
async function extractTextWithVision(fileBuffer: Buffer): Promise<string> {
  console.log('   -> Extracting Text (Cloud Vision)...');
  try {
    const [result] = await visionClient.documentTextDetection(fileBuffer);
    const text = result.fullTextAnnotation?.text || '';
    console.log(`      Vision OCR success. Length: ${text.length} chars.`);
    return text;
  } catch (error: any) {
    console.error(`   ❌ Vision OCR Failed: ${error.message}`);
    return "";
  }
}

/**
 * Classifies the document type using the visual PDF representation.
 */
async function classifyDocument(fileBuffer: Buffer): Promise<string> {
  console.log('   -> Classifying Document...');
  const fastModel = vertexAI.getGenerativeModel({
    model: promptConfig.system_settings.model_standard,
    generationConfig: { responseMimeType: 'application/json' }
  });

  const pdfPart = { inlineData: { mimeType: 'application/pdf', data: fileBuffer.toString('base64') } };
  const prompt = promptConfig.prompts.classification.template;

  const res = await retryWithBackoff(() => fastModel.generateContent({
    contents: [{ role: 'user', parts: [pdfPart, { text: prompt }] }]
  }));

  const json = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
  return json.docType || "Unknown";
}



// ============================================================================
// 3. MAIN PROCESSOR LOGIC
// ============================================================================
async function main() {
  const { BUCKET, FILE, DOC_ID, PAGE_INDEX } = process.env;

  if (!BUCKET || !FILE || !DOC_ID || !PAGE_INDEX) {
    console.error("Missing Env Vars:", { BUCKET, FILE, DOC_ID, PAGE_INDEX });
    throw new Error("Missing required environment variables.");
  }

  const tempPath = path.join(os.tmpdir(), `proc_${path.basename(FILE)}`);

  try {
    // A. Load Config First
    await loadConfig();

    // B. Initialize Reasoning Model
    const reasoningModel = vertexAI.getGenerativeModel({
      model: promptConfig.system_settings.model_reasoning,
      generationConfig: { responseMimeType: 'application/json' }
    });

    console.log(`>>> Processing Started: ${FILE} (Page ${PAGE_INDEX})`);

    // 1. Download File
    console.log(`   Downloading from ${BUCKET}...`);
    const [fileBuffer] = await storage.bucket(BUCKET).file(FILE).download();
    await fs.writeFile(tempPath, fileBuffer);
    const pdfPart = { inlineData: { mimeType: 'application/pdf', data: fileBuffer.toString('base64') } };

    // 2. Classify Document (Determine Forensic Lane)
    const docType = await classifyDocument(fileBuffer);
    console.log(`   Lane Identified: ${docType}`);

    // Update Master Record (Only needed once, on Page 0)
    if (PAGE_INDEX === '0') {
      console.log("   Updating Master Document Type...");
      await supabase.from('documents').update({ doc_type: docType, processing_lane: docType }).eq('id', DOC_ID);
    }

    // 3. Execute Lane Logic
    let extractedData: any = {};
    let markdown = "";
    let tableUsed = "documents (metadata only)";
    let elementsCaptured: string[] = [];

    // Attempt to get a strategy handler from the factory
    const handler = LaneFactory.getHandler(docType);

    if (handler) {
      const result = await handler.process({
        docId: DOC_ID,
        tempPath,
        pdfPart,
        fileBuffer,
        reasoningModel,
        promptConfig,
        supabase,
        generateMarkdown,
        extractTextWithVision
      });
      ({ extractedData, markdown, tableUsed, elementsCaptured } = result);
    }

    // 4. Save Artifacts
    extractedData._meta_doc_type = docType;
    extractedData._reporting = {
      lane: docType,
      table: tableUsed,
      elements: elementsCaptured
    };

    if (!markdown || markdown.length < 10) {
      console.log("   -> LlamaParse result empty, falling back to Vision OCR for Markdown.");
      markdown = await extractTextWithVision(fileBuffer);
    }

    const baseName = `${FILE}`;

    console.log("   Saving artifacts to Processing Bucket...");
    await Promise.all([
      storage.bucket(process.env.PROCESSING_BUCKET!).file(`${baseName}.json`).save(JSON.stringify(extractedData)),
      storage.bucket(process.env.PROCESSING_BUCKET!).file(`${baseName}.md`).save(markdown)
    ]);

    // 5. Update Status in DB
    console.log("   Updating Page Status in DB...");
    await supabase.from('pages').insert({
      doc_id: DOC_ID,
      page_index: parseInt(PAGE_INDEX!),
      status: 'complete',
      extracted_data: extractedData,
      gcs_json_path: `${baseName}.json`,
      gcs_markdown_path: `${baseName}.md`
    });

    console.log("   Page Processing Complete.");

    // 6. Check for Aggregation Trigger
    const { count } = await supabase.from('pages')
      .select('*', { count: 'exact', head: true })
      .eq('doc_id', DOC_ID)
      .eq('status', 'complete');

    const { data: doc } = await supabase.from('documents')
      .select('total_pages')
      .eq('id', DOC_ID)
      .single();

    if (doc && count === doc.total_pages) {
      console.log("   >>> ALL PAGES DONE. Triggering Aggregator.");
      await pubsub.topic('document-ready-to-aggregate').publishMessage({
        data: Buffer.from(JSON.stringify({ docId: DOC_ID }))
      });
    }

  } catch (err: any) {
    console.error(`🔥 FATAL PROCESSOR ERROR: ${err.message}`);
    console.error(err.stack);
    if (DOC_ID && PAGE_INDEX) {
      await supabase.from('pages').insert({
        doc_id: DOC_ID,
        page_index: parseInt(PAGE_INDEX),
        status: 'error',
        error_message: err.message
      });
    }
    process.exit(1);
  } finally {
    if (process.env.FILE) {
      try { await fs.unlink(tempPath); } catch { }
    }
  }
}

main(); 