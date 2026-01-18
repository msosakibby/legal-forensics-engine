import { Storage } from '@google-cloud/storage';
import { createClient } from '@supabase/supabase-js';
import { VertexAI } from '@google-cloud/vertexai';
import { PDFDocument } from 'pdf-lib';
import path from 'path';

// --- INITIALIZE CLIENTS ---
const storage = new Storage();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
const vertexAI = new VertexAI({ 
  project: process.env.GOOGLE_CLOUD_PROJECT!,
  location: process.env.REGION!
});

/**
 * Helper to retry async functions with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    console.warn(`API call failed. Retrying in ${delay}ms... (${retries} attempts left). Error: ${(error as Error).message}`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}

/**
 * Generates a summary for the entire document, saves it, and embeds it in a new PDF.
 */
async function generateAndSaveSummary(
  prompt: string | null,
  content: string,
  baseName: string,
  bucketName: string,
  originalPdfBuffer: Buffer,
  preComputedSummary?: string
) {
  console.log(`Generating document summary for ${baseName}...`);
  
  let summaryText = preComputedSummary || "";

  if (!summaryText && prompt) {
      // Note: Ensure 'gemini-1.5-pro' is an available and enabled model in your GCP project to prevent runtime errors.
      const proModel = vertexAI.getGenerativeModel({ model: 'gemini-3-pro-preview' });
      const summaryRes = await retryWithBackoff(() => proModel.generateContent(prompt + '\n\n' + content));
      summaryText = summaryRes.response.candidates?.[0]?.content?.parts?.[0]?.text || "Summary could not be generated.";
  }

  const dsBaseName = `${baseName}_DS`; // DS for "Document Summary"
  const folderName = baseName;
  const summaryJson = JSON.stringify({ summary: summaryText });

  // Save summary MD, Full Transcript MD, and JSON to Archive Bucket
  await Promise.all([
    storage.bucket(bucketName).file(`${folderName}/${dsBaseName}_Summary.md`).save(summaryText),
    storage.bucket(bucketName).file(`${folderName}/${dsBaseName}_FullTranscript.md`).save(content),
    storage.bucket(bucketName).file(`${folderName}/${dsBaseName}_Summary.json`).save(summaryJson),
  ]);

  // Create a new PDF with the summary and transcript embedded in its metadata
  try {
    const pdfDoc = await PDFDocument.load(originalPdfBuffer);
    
    // Embed data in PDF Metadata (Subject field is used for large text content)
    const metadataContent = `SUMMARY:\n${summaryText}\n\n---\n\nMETADATA JSON:\n${summaryJson}\n\n---\n\nFULL TRANSCRIPT:\n${content}`;
    
    pdfDoc.setTitle(`Forensic Summary: ${baseName}`);
    pdfDoc.setSubject(metadataContent);
    pdfDoc.setKeywords(['Forensics', 'AI', 'Summary', 'Legal']);
    pdfDoc.setProducer('Legal Forensics Engine');
    pdfDoc.setCreator('Gemini 3 Pro (preview)');
    pdfDoc.setCreationDate(new Date());
    pdfDoc.setModificationDate(new Date());

    const pdfBytes = await pdfDoc.save();
    await storage.bucket(bucketName).file(`${folderName}/${dsBaseName}.pdf`).save(pdfBytes);
    console.log(`Successfully saved summary assets to folder: ${folderName}`);
  } catch (e) {
    console.error(`Error updating PDF metadata for ${dsBaseName}:`, e);
  }
}

async function main() {
  console.log('Starting Aggregator Job (with Summarization)...');

  const docId = process.env.DOC_ID;
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
      .select('gcs_markdown_path, extracted_data, page_index')
      .eq('doc_id', docId)
      .order('page_index', { ascending: true });

    if (!pages || pages.length === 0) throw new Error('No processed pages found.');

    console.log(`Aggregating ${pages.length} pages for ${docRecord.filename}...`);

    let finalBaseName = path.parse(docRecord.filename).name;
    
    // --- SMART RENAMING LOGIC ---
    const firstPage = pages.find((p: any) => p.page_index == 0);
    
    if (firstPage?.extracted_data) {
      let data = firstPage.extracted_data;
      // Ensure data is an object if Supabase returns it as a string
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) { console.warn("Failed to parse extracted_data JSON"); }
      }

      const docType = data?._meta_doc_type || docRecord.doc_type;

      // NEW: Case-insensitive getter for resilience against LLM output variations.
      const getVal = (obj: any, ...keys: string[]): any => {
        if (!obj) return undefined;
        for (const key of keys) {
            const realKey = Object.keys(obj).find(k => k.toLowerCase().trim() === key.toLowerCase());
            if (realKey && obj[realKey]) {
                return obj[realKey];
            }
        }
        return undefined;
      };

      // Helper to sanitize strings for filenames
      const sanitize = (s: any) => {
        if (!s) return 'Unknown';
        return String(s).trim().replace(/[\\/:"*?<>|]/g, '').replace(/\s+/g, ' ');
      };

      // Helper to format dates to YYYY-MM-DD
      const formatDate = (d: any) => {
        if (!d) return '0000-00-00';
        const s = String(d).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const date = new Date(s);
        if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
        }
        return sanitize(s);
      };

      let dateStr = '0000-00-00';
      let typeStr = 'Document';
      let sourceStr = 'Source';
      let personStr = 'Person';
      let customBaseName = "";

      console.log(`Attempting smart rename for docType: "${docType}"`);

      if (docType === 'Financial Planner Letters' || docType === 'Financial Planner Letter') {
          dateStr = formatDate(getVal(data, "Letter Date"));
          const org = sanitize(getVal(data, "Organization", "Addressor Name"));
          const subject = sanitize(getVal(data, "Subject"));
          const recipient = sanitize(getVal(data, "Recipients", "Addressee Name"));
          
          // Format: Date - Organization - Subject - Recipients
          customBaseName = `${dateStr} - ${org} - ${subject} - ${recipient}`;
      } else if (docType === 'Tax Returns & Forms (Federal/State)') {
          dateStr = formatDate(getVal(data, "Tax Year"));
          typeStr = sanitize(getVal(data, "Form Number") || "Tax Form");
          sourceStr = sanitize(getVal(data, "Jurisdiction"));
          personStr = sanitize(getVal(data, "Entity Name"));
      } else if (docType === 'Invoices, Bills, & Receipts') {
          dateStr = formatDate(getVal(data, "Transaction Date"));
          typeStr = "Receipt";
          sourceStr = sanitize(getVal(data, "Vendor Name"));
          personStr = sanitize(getVal(data, "Operator/Cashier") || "Unknown");
      } else if (docType === 'Bank Statements & Credit Card Statements') {
          let d = getVal(data, "Statement Period");
          if (d && typeof d === 'string' && d.includes(' to ')) d = d.split(' to ')[1];
          dateStr = formatDate(d);
          typeStr = "Statement";
          sourceStr = sanitize(getVal(data, "Financial Institution"));
          personStr = sanitize(getVal(data, "Account Number (Masked)"));
      } else if (docType === 'Check Registers & Ledgers') {
          // This logic is more stable as the prompt is hardcoded.
          const summary = data.register_summary || {};
          let d = summary.period;
          if (d && typeof d === 'string' && d.includes(' - ')) d = d.split(' - ')[0];
          dateStr = formatDate(d);
          typeStr = "Check Register";
          sourceStr = sanitize(summary.entity_name);
          personStr = sanitize(summary.account_holder || "Account Holder");
      } else {
          // Improved Fallback
          console.log("Using fallback renaming logic.");
          dateStr = formatDate(getVal(data, "Transaction Date", "Statement Period", "Letter Date", "Tax Year"));
          typeStr = sanitize(docType || "Document");
          sourceStr = sanitize(getVal(data, "Vendor Name", "Vendor/Merchant Name", "Financial Institution", "Addressor Name", "Entity Name"));
          personStr = sanitize(getVal(data, "Addressee Name", "Operator/Cashier"));
      }
      
      finalBaseName = customBaseName || `${dateStr} - ${typeStr} - ${sourceStr} - ${personStr}`;
      console.log(`Smart Renaming Applied: ${finalBaseName}`);
    }

    const folderName = finalBaseName;

    // 1. GATHER ALL MARKDOWN CONTENT
    let fullMarkdownTranscript = `# Forensics Report: ${finalBaseName}\n\n`;
    for (const page of pages) {
        if (page.gcs_markdown_path) {
            const [mdBuffer] = await storage.bucket(process.env.PROCESSING_BUCKET!).file(page.gcs_markdown_path).download();
            fullMarkdownTranscript += `## Page ${pages.indexOf(page) + 1}\n${mdBuffer.toString()}\n\n---\n\n`;
        }
    }
    
    // 2. DOWNLOAD ORIGINAL PDF (Needed for summarization output and final archive)
    const [originalPdfBuffer] = await storage.bucket(process.env.INPUT_BUCKET!).file(docRecord.filename).download();

    // 3. **NEW**: ROUTE TO SUMMARIZATION LOGIC BASED ON DOC_TYPE
    // Prefer the doc type from the extracted data as it's the most fresh
    let docTypeForSummary = docRecord.doc_type;
    if (firstPage?.extracted_data) {
        let d = firstPage.extracted_data;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) {} }
        if (d && d._meta_doc_type) docTypeForSummary = d._meta_doc_type;
    }
    docTypeForSummary = docTypeForSummary || 'Unknown';
    console.log(`Generating summary for DocType: ${docTypeForSummary}`);

    // Check if we have rich analysis data from the processor to use instead of re-generating
    let preComputedSummary = "";
    if ((docTypeForSummary === 'Financial Planner Letters' || docTypeForSummary === 'Financial Planner Letter') && firstPage?.extracted_data) {
        let d = firstPage.extracted_data;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) {} }
        
        // Use the Forensic Analysis structure
        if (d && d["Forensic Analysis"]) {
            const ad = d["Forensic Analysis"];
            preComputedSummary = `### Forensic Analysis: Financial Planner Correspondence\n\n`;
            if (ad.Recommendations) preComputedSummary += `#### Recommendations & Actions\n${ad.Recommendations}\n\n`;
            if (ad["Portfolio Impact"]) preComputedSummary += `#### Portfolio Impact (Short & Long Term)\n${ad["Portfolio Impact"]}\n\n`;
            if (ad["Commingling Observations"]) preComputedSummary += `#### Commingling Observations\n${ad["Commingling Observations"]}\n\n`;
            if (ad["Trust Observations"]) preComputedSummary += `#### Trust Observations\n${ad["Trust Observations"]}\n\n`;
            if (ad["Spousal Benefit Analysis"]) preComputedSummary += `#### Spousal Benefit Analysis\n${ad["Spousal Benefit Analysis"]}\n\n`;
            
            console.log("Using pre-computed forensic analysis for summary.");
        }
    }

    let summaryPrompt = "";

    if (preComputedSummary) {
        // If we already have a good summary, we might just pass it through or skip generation.
        // However, generateAndSaveSummary expects to call the AI. 
        // Let's modify the flow to use this text directly if available.
        await generateAndSaveSummary(null, fullMarkdownTranscript, finalBaseName, process.env.ARCHIVE_BUCKET!, originalPdfBuffer, preComputedSummary);
    } else if (docTypeForSummary === 'Bank Statements & Credit Card Statements') {
        summaryPrompt = `You are a forensic analyst. Summarize the key inflows, outflows, and any anomalous transactions from this bank statement.`;
    } else if (docTypeForSummary === 'Check Registers & Ledgers') {
        summaryPrompt = `
You are a forensic accountant providing a final report on this check register.
Based on the reconstructed ledger provided, generate a "Forensic Summary & Key Observations" report.

Structure your response exactly as follows:
### Forensic Summary & Key Observations
**Entity:** [Entity Name from Ledger]
**Period:** [Date Range from Ledger]

#### 1. Entity Function & Operational Pattern
#### 2. Private Lending Ledger
#### 3. Family Support & Expenses
#### 4. Real Estate & Asset Maintenance`;
    } else if (docTypeForSummary === 'Financial Planner Letters' || docTypeForSummary === 'Financial Planner Letter') {
        summaryPrompt = `You are a forensic analyst reviewing correspondence. Summarize the key financial themes, assets mentioned, and any specific advice or requests made in this letter.`;
    } else if (docTypeForSummary === 'Tax Returns & Forms (Federal/State)') {
        summaryPrompt = `You are a forensic accountant. Summarize the key tax figures, including total income, tax liability, and any significant deductions or depreciation schedules found in this return.`;
    } else if (docTypeForSummary === 'Invoices, Bills, & Receipts') {
        summaryPrompt = `You are a forensic analyst. Summarize this transaction, noting the vendor, total amount, payment method, and any specific line items of interest.`;
    }

    // Generate artifacts for ALL lanes
    await generateAndSaveSummary(summaryPrompt, fullMarkdownTranscript, finalBaseName, process.env.ARCHIVE_BUCKET!, originalPdfBuffer);

    // 4. MOVE ORIGINAL FILE TO ARCHIVE
    const sourceFile = storage.bucket(process.env.INPUT_BUCKET!).file(docRecord.filename);
    const originalExt = path.extname(docRecord.filename);
    const destinationFile = storage.bucket(process.env.ARCHIVE_BUCKET!).file(`${folderName}/${finalBaseName}_source${originalExt}`);
    await sourceFile.move(destinationFile);
    console.log(`Successfully moved original file to ${destinationFile.name}`);

    // 5. CLEAN UP PROCESSING BUCKET
    console.log(`Cleaning up processing files for docId: ${docId}`);
    const [processingFiles] = await storage.bucket(process.env.PROCESSING_BUCKET!).getFiles({ prefix: `${docId}/` });
    const deletePromises = processingFiles.map(file => file.delete());
    await Promise.all(deletePromises);
    console.log(`Deleted ${processingFiles.length} processing files.`);
    
    // 6. FINALIZE DATABASE RECORD
    await supabase
      .from('documents')
      .update({ 
        status: 'archived_with_summary',
        gcs_archive_path: destinationFile.name,
        // You could also add the summary text itself to the record here
        // summary: summaryText 
      })
      .eq('id', docId);

    console.log(`Successfully archived and summarized: ${folderName}`);

  } catch (err) {
    const error = err as Error;
    console.error(`Fatal Error in Aggregator: ${error.message}`, error.stack);
    process.exit(1);
  }
}

main();