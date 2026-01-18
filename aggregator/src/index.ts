import { Storage } from '@google-cloud/storage';
import { createClient } from '@supabase/supabase-js';
import { VertexAI } from '@google-cloud/vertexai';
import { PDFDocument } from 'pdf-lib';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

// --- INITIALIZE CLIENTS ---
const storage = new Storage();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
const vertexAI = new VertexAI({ 
  project: process.env.GOOGLE_CLOUD_PROJECT!,
  location: process.env.REGION!
});

// --- HELPERS ---

async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try { return await fn(); } 
  catch (error: any) {
    if (retries === 0) throw error;
    console.warn(`API call failed. Retrying in ${delay}ms... Error: ${error.message}`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}

/**
 * Aggregates specific forensic findings from all pages into a consolidated summary block.
 */
function buildForensicHighlights(pages: any[], docType: string): string {
  let highlights = "";

  // --- LANE 1: LEGAL CONTRACTS ---
  if (docType === "Legal Contracts & Agreements") {
    let allRisks: any[] = [];
    let timelineEvents: any[] = [];

    pages.forEach(p => {
      const d = p.extracted_data;
      if (d?.Risks) allRisks.push(...d.Risks);
      if (d?.Timeline) timelineEvents.push(...d.Timeline);
    });

    if (allRisks.length > 0) {
      highlights += `## ⚠️ Legal Risk Assessment\n`;
      // Filter for High/Medium risks
      const highRisks = allRisks.filter((r: any) => r.Severity === 'High');
      if (highRisks.length > 0) {
        highlights += `### 🚨 CRITICAL RISKS DETECTED (${highRisks.length})\n`;
        highRisks.forEach((r: any) => highlights += `- **${r.Risk}**: ${r.Reasoning}\n`);
      }
      highlights += `\n**Total Risks Identified:** ${allRisks.length}\n\n`;
    }

    if (timelineEvents.length > 0) {
      highlights += `## 📅 Constructed Timeline\n`;
      // Sort timeline by date
      timelineEvents.sort((a: any, b: any) => new Date(a.Date).getTime() - new Date(b.Date).getTime());
      timelineEvents.forEach((t: any) => highlights += `- **${t.Date}**: ${t.Event}\n`);
      highlights += `\n`;
    }
  }

  // --- LANE 2: FINANCIAL PLANNER ---
  else if (docType === "Financial Planner Letters") {
    let allViolations: any[] = [];
    pages.forEach(p => {
      const d = p.extracted_data;
      if (d?.["Forensic Analysis"]?.Violations) {
        allViolations.push(...d["Forensic Analysis"].Violations);
      }
    });

    if (allViolations.length > 0) {
      highlights += `## 🚨 PRENUP COMPLIANCE ALERTS\n`;
      highlights += `**Violations Detected:** ${allViolations.length}\n`;
      allViolations.forEach((v: any) => {
        highlights += `- **Clause:** ${v.Clause} | **Issue:** ${v.Violation}\n`;
      });
      highlights += `\n`;
    }
  }

  // --- LANE 3: BANK STATEMENTS ---
  else if (docType === "Bank Statements & Credit Card Statements") {
    let totalTrans = 0;
    let failedMath = 0;
    
    pages.forEach(p => {
      const lines = p.extracted_data?.statement_lines || [];
      totalTrans += lines.length;
      // Count rows where is_math_verified is explicit FALSE
      failedMath += lines.filter((l: any) => l.is_math_verified === false).length;
    });

    highlights += `## 🧮 Forensic Math Audit\n`;
    highlights += `- **Total Transactions:** ${totalTrans}\n`;
    if (failedMath > 0) {
      highlights += `- **🔴 CALCULATION MISMATCHES:** ${failedMath}\n`;
      highlights += `> Warning: ${failedMath} running balances did not match the previous balance +/- transaction amount.\n`;
    } else {
      highlights += `- **Verification Status:** ✅ All running balances verified mathematically.\n`;
    }
    highlights += `\n`;
  }

  return highlights;
}

/**
 * Main function to generate files and update DB
 */
async function main() {
  console.log('Starting Aggregator Job...');
  const docId = process.env.DOC_ID;
  if (!docId) throw new Error('Missing DOC_ID');

  try {
    // 1. FETCH DATA
    const { data: docRecord } = await supabase.from('documents').select('*').eq('id', docId).single();
    if (!docRecord) throw new Error(`Document not found: ${docId}`);

    const { data: pages } = await supabase
      .from('pages')
      .select('*')
      .eq('doc_id', docId)
      .order('page_index', { ascending: true });

    if (!pages || pages.length === 0) throw new Error('No processed pages found.');

    console.log(`Aggregating ${pages.length} pages...`);

    // 2. DETERMINE DOCTYPE & NAMING
    // Prefer the AI-classified type from Page 0, fall back to DB default
    const firstPageData = pages[0].extracted_data || {};
    const docType = firstPageData._meta_doc_type || docRecord.doc_type || "Unknown Document";
    
    // Smart Naming - Simplified
    let finalBaseName = path.parse(docRecord.filename).name; 
    const folderName = finalBaseName;

    // 3. BUILD FORENSIC HIGHLIGHTS
    console.log("Building Forensic Highlights...");
    const forensicSummary = buildForensicHighlights(pages, docType);

    // 4. COMPILE FULL TRANSCRIPT
    let fullMarkdownTranscript = `# Forensic Report: ${finalBaseName}\n\n`;
    fullMarkdownTranscript += `**Document Type:** ${docType}\n`;
    fullMarkdownTranscript += `**Process Date:** ${new Date().toISOString()}\n\n`;
    
    if (forensicSummary) {
      fullMarkdownTranscript += `---\n${forensicSummary}\n---\n\n`;
    }

    // Append page content
    for (const page of pages) {
      if (page.gcs_markdown_path) {
        const [mdBuffer] = await storage.bucket(process.env.PROCESSING_BUCKET!).file(page.gcs_markdown_path).download();
        fullMarkdownTranscript += `### Page ${page.page_index + 1}\n\n${mdBuffer.toString()}\n\n---\n\n`;
      }
    }

    // 5. GENERATE AI SUMMARY (If Forensic Highlights are thin)
    // Only call AI if we didn't generate a robust forensic section
    let finalSummaryText = forensicSummary;
    if (!finalSummaryText || finalSummaryText.length < 50) {
      console.log("Forensic highlights thin. Generating AI narrative summary...");
      const proModel = vertexAI.getGenerativeModel({ model: 'gemini-1.5-pro-001' });
      // Truncate to avoid context limit issues on large docs
      const prompt = `Summarize this ${docType} document. Highlight key financial figures, dates, and obligations.\n\nTEXT:\n${fullMarkdownTranscript.substring(0, 30000)}`;
      
      const res = await retryWithBackoff(() => proModel.generateContent(prompt));
      finalSummaryText = res.response.candidates?.[0]?.content?.parts?.[0]?.text || "Summary Unavailable";
      
      // Prepend to transcript
      fullMarkdownTranscript = `# Executive Summary\n${finalSummaryText}\n\n` + fullMarkdownTranscript;
    }

    // 6. SAVE ARTIFACTS
    const dsBaseName = `${finalBaseName}_Report`;
    const summaryJson = JSON.stringify({ 
      docType, 
      summary: finalSummaryText, 
      forensicData: forensicSummary 
    });

    const archiveBucket = storage.bucket(process.env.ARCHIVE_BUCKET!);
    
    await Promise.all([
      archiveBucket.file(`${folderName}/${dsBaseName}.md`).save(fullMarkdownTranscript),
      archiveBucket.file(`${folderName}/${dsBaseName}.json`).save(summaryJson)
    ]);

    // 7. EMBED SUMMARY INTO PDF METADATA
    const [originalPdfBuffer] = await storage.bucket(process.env.INPUT_BUCKET!).file(docRecord.filename).download();
    
    // CRITICAL FIX: ignoreEncryption: true to handle protected PDFs
    const pdfDoc = await PDFDocument.load(originalPdfBuffer, { ignoreEncryption: true });
    
    pdfDoc.setTitle(`Forensic Analysis: ${finalBaseName}`);
    pdfDoc.setSubject(finalSummaryText.substring(0, 2000)); // Embed summary in metadata
    pdfDoc.setKeywords(['Forensics', docType, 'Legal Engine']);
    
    const pdfBytes = await pdfDoc.save();
    await archiveBucket.file(`${folderName}/${dsBaseName}.pdf`).save(pdfBytes);

    // 8. CLEANUP & FINALIZE
    // Move source file
    const originalExt = path.extname(docRecord.filename);
    await storage.bucket(process.env.INPUT_BUCKET!).file(docRecord.filename)
      .move(archiveBucket.file(`${folderName}/${finalBaseName}_source${originalExt}`));

    // Update DB
    await supabase.from('documents').update({ 
      status: 'archived_with_summary',
      gcs_archive_path: `${folderName}/${dsBaseName}.pdf`,
      summary_data: JSON.parse(summaryJson)
    }).eq('id', docId);

    console.log(`✅ Aggregation Complete: ${folderName}`);

  } catch (err: any) {
    console.error(`FATAL AGGREGATOR ERROR: ${err.message}`);
    process.exit(1);
  }
}

main();