import { createClient } from '@supabase/supabase-js';
import { VertexAI } from '@google-cloud/vertexai';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

// --- LOAD .ENV (Robust Loader) ---
const envPath = path.resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  console.log(`Loading environment from ${envPath}`);
  const envConfig = readFileSync(envPath, 'utf-8');
  envConfig.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const firstEq = trimmed.indexOf('=');
    if (firstEq === -1) return;
    const key = trimmed.substring(0, firstEq).trim();
    let value = trimmed.substring(firstEq + 1).trim();
    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && value && !process.env[key]) {
      process.env[key] = value;
    }
  });
} else {
  console.warn("⚠️ No .env file found in project root.");
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
const vertexAI = new VertexAI({ project: process.env.GOOGLE_CLOUD_PROJECT!, location: process.env.REGION! });

async function runTest() {
  const docId = process.argv[2];
  if (!docId) {
    console.error("Usage: npm run test:aggregator -- <DOC_ID>");
    process.exit(1);
  }

  console.log(`\n🧪 TESTING AGGREGATOR FOR DOC ID: ${docId}`);

  // 1. FETCH DATA
  const { data: docRecord } = await supabase.from('documents').select('*').eq('id', docId).single();
  const { data: pages } = await supabase.from('pages').select('extracted_data, page_index').eq('doc_id', docId).order('page_index');

  if (!docRecord || !pages || pages.length === 0) {
    console.error("❌ Document or Pages not found (or pages list is empty).");
    return;
  }

  const firstPage = pages.find((p: any) => p.page_index == 0);
  let data = firstPage?.extracted_data;
  if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) {}
  }
  
  const docType = data?._meta_doc_type || docRecord.doc_type;

  console.log(`\n📂 DocType: ${docType}`);
  const dataLog = data ? JSON.stringify(data, null, 2) : "No data found";
  console.log(`📄 Extracted Data (Page 0 Sample):`, dataLog.substring(0, 500) + "...");

  // 2. TEST RENAMING LOGIC
  const getVal = (obj: any, ...keys: string[]): any => {
    if (!obj) return undefined;
    for (const key of keys) {
        const realKey = Object.keys(obj).find(k => k.toLowerCase().trim() === key.toLowerCase());
        if (realKey && obj[realKey]) return obj[realKey];
    }
    return undefined;
  };

  const sanitize = (s: any) => {
    if (!s) return 'Unknown';
    return String(s).trim().replace(/[\\/:"*?<>|]/g, '').replace(/\s+/g, ' ');
  };

  const formatDate = (d: any) => {
    if (!d) return '0000-00-00';
    const s = String(d).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const date = new Date(s);
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
    return sanitize(s);
  };

  let dateStr = '0000-00-00';
  let typeStr = 'Document';
  let sourceStr = 'Source';
  let personStr = 'Person';
  let customBaseName = "";

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
      const summary = data.register_summary || {};
      let d = summary.period;
      if (d && typeof d === 'string' && d.includes(' - ')) d = d.split(' - ')[0];
      dateStr = formatDate(d);
      typeStr = "Check Register";
      sourceStr = sanitize(summary.entity_name);
      personStr = sanitize(summary.account_holder || "Account Holder");
  } else {
      // Fallback
      dateStr = formatDate(getVal(data, "Transaction Date", "Statement Period", "Letter Date", "Tax Year"));
      typeStr = sanitize(docType || "Document");
      sourceStr = sanitize(getVal(data, "Vendor Name", "Vendor/Merchant Name", "Financial Institution", "Addressor Name", "Entity Name"));
      personStr = sanitize(getVal(data, "Addressee Name", "Operator/Cashier"));
  }
  
  const finalBaseName = customBaseName || `${dateStr} - ${typeStr} - ${sourceStr} - ${personStr}`;
  console.log(`\n🏷️  CALCULATED FILENAME: "${finalBaseName}"`);

  // 3. TEST SUMMARIZATION
  console.log(`\n📝 GENERATING SUMMARY...`);
  
  let preComputedSummary = "";
  // Check for pre-computed analysis in extracted_data
  const forensicAnalysis = getVal(data, "Forensic Analysis", "ForensicAnalysis", "forensic_analysis");

  if ((docType === 'Financial Planner Letters' || docType === 'Financial Planner Letter') && forensicAnalysis) {
      const ad = forensicAnalysis;
      preComputedSummary = `### Forensic Analysis: Financial Planner Correspondence\n\n`;
      if (ad.Recommendations) preComputedSummary += `#### Recommendations & Actions\n${ad.Recommendations}\n\n`;
      if (ad["Portfolio Impact"]) preComputedSummary += `#### Portfolio Impact (Short & Long Term)\n${ad["Portfolio Impact"]}\n\n`;
      if (ad["Commingling Observations"]) preComputedSummary += `#### Commingling Observations\n${ad["Commingling Observations"]}\n\n`;
      if (ad["Trust Observations"]) preComputedSummary += `#### Trust Observations\n${ad["Trust Observations"]}\n\n`;
      if (ad["Spousal Benefit Analysis"]) preComputedSummary += `#### Spousal Benefit Analysis\n${ad["Spousal Benefit Analysis"]}\n\n`;
      
      console.log("✅ FOUND PRE-COMPUTED FORENSIC ANALYSIS. Skipping second generation.");
  }

  let summaryPrompt = "";
  if (!preComputedSummary) {
      summaryPrompt = `You are a forensic analyst. Provide a concise summary of this document's content and key information.`;

      if (docType === 'Financial Planner Letters') {
          // Fallback if analysis_data is missing
          summaryPrompt = `You are a forensic analyst reviewing correspondence. Summarize the key financial themes, assets mentioned, and any specific advice or requests made in this letter. Do not assume when accounts are refered to jointly are joint assets. There were no joint accounts. It is similar to the use of a collective "we" in conversation`;
      } else if (docType === 'Check Registers & Ledgers') {
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
      }
  }

  let summaryText = preComputedSummary;
  if (!summaryText && summaryPrompt) {
      console.log(`(Gemini 1.5 Pro Generation Triggered)`);
      const content = JSON.stringify(data, null, 2); 
      const proModel = vertexAI.getGenerativeModel({ model: 'gemini-3-pro-preview' });
      const summaryRes = await proModel.generateContent(summaryPrompt + '\n\n' + content);
      summaryText = summaryRes.response.candidates?.[0]?.content?.parts?.[0]?.text || "Summary could not be generated.";
  }

  console.log(`\n📋 GENERATED SUMMARY:\n${summaryText}`);
}

runTest().catch(console.error);