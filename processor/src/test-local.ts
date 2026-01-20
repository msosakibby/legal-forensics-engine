import type { Part } from '@google-cloud/vertexai';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import { inspect } from 'util';
import { LaneFactory } from './factory.js';

// --- GLOBAL ERROR HANDLERS ---
process.on('uncaughtException', (err) => {
  console.error('\n🔥 UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CLIENTS (Lazy Init) ---
let vertexAI: any;
let visionClient: any;
let supabase: any;
let LlamaParseReader: any;

async function initClients() {
  console.log("🔌 Initializing Clients...");

  const envPath = path.resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    console.log(`   Loading environment from ${envPath}`);
    const envConfig = readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const [key, ...rest] = trimmed.split('=');
      if (key && rest.length > 0) {
        const value = rest.join('=').replace(/(^"|"$|^'|'$)/g, '').trim();
        if (!process.env[key.trim()]) process.env[key.trim()] = value;
      }
    });
  }

  try {
    const vertexModule = await import('@google-cloud/vertexai');
    const visionModule = await import('@google-cloud/vision');
    const llamaModule = await import('llamaindex');

    // Initialize Vertex AI
    vertexAI = new vertexModule.VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT || 'mock-project',
      location: process.env.REGION || 'us-central1'
    });

    visionClient = new visionModule.ImageAnnotatorClient();
    LlamaParseReader = llamaModule.LlamaParseReader;
    supabase = createClient(process.env.SUPABASE_URL || 'https://mock.supabase.co', process.env.SUPABASE_KEY || 'mock-key');

    console.log("✅ Clients Initialized Successfully");
  } catch (err) {
    console.error("\n❌ CRITICAL ERROR LOADING DEPENDENCIES");
    console.error(err);
    process.exit(1);
  }
}

// --- HELPERS ---
const fileToPart = (fileBuffer: Buffer, mimeType: string): Part => ({
  inlineData: { mimeType, data: fileBuffer.toString("base64") },
});

async function generateMarkdown(filePath: string): Promise<string> {
  console.log('   -> Generating Markdown (LlamaParse)...');
  const reader = new LlamaParseReader({ apiKey: process.env.LLAMA_CLOUD_API_KEY! });
  const documents = await reader.loadData(filePath);
  return documents.map((doc: any) => doc.text).join('\n\n---\n\n');
}

async function extractTextWithVision(fileBuffer: Buffer): Promise<string> {
  console.log('   -> Extracting Text (Cloud Vision)...');
  const [result] = await visionClient.documentTextDetection(fileBuffer);
  return result.fullTextAnnotation?.text || '';
}

async function classifyWithAI(fileBuffer: Buffer, dataDictionary: any[]): Promise<string> {
  console.log('   -> Classifying (Gemini 1.5 Flash)...');
  const model = vertexAI.getGenerativeModel({
    model: 'gemini-1.5-flash-001',
    generationConfig: { responseMimeType: 'application/json' }
  });

  const sortedDictionary = [...dataDictionary].sort((a, b) => {
    if (a.subCategory.includes("Check Register")) return 1;
    if (b.subCategory.includes("Check Register")) return -1;
    return 0;
  });

  const options = sortedDictionary.map((d: any) => `'${d.subCategory}'`).join(' | ');

  const parts: Part[] = [
    fileToPart(fileBuffer, 'application/pdf'),
    {
      text: `Classify this document. 
Options: ${options}

CRITICAL INSTRUCTIONS (IN ORDER OF PRIORITY):
1.  **Financial Planner Letters**: If the document is a typed letter, correspondence, or meeting summary, especially from a financial advisor, classify it as 'Financial Planner Letters'. This takes precedence even if it contains tables or transaction data.
2.  **Legal Contracts & Agreements**: If the document is a Prenuptial Agreement or other formal legal contract, classify it as 'Legal Contracts & Agreements'.
3.  **Tax Returns & Forms**: If the document is an official tax form (e.g., 1040, 1099, W-2), classify it as 'Tax Returns & Forms (Federal/State)'.
4.  **Bank Statements**: If the document is a standard bank statement (checking/savings), classify it as 'Bank Statements'.
5.  **Credit Card Statements**: If the document is a credit card statement (Visa, Amex, Mastercard) often containing payment coupons, APR tables, or credit limit info, classify it as 'Credit Card Statements'.
6.  **Handwritten Check Registers**: ONLY if the document's primary content is a HANDWRITTEN grid or ledger for tracking checks and transactions, classify it as 'Handwritten Check Registers'. Do NOT use this for typed letters or statements.
7.  **Handwritten Monthly Expense Logs**: If the document is an unstructured lined paper log tracking expenses (often with dittos, margin notes), classify it as 'Handwritten Monthly Expense Logs'.
8.  **Receipts**: If it is a point-of-sale receipt (POS), classify it as 'Receipts'.
9.  **Invoices & Bills**: If it is a formal invoice, utility bill, or statement of charges to be paid, classify it as 'Invoices & Bills'.
10. **Real Estate Documents**: If the document is a Deed, Mortgage, Lease, Title Policy, Appraisal, or Closing Statement, classify it as 'Real Estate Documents'.
11. **Court Judgments**: If the document is a Court Judgment, Divorce Decree, or Ruling, classify it as 'Court Judgments'.

Return JSON: { "docType": "string", "reasoning": "string" }` }
  ];

  const res = await model.generateContent({ contents: [{ role: 'user', parts }] });
  const text = res.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const json = JSON.parse(text);
  console.log(`   -> Reasoning: ${json.reasoning}`);
  return json.docType || 'Unknown';
}

// --- MAIN TEST LOGIC ---
async function runTest() {
  await initClients();

  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npm run test:processor -- <path-to-pdf>");
    process.exit(1);
  }

  console.log(`\n🧪 TESTING PROCESSOR ON: ${filePath}`);

  const { data: doc, error: docInsertError } = await supabase.from('documents').insert({ filename: path.basename(filePath), status: 'test_harness' }).select().single();

  if (docInsertError || !doc) {
    console.error("❌ Failed to create dummy document record in Supabase.");
    console.error(docInsertError);
    process.exit(1);
  }

  const DOC_ID = doc.id;
  console.log(`Created Test Document ID: ${DOC_ID}`);

  const fullFileBuffer = await fs.readFile(filePath);

  // Split PDF
  const pdfDoc = await PDFDocument.load(fullFileBuffer);
  const pageCount = pdfDoc.getPageCount();
  console.log(`\n📄 Document has ${pageCount} pages. Testing with first page...`);
  const newPdf = await PDFDocument.create();
  const [copiedPage] = await newPdf.copyPages(pdfDoc, [0]);
  newPdf.addPage(copiedPage);
  const pageBufferUint8Array = await newPdf.save();
  const pageBuffer = Buffer.from(pageBufferUint8Array); // Convert Uint8Array to Buffer

  // Define categories for classification
  const categories = [
    { subCategory: 'Financial Planner Letters' },
    { subCategory: 'Legal Contracts & Agreements' },
    { subCategory: 'Tax Returns & Forms (Federal/State)' },
    { subCategory: 'Bank Statements' },
    { subCategory: 'Credit Card Statements' },
    { subCategory: 'Handwritten Check Registers' },
    { subCategory: 'Handwritten Monthly Expense Logs' },
    { subCategory: 'Receipts' },
    { subCategory: 'Invoices & Bills' },
    { subCategory: 'Real Estate Documents' },
    { subCategory: 'Court Judgments' }
  ];

  const docType = await classifyWithAI(pageBuffer, categories);
  console.log(`\n📂 Classified Document Type: "${docType}"`);

  // Load Prompts
  const promptsPath = path.resolve(__dirname, '../../prompts/forensic_prompts.json');
  if (!existsSync(promptsPath)) {
    console.error(`❌ Prompts file not found at ${promptsPath}`);
    process.exit(1);
  }
  const promptConfig = JSON.parse(readFileSync(promptsPath, 'utf-8'));

  const proModel = vertexAI.getGenerativeModel({
    model: 'gemini-1.5-pro-001',
    generationConfig: { responseMimeType: 'application/json' }
  });

  const pdfPart = fileToPart(pageBuffer, 'application/pdf');

  const handler = LaneFactory.getHandler(docType);

  if (handler) {
    console.log(`\n🚀 EXECUTING LANE STRATEGY: ${docType}`);
    try {
      const result = await handler.process({
        docId: DOC_ID,
        tempPath: filePath,
        pdfPart,
        fileBuffer: pageBuffer,
        reasoningModel: proModel,
        promptConfig,
        supabase,
        generateMarkdown,
        extractTextWithVision
      });

      console.log("\n💾 FINAL EXTRACTED JSON:");
      console.log(JSON.stringify(result.extractedData, null, 2));
    } catch (err: any) {
      console.error("❌ Lane Processing Error:", err.message);
    }
  } else {
    console.warn(`⚠️ No handler found for docType: ${docType}`);
  }
}

runTest().catch(err => {
  console.error("\n🔥🔥🔥 AN UNCAUGHT ERROR OCCURRED 🔥🔥🔥\n");
  if (err) {
    console.error("ERROR OBJECT:", inspect(err, { depth: null, colors: true }));
  }
  process.exit(1);
});