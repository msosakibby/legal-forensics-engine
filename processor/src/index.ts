import { Storage } from '@google-cloud/storage';
import { PubSub } from '@google-cloud/pubsub';
import { createClient } from '@supabase/supabase-js';
import { VertexAI } from '@google-cloud/vertexai';
import { LlamaParseReader } from 'llamaindex';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// --- INITIALIZE CLIENTS ---
const storage = new Storage();
const pubsub = new PubSub();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);
// Vertex AI Init - Authenticates automatically via the Service Account on Cloud Run
const vertexAI = new VertexAI({ 
  project: process.env.GOOGLE_CLOUD_PROJECT!, // GCP provides this automatically
  location: 'us-central1' 
});

// --- SCHEMAS ---
const SCHEMAS = {
  LANE_A: `JSON Array: [{ "date": "YYYY-MM-DD", "description": "string", "amount": number, "type": "debit/credit", "balance": number }]`,
  LANE_B: `JSON Object: { "vendor": "string", "date": "YYYY-MM-DD", "total": number, "tax": number, "card_last_4": "string", "category": "string" }`,
  LANE_C: `JSON Object: { "full_transcript": "string", "handwritten_segments": [{ "text": "string", "confidence": "high/medium/low", "context": "string" }] }`
};

async function main() {
  console.log('Starting Processor Job (Best-in-Class Model Strategy)...');

  const { BUCKET, FILE, DOC_ID, PAGE_INDEX } = process.env;
  if (!BUCKET || !FILE || !DOC_ID || !PAGE_INDEX) {
    throw new Error("Missing required environment variables");
  }

  try {
    console.log(`Processing ${FILE} (Doc: ${DOC_ID}, Page: ${PAGE_INDEX})`);

    // 1. DOWNLOAD & PREP
    const [fileBuffer] = await storage.bucket(BUCKET).file(FILE).download();
    const tempPath = path.join(os.tmpdir(), `temp_${path.basename(FILE)}`);
    await fs.writeFile(tempPath, fileBuffer);

    // 2. GENERATE MARKDOWN (Base Layer for RAG & Lane A)
    console.log('Generating Layout-Aware Markdown via LlamaParse...');
    const reader = new LlamaParseReader({ 
        apiKey: process.env.LLAMA_CLOUD_API_KEY!,
        resultType: "markdown" 
    });
    const docs = await reader.loadData(tempPath);
    const markdown = docs[0].text;
    await fs.unlink(tempPath);

    // 3. CLASSIFICATION (Gemini 1.5 Flash for speed/cost)
    console.log('Classifying document lane using Gemini 2.5 Flash...');
    const flashModel = vertexAI.preview.getGenerativeModel({
      model: 'gemini-2.5-flash-lite', // STABLE ALIAS
      generationConfig: { responseMimeType: 'application/json' }
    });

    const classificationReq = {
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: fileBuffer.toString('base64') } },
          { text: `Analyze this page image. Classify into one of three lanes.
                   Return JSON: { "lane": "A" | "B" | "C", "reasoning": "string" }. A=Financial Statement/Table, B=Receipt/Invoice, C=Handwriting/Note.` }
        ]
      }]
    };
    const classResult = await flashModel.generateContent(classificationReq);
    const classResponse = classResult.response.candidates?.[0]?.content?.parts?.[0]?.text;
    const classification = JSON.parse(classResponse || '{"lane": "C"}'); // Default to Pro
    const lane = classification.lane;
    console.log(`Classified as Lane ${lane}: ${classification.reasoning}`);

    let extractedData: any = null;
    const proModel = vertexAI.preview.getGenerativeModel({
        model: 'gemini-2.5-pro', // STABLE ALIAS
        generationConfig: { responseMimeType: 'application/json' }
    });

    // 4. ROUTE TO LANE LOGIC
    if (lane === 'A') {
      // --- LANE A: FINANCIAL STATEMENTS (LlamaParse MD -> Gemini 1.5 Pro) ---
      console.log('Executing Lane A (Table Extraction) with Gemini 1.5 Pro...');
      const proRequest = {
        contents: [{
            role: 'user',
            parts: [{ text: `You are a forensic accountant. Extract transaction rows from the following markdown text. Ignore all headers, footers, and summary text. Your output must be only the JSON. Format: ${SCHEMAS.LANE_A}\n\n${markdown}` }]
        }]
      };
      const res = await proModel.generateContent(proRequest);
      const text = res.response.candidates?.[0]?.content?.parts?.[0]?.text;
      extractedData = JSON.parse(text || "{}");

      const rows = extractedData.transactions || extractedData.rows || [];
      if (Array.isArray(rows) && rows.length > 0) {
        await supabase.from('statement_lines').insert(rows.map((r: any) => ({
          doc_id: DOC_ID, page_number: parseInt(PAGE_INDEX), transaction_date: r.date,
          description: r.description, amount: r.amount, transaction_type: r.type, running_balance: r.balance
        })));
      }
    } else if (lane === 'B') {
      // --- LANE B: RECEIPTS (Gemini 1.5 Flash Vision) ---
      console.log('Executing Lane B (Receipt Extraction) with Gemini 1.5 Flash...');
      const flashRequest = {
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: fileBuffer.toString('base64') } },
            { text: `Extract receipt details. Format: ${SCHEMAS.LANE_B}` }
          ]
        }]
      };
      const res = await flashModel.generateContent(flashRequest);
      const text = res.response.candidates?.[0]?.content?.parts?.[0]?.text;
      extractedData = JSON.parse(text || "{}");
      await supabase.from('receipts').insert({
        doc_id: DOC_ID, vendor: extractedData.vendor, purchase_date: extractedData.date,
        total_amount: extractedData.total, tax_amount: extractedData.tax,
        card_last_4: extractedData.card_last_4, category: extractedData.category
      });
    } else { // Lane C or Default
      // --- LANE C: HANDWRITING (Gemini 1.5 Pro Vision) ---
      console.log('Executing Lane C (Handwriting/Default) with Gemini 1.5 Pro...');
      const proRequest = {
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: fileBuffer.toString('base64') } },
            { text: `Transcribe this document verbatim. Prioritize accuracy for any handwritten text. Format: ${SCHEMAS.LANE_C}` }
          ]
        }]
      };
      const res = await proModel.generateContent(proRequest);
      const text = res.response.candidates?.[0]?.content?.parts?.[0]?.text;
      extractedData = JSON.parse(text || "{}");
      await supabase.from('evidence_logs').insert({
        doc_id: DOC_ID, log_type: 'handwriting_gemini_pro',
        content: extractedData.full_transcript || markdown, entities: extractedData.handwritten_segments
      });
    }

    // 5. SAVE ASSETS & UPDATE DB
    const mdFileName = `${FILE}.md`;
    const jsonFileName = `${FILE}.json`;
    await Promise.all([
      storage.bucket(BUCKET).file(mdFileName).save(markdown),
      storage.bucket(BUCKET).file(jsonFileName).save(JSON.stringify(extractedData))
    ]);
    await supabase.from('pages').insert({
      doc_id: DOC_ID, page_index: parseInt(PAGE_INDEX), status: 'complete',
      extracted_data: extractedData, gcs_markdown_path: mdFileName, gcs_json_path: jsonFileName
    });
    console.log('Page processing complete.');

    // 6. AUTO-TRIGGER AGGREGATOR
    await checkCompletionAndTriggerAggregator(DOC_ID);

  } catch (err) {
    const error = err as Error;
    console.error(`Fatal Error: ${error.message}`, error.stack);
    await supabase.from('pages').insert({
      doc_id: DOC_ID, page_index: parseInt(PAGE_INDEX), status: 'error', error_message: error.message
    });
    process.exit(1);
  }
}

async function checkCompletionAndTriggerAggregator(docId: string) {
  try {
    const { data: doc } = await supabase.from('documents').select('total_pages').eq('id', docId).single();
    if (doc?.total_pages) {
      const { count } = await supabase.from('pages').select('*', { count: 'exact', head: true }).eq('doc_id', docId).eq('status', 'complete');
      if (count === doc.total_pages) {
        console.log('All pages finished! Triggering Aggregator...');
        await pubsub.topic('document-ready-to-aggregate').publishMessage({ data: Buffer.from(JSON.stringify({ docId })) });
      }
    }
  } catch (e) { console.error('Error checking completion:', e); }
}

main();