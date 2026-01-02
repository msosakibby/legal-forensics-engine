import { Storage } from '@google-cloud/storage';
import { PubSub } from '@google-cloud/pubsub';
import { createClient } from '@supabase/supabase-js';
import { VertexAI, Part } from '@google-cloud/vertexai';
import { LlamaParseReader } from 'llama-parse';
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
const vertexAI = new VertexAI({ 
  project: process.env.GOOGLE_CLOUD_PROJECT!,
  location: 'us-central1' 
});

// --- LOAD DATA DICTIONARY ---
const dataDictionary = JSON.parse(
    await fs.readFile(path.join(process.cwd(), 'prompts/document_metadata.json'), 'utf-8')
);

// --- HELPER to build a prompt from the dictionary ---
function getSchemaPrompt(category: string, subCategory: string): { prompt: string, schema: string } {
    const docType = dataDictionary.find(
        (d: any) => d.category === category && d.subCategory === subCategory
    );
    if (!docType) {
        return { prompt: "Extract all key-value pairs as a JSON object.", schema: "{}" };
    }
    const fields = docType.fields.map((f: any) => `"${f.name}": "${f.type}" // Context: ${f.context}`).join(',\n');
    const schema = `{\n${fields}\n}`;
    const prompt = `You are a forensic data extraction expert. Based on the document provided, extract the data according to the following strict JSON schema. The "Context" comments are hints for where to find the data. Your output must be only the JSON.\n\nSCHEMA:\n${schema}`;
    return { prompt, schema };
}

// Helper to create a valid Part object for the Vertex AI SDK
const fileToPart = (fileBuffer: Buffer, mimeType: string): Part => {
  return { inlineData: { mimeType, data: fileBuffer.toString("base64") } };
};

async function main() {
  console.log('Starting Processor Job (Data Dictionary Mode)...');

  const { BUCKET, FILE, DOC_ID, PAGE_INDEX } = process.env;
  if (!BUCKET || !FILE || !DOC_ID || !PAGE_INDEX) throw new Error("Missing required environment variables");

  try {
    // 1. DOWNLOAD & PREP
    const [fileBuffer] = await storage.bucket(BUCKET).file(FILE).download();
    const tempPath = path.join(os.tmpdir(), `temp_${path.basename(FILE)}`);
    await fs.writeFile(tempPath, fileBuffer);

    // 2. GENERATE MARKDOWN
    console.log('Generating Layout-Aware Markdown via LlamaParse...');
    const reader = new LlamaParseReader({ 
        apiKey: process.env.LLAMA_CLOUD_API_KEY!,
        resultType: "markdown"
    });
    const docs = await reader.loadData(tempPath);
    const markdown = docs.map(doc => doc.text).join('\n\n---\n\n'); 
    await fs.unlink(tempPath);

    // 3. CLASSIFICATION
    console.log('Classifying document using Gemini 1.5 Flash...');
    const flashModel = vertexAI.preview.getGenerativeModel({
      model: 'gemini-1.5-flash-001',
      generationConfig: { responseMimeType: 'application/json' }
    });
    const classificationOptions = dataDictionary.map((d: any) => `'${d.subCategory}'`).join(' | ');
    const classificationParts: Part[] = [
        fileToPart(fileBuffer, "application/pdf"),
        { text: `Analyze this image and classify its document type. Return JSON: { "docType": ${classificationOptions}, "reasoning": "string" }` }
    ];
    const classResult = await flashModel.generateContent({ contents: [{ role: 'user', parts: classificationParts }] });
    const classResponse = classResult.response.candidates?.[0]?.content?.parts?.[0]?.text;
    const classification = JSON.parse(classResponse || '{}');
    const docType = classification.docType || "Handwritten Check Registers";
    console.log(`Classified as: ${docType} because: ${classification.reasoning}`);

    let extractedData: any = null;
    const proModel = vertexAI.preview.getGenerativeModel({
        model: 'gemini-1.5-pro-001',
        generationConfig: { responseMimeType: 'application/json' }
    });

    // 4. ROUTE TO LANE LOGIC
    switch (docType) {
        case "Bank Statements & Credit Card Statements": {
            console.log('Executing Lane A (Tables) with Gemini 1.5 Pro...');
            const { prompt } = getSchemaPrompt("Banking & Credit", docType);
            const proParts: Part[] = [{ text: `${prompt}\n\nHere is the document content in Markdown:\n${markdown}` }];
            const res = await proModel.generateContent({ contents: [{ role: 'user', parts: proParts }] });
            extractedData = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
            // Insert into 'statement_lines' database table here...
            break;
        }
        case "Invoices, Bills, & Receipts": {
            console.log('Executing Lane B (Receipts) with Gemini 1.5 Flash...');
            const { prompt } = getSchemaPrompt("General Transactional", docType);
            const flashParts: Part[] = [fileToPart(fileBuffer, "application/pdf"), { text: prompt }];
            const res = await flashModel.generateContent({ contents: [{ role: 'user', parts: flashParts }] });
            extractedData = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
            // Insert into 'receipts' database table here...
            break;
        }
        case "Handwritten Check Registers": {
            console.log('Executing Lane C (Handwriting) with Gemini 1.5 Pro...');
            const { prompt } = getSchemaPrompt("Personal Finance", docType);
            const proParts: Part[] = [fileToPart(fileBuffer, "application/pdf"), { text: prompt }];
            const res = await proModel.generateContent({ contents: [{ role: 'user', parts: proParts }] });
            extractedData = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
            // Insert into 'evidence_logs' database table here...
            break;
        }
        // Add more cases for your other document types (Contracts, DSD, etc.)
        default: {
            console.log(`No specific schema for '${docType}', performing general transcription with Gemini 1.5 Pro.`);
            const proParts: Part[] = [fileToPart(fileBuffer, "application/pdf"), { text: "Transcribe this document verbatim. Return JSON: { \"transcript\": \"...\" }" }];
            const res = await proModel.generateContent({ contents: [{ role: 'user', parts: proParts }] });
            extractedData = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
            // Insert into 'evidence_logs' database table here...
            break;
        }
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
      console.error("Fatal Error in Processor:", error.stack);
      // Log error to DB for visibility
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