import config from './settings';
import { Storage } from '@google-cloud/storage';
import { createClient } from '@supabase/supabase-js';
import { VertexAI } from '@google-cloud/vertexai';
import { PDFDocument } from 'pdf-lib';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { createReadStream } from 'fs';

// --- INITIALIZE CLIENTS ---
const storage = new Storage();
const supabase = createClient(config.supabase.url, config.supabase.key);
const vertexAI = new VertexAI({ 
  project: config.gcp.project,
  location: config.gcp.region 
});

// --- PROMPTS FOR SUMMARIZATION ---
const PROMPTS = {
    LANE_A: `You are a personal finance assistant. Summarize the attached statement... [rest of your detailed prompt]`,
    LANE_C: `You are a personal finance assistant. Analyze and summarize my check register... [rest of your detailed prompt]`
};

/**
 * Generates a summary for the entire document, saves it, and embeds it in a new PDF.
 */
async function generateAndSaveSummary(
  prompt: string,
  content: string,
  baseName: string,
  bucketName: string,
  originalPdfBuffer: Buffer
) {
  console.log(`Generating document summary for ${baseName}...`);
  
  const proModel = vertexAI.preview.getGenerativeModel({ model: 'gemini-1.5-pro' });
  const summaryRes = await proModel.generateContent(prompt + '\n\n' + content);
  const summaryText = summaryRes.response.candidates?.[0]?.content?.parts?.[0]?.text || "Summary could not be generated.";

  const dsBaseName = `${baseName}_DS`; // DS for "Document Summary"
  const folderName = baseName;

  // Save summary MD and JSON
  await Promise.all([
    storage.bucket(bucketName).file(`${folderName}/${dsBaseName}.md`).save(summaryText),
    storage.bucket(bucketName).file(`${folderName}/${dsBaseName}.json`).save(JSON.stringify({ summary: summaryText })),
  ]);

  // Create a new PDF with the summary embedded in its metadata
  try {
    const pdfDoc = await PDFDocument.load(originalPdfBuffer);
    pdfDoc.setSubject(summaryText);
    const pdfBytes = await pdfDoc.save();
    await storage.bucket(bucketName).file(`${folderName}/${dsBaseName}.pdf`).save(pdfBytes);
    console.log(`Successfully saved summary assets to folder: ${folderName}`);
  } catch (e) {
    console.error(`Error updating PDF metadata for ${dsBaseName}:`, e);
  }
}

async function main() {
  console.log('Starting Aggregator Job (with Summarization)...');

  const docId = config.runtime.docId;
  if (!docId) throw new Error('Missing runtime configuration: docId');

  try {
    const { data: docRecord } = await supabase
      .from('documents')
      .select('*')
      .eq('id', docId)
      .single();

    if (!docRecord) throw new Error(`Document not found: ${docId}`);

    const { data: pages } = await supabase
      .from('pages')
      .select('gcs_markdown_path')
      .eq('doc_id', docId)
      .order('page_index', { ascending: true });

    if (!pages || pages.length === 0) throw new Error('No processed pages found.');

    console.log(`Aggregating ${pages.length} pages for ${docRecord.filename}...`);

    let finalBaseName = path.parse(docRecord.filename).name;
    // ... [Your existing RENAME_ logic would go here] ...
    const folderName = finalBaseName;

    // 1. GATHER ALL MARKDOWN CONTENT
    let fullMarkdownTranscript = `# Forensics Report: ${finalBaseName}\n\n`;
    for (const page of pages) {
        if (page.gcs_markdown_path) {
            const [mdBuffer] = await storage.bucket(config.runtime.processingBucket!).file(page.gcs_markdown_path).download();
            fullMarkdownTranscript += `## Page ${pages.indexOf(page) + 1}\n${mdBuffer.toString()}\n\n---\n\n`;
        }
    }
    
    // 2. DOWNLOAD ORIGINAL PDF (Needed for summarization output and final archive)
    const [originalPdfBuffer] = await storage.bucket(config.runtime.inputBucket!).file(docRecord.filename).download();

    // 3. **NEW**: ROUTE TO SUMMARIZATION LOGIC BASED ON DOC_TYPE
    if (docRecord.doc_type === 'A') {
        await generateAndSaveSummary(PROMPTS.LANE_A, fullMarkdownTranscript, finalBaseName, config.runtime.archiveBucket!, originalPdfBuffer);
    } else if (docRecord.doc_type === 'C') {
        await generateAndSaveSummary(PROMPTS.LANE_C, fullMarkdownTranscript, finalBaseName, config.runtime.archiveBucket!, originalPdfBuffer);
    }

    // 4. PERFORM FINAL AGGREGATION (Your existing logic)
    // ... [Your existing logic for creating the final PDF with attachments, sidecars, and Vector Store sync would go here] ...
    
    // Finalize DB
    await supabase
      .from('documents')
      .update({ status: 'archived_with_summary' })
      .eq('id', docId);

    console.log(`Successfully archived and summarized: ${folderName}`);

  } catch (err) {
    const error = err as Error;
    console.error(`Fatal Error in Aggregator: ${error.message}`, error.stack);
    process.exit(1);
  }
}

main();cd 