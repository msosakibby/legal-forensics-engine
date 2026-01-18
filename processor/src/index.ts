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

// Load Forensic Configuration
import promptConfig from '../prompts/forensic_prompts.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- 1. INITIALIZATION ---
const storage = new Storage();
const pubsub = new PubSub();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
const vertexAI = new VertexAI({ project: process.env.GOOGLE_CLOUD_PROJECT!, location: process.env.REGION! });
const visionClient = new ImageAnnotatorClient();

// Models
const fastModel = vertexAI.getGenerativeModel({ 
  model: promptConfig.system_settings.model_standard,
  generationConfig: { responseMimeType: 'application/json' }
});
const reasoningModel = vertexAI.getGenerativeModel({ 
  model: promptConfig.system_settings.model_reasoning,
  generationConfig: { responseMimeType: 'application/json' }
});

// --- 2. FORENSIC HELPER FUNCTIONS ---

async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try { return await fn(); } 
  catch (e) {
    if (retries === 0) throw e;
    console.warn(`Retrying... ${retries} attempts left.`);
    await new Promise(r => setTimeout(r, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}

/** Math Verification: Validates Ledger Integrity (Balance = Prev + Amount) */
function verifyMath(lines: any[]): number[] {
  const failedIndices: number[] = [];
  if (!lines || lines.length < 2) return [];
  
  // Sort by date/index just in case
  // Assuming strict order from extraction
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i-1];
    const curr = lines[i];
    
    if (prev.balance != null && curr.balance != null && curr.amount != null) {
      // Logic: Previous Balance + Amount = Current Balance?
      // Use 0.05 tolerance for floating point drift
      const expected = parseFloat(prev.balance) + parseFloat(curr.amount);
      const actual = parseFloat(curr.balance);
      
      if (Math.abs(expected - actual) > 0.05) {
        failedIndices.push(i);
      }
    }
  }
  return failedIndices;
}

/** Legal Cross-Reference: Fetches the 'Rules' from the most recent Prenup */
async function getPrenupContext(): Promise<string> {
  const { data } = await supabase.from('legal_documents')
    .select('restrictions, financial_obligations')
    .eq('document_type', 'Prenuptial Agreement')
    .order('created_at', { ascending: false })
    .limit(1);
    
  if (!data || data.length === 0) return "NO ACTIVE RESTRICTIONS FOUND.";
  return JSON.stringify(data[0]);
}

/** Visual Classification using Gemini Flash (Fast & Cheap) */
async function classifyDocument(fileBuffer: Buffer): Promise<string> {
  const pdfPart = { inlineData: { mimeType: 'application/pdf', data: fileBuffer.toString('base64') }};
  const prompt = promptConfig.prompts.classification.template;
  
  const res = await retryWithBackoff(() => fastModel.generateContent({ 
    contents: [{ role: 'user', parts: [pdfPart, { text: prompt }] }] 
  }));
  
  const json = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
  return json.docType || "Unknown";
}

// --- 3. MAIN LOGIC ---
async function main() {
  const { BUCKET, FILE, DOC_ID, PAGE_INDEX } = process.env;
  if (!BUCKET || !FILE || !DOC_ID || !PAGE_INDEX) throw new Error("Missing Env Vars");

  try {
    console.log(`>>> Processing: ${FILE} (Page ${PAGE_INDEX})`);

    // A. DOWNLOAD
    const [fileBuffer] = await storage.bucket(BUCKET).file(FILE).download();
    const tempPath = path.join(os.tmpdir(), `proc_${path.basename(FILE)}`);
    await fs.writeFile(tempPath, fileBuffer);
    const pdfPart = { inlineData: { mimeType: 'application/pdf', data: fileBuffer.toString('base64') }};

    // B. CLASSIFY (Lane Selection)
    const docType = await classifyDocument(fileBuffer);
    console.log(`Lane Identified: ${docType}`);

    // Update Master Record (First Page Only)
    if (PAGE_INDEX === '0') {
      await supabase.from('documents').update({ doc_type: docType, processing_lane: docType }).eq('id', DOC_ID);
    }

    // C. LANE EXECUTION
    let extractedData: any = {};
    let markdown = ""; 
    let targetTable = "";

    // --- LANE 1: LEGAL CONTRACTS (High Precision Hybrid) ---
    if (docType === "Legal Contracts & Agreements") {
      targetTable = 'legal_documents';
      
      // 1. Text Extraction (LlamaParse for layout preservation)
      const reader = new LlamaParseReader({ apiKey: process.env.LLAMA_CLOUD_API_KEY! });
      const docs = await reader.loadData(tempPath);
      markdown = docs.map(d => d.text).join('\n\n');

      // 2. Expert Analysis (Gemini Pro)
      const prompt = promptConfig.prompts.legal_analysis.template;
      const res = await retryWithBackoff(() => reasoningModel.generateContent({ 
        contents: [{ role: 'user', parts: [pdfPart, { text: prompt }] }] 
      }));
      extractedData = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");

      // 3. Persist
      await supabase.from(targetTable).insert({
        doc_id: DOC_ID,
        document_type: extractedData["Document Type"],
        effective_date: extractedData["Effective Date"],
        parties: extractedData["Parties"],
        financial_obligations: extractedData["Obligations"],
        restrictions: extractedData["Restrictions"],
        risks: extractedData["Risks"],
        timeline: extractedData["Timeline"]
      });
    }

    // --- LANE 2: FINANCIAL PLANNER (Cross-Reference) ---
    else if (docType === "Financial Planner Letters") {
      targetTable = 'financial_correspondence';
      
      // 1. Text Extraction
      const reader = new LlamaParseReader({ apiKey: process.env.LLAMA_CLOUD_API_KEY! });
      markdown = (await reader.loadData(tempPath)).map(d => d.text).join('\n');

      // 2. Fetch Rules & Analyze
      const rules = await getPrenupContext();
      const prompt = promptConfig.prompts.financial_planner.template.replace('{{PRENUP_CONTEXT}}', rules);
      
      const res = await retryWithBackoff(() => reasoningModel.generateContent({ 
        contents: [{ role: 'user', parts: [pdfPart, { text: prompt }] }] 
      }));
      extractedData = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");

      await supabase.from(targetTable).insert({
        doc_id: DOC_ID,
        letter_date: extractedData["Letter Date"],
        addressor_name: extractedData["Organization"],
        addressee_name: extractedData["Recipients"],
        subject: extractedData["Subject"],
        analysis_data: extractedData["Forensic Analysis"] // Contains 'Violations' array
      });
    }

    // --- LANE 3: BANK STATEMENTS (Math Audit) ---
    else if (docType === "Bank Statements & Credit Card Statements") {
      targetTable = 'statement_lines';
      const reader = new LlamaParseReader({ apiKey: process.env.LLAMA_CLOUD_API_KEY! });
      markdown = (await reader.loadData(tempPath)).map(d => d.text).join('\n');

      const prompt = promptConfig.prompts.bank_statement_math.template;
      const res = await retryWithBackoff(() => reasoningModel.generateContent({ 
        contents: [{ role: 'user', parts: [pdfPart, { text: prompt }] }] 
      }));
      extractedData = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");

      // Math Verification
      if (extractedData.statement_lines) {
        const failedIndices = verifyMath(extractedData.statement_lines);
        
        const rows = extractedData.statement_lines.map((line: any, index: number) => ({
          doc_id: DOC_ID,
          page_number: parseInt(PAGE_INDEX!),
          account_number: extractedData["Account Number"],
          date: line.date,
          description: line.description,
          amount: line.amount,
          balance: line.balance,
          is_math_verified: !failedIndices.includes(index) // Flag if math failed
        }));
        
        if (rows.length > 0) await supabase.from(targetTable).insert(rows);
      }
    }

    // --- LANE 4: CHECK REGISTERS (Handwriting) ---
    else if (docType.includes("Check Register")) {
      targetTable = 'evidence_logs';
      
      // 1. Use Vision API (Best for Handwriting)
      const [result] = await visionClient.documentTextDetection(fileBuffer);
      const ocrText = result.fullTextAnnotation?.text || '';
      markdown = `[OCR TRANSCRIPT]\n${ocrText}`;

      // 2. Reconstruct
      const prompt = promptConfig.prompts.check_register.template.replace('{{OCR_TEXT}}', ocrText);
      const res = await retryWithBackoff(() => reasoningModel.generateContent({ 
        contents: [{ role: 'user', parts: [pdfPart, { text: prompt }] }] 
      }));
      extractedData = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");

      await supabase.from(targetTable).insert({
        doc_id: DOC_ID,
        log_type: 'check_register_reconstruction',
        entities: extractedData.transactions,
        content: `Entity: ${extractedData.register_summary?.entity}`
      });
    }

    // --- LANE 5: TAX RETURNS ---
    else if (docType.includes("Tax")) {
      targetTable = 'tax_documents';
      const reader = new LlamaParseReader({ apiKey: process.env.LLAMA_CLOUD_API_KEY! });
      markdown = (await reader.loadData(tempPath)).map(d => d.text).join('\n');

      const prompt = promptConfig.prompts.tax_return.template;
      const res = await retryWithBackoff(() => reasoningModel.generateContent({ 
        contents: [{ role: 'user', parts: [pdfPart, { text: prompt }] }] 
      }));
      extractedData = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");

      await supabase.from(targetTable).insert({
        doc_id: DOC_ID,
        tax_year: extractedData["Tax Year"],
        form_number: extractedData["Form"],
        entity_name: extractedData["Entity"],
        total_income: extractedData["Total Income"],
        tax_liability: extractedData["Tax Liability"],
        depreciation_schedule: extractedData["Depreciation"]
      });
    }

    // D. SAVE ARTIFACTS & FINALIZE
    extractedData._meta_doc_type = docType;
    const baseName = `${FILE}`;
    
    await Promise.all([
      storage.bucket(BUCKET).file(`${baseName}.json`).save(JSON.stringify(extractedData)),
      storage.bucket(BUCKET).file(`${baseName}.md`).save(markdown)
    ]);

    await supabase.from('pages').insert({
      doc_id: DOC_ID,
      page_index: parseInt(PAGE_INDEX!),
      status: 'complete',
      extracted_data: extractedData,
      gcs_json_path: `${baseName}.json`,
      gcs_markdown_path: `${baseName}.md`
    });

    console.log("Page Complete. Checking for Aggregation...");
    
    // Check if this was the last page
    const { count } = await supabase.from('pages').select('*', { count: 'exact', head: true }).eq('doc_id', DOC_ID).eq('status', 'complete');
    const { data: doc } = await supabase.from('documents').select('total_pages').eq('id', DOC_ID).single();
    
    if (doc && count === doc.total_pages) {
      console.log("Triggering Aggregator.");
      await pubsub.topic('document-ready-to-aggregate').publishMessage({ data: Buffer.from(JSON.stringify({ docId: DOC_ID })) });
    }

  } catch (err: any) {
    console.error(`FATAL ERROR: ${err.message}`);
    // Log error to DB
    if (process.env.DOC_ID) {
        await supabase.from('pages').insert({ 
            doc_id: process.env.DOC_ID, 
            page_index: parseInt(process.env.PAGE_INDEX || '0'), 
            status: 'error', 
            error_message: err.message 
        });
    }
    process.exit(1);
  } finally {
    // Cleanup
    if (process.env.FILE) {
        try { await fs.unlink(path.join(os.tmpdir(), `proc_${path.basename(process.env.FILE)}`)); } catch {}
    }
  }
}

main();