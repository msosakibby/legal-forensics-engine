const fs = require('fs');

// =================================================================
// MASTER DATA STRUCTURE
// Includes: Invoices, Bank Statements, Check Images, Expense Logs,
// AND NEW: Checkbook Registers
// =================================================================
const documentData = [
  // 1. GENERAL INVOICES
  {
    category: "General Transactional",
    subCategory: "Invoices, Bills, & Receipts",
    description: "Common fields for B2B invoices, utility bills, and Point-of-Sale receipts.",
    fields: [
      { name: "Vendor/Merchant Name", type: "String", desc: "The entity issuing the document.", context: "Header Logo / Top Left text" },
      { name: "Document Type", type: "Enum", desc: "Invoice, Credit Memo, Receipt, Quote.", context: "Explicit in header" },
      { name: "Document ID", type: "String", desc: "Invoice Number, Receipt ID, or Order #.", context: "Key-Value Pair" },
      { name: "Transaction Date", type: "Date", desc: "Date service was rendered or purchase made.", context: "Header / Top Right" },
      { name: "Grand Total", type: "Currency", desc: "Final amount to be paid.", context: "Bottom Summary Block (Bolded)" },
      { name: "Line Item Description", type: "String", desc: "Name of product or service.", context: "Table rows (Repeated)" }
    ]
  },
  // 2. BANK STATEMENTS
  {
    category: "Banking & Credit",
    subCategory: "Bank Statements",
    description: "Focuses on running balances and statement periods.",
    fields: [
      { name: "Financial Institution", type: "String", desc: "Bank or Credit Card Issuer Name.", context: "Header Logo" },
      { name: "Account Number", type: "String", desc: "Last 4 digits of the account.", context: "Header / Top Right" },
      { name: "Statement Period", type: "Date Range", desc: "Start Date to End Date.", context: "Header info block" },
      { name: "Closing Balance", type: "Currency", desc: "Money available at end of period.", context: "Summary Box" }
    ]
  },
  // 3. CHECK IMAGES (FORENSIC)
  {
    category: "Forensic Analysis",
    subCategory: "Bank Statement Check Images (Composite)",
    description: "Complex extraction linking scanned check images to statement line-item text for validation.",
    fields: [
      { name: "Statement Verification Line", type: "String", desc: "The printed text immediately below the check image.", context: "Page Layout / Anchor" },
      { name: "Payor Block", type: "Object", desc: "Name, Address, Phone of account holder.", context: "Check Image: Top Left" },
      { name: "Date Written", type: "Date", desc: "Handwritten date.", context: "Check Image: Top Right" },
      { name: "Check # (Image)", type: "Integer", desc: "Printed sequence number on the check paper.", context: "Check Image: Top Right" },
      { name: "Payee Name", type: "String", desc: "Handwritten or Typed name of recipient.", context: "Check Image: Center Left" },
      { name: "Courtesy Amount", type: "Currency", desc: "Numeric amount in the box.", context: "Check Image: Center Right" },
      { name: "Legal Amount", type: "String", desc: "Amount written in words.", context: "Check Image: Center Bottom" },
      { name: "MICR Line", type: "String", desc: "Machine-readable E-13B font characters.", context: "Check Image: Bottom Edge" }
    ]
  },
  // 4. HANDWRITTEN LOGS (JUDY/KEITH)
  {
    category: "Personal Finance Logs",
    subCategory: "Handwritten Monthly Expense Logs (Judy/Keith Format)",
    description: "Unstructured lined paper logs with specific forensic behaviors (dittos, margin notes, ink changes).",
    fields: [
      { name: "Entity Name", type: "String", desc: "Top header name (e.g., 'Judy' or 'Keith').", context: "Page Header" },
      { name: "Reporting Period", type: "Date", desc: "Month and Year of the log.", context: "Page Header" },
      { name: "Payee (Main)", type: "String", desc: "Primary recipient or description.", context: "Column 1" },
      { name: "Payee Modifier (Margin)", type: "String", desc: "Text written in the left margin acting as a prefix.", context: "Left Margin" },
      { name: "Payment Method", type: "String", desc: "Auto Pay, Cash, or Check #.", context: "Column 2" },
      { name: "Amount", type: "Currency", desc: "Transaction value.", context: "Column 5" },
      { name: "Ditto Resolution", type: "Boolean", desc: "Indicates if value was derived from (\") marks above.", context: "Vertical Pattern Recognition" }
    ]
  },
  // =================================================================
  // 5. NEW: CHECKBOOK REGISTERS (HIGH PRECISION)
  // =================================================================
  {
    category: "Financial Registers",
    subCategory: "Handwritten Checkbook Transaction Register",
    description: "Strict grid-based extraction. Critical focus on multi-line descriptions (Payee vs Memo), code identification, and running balance logic.",
    fields: [
      { name: "Page Year", type: "Integer", desc: "The year context for the page (often found in header or top row).", context: "Header/Context" },
      { name: "Row Sequence", type: "Integer", desc: "Visual line number (1-indexed) to maintain strict order.", context: "Layout" },
      
      // Column 1: Number or Code
      { name: "Transaction Code", type: "String", desc: "Raw code: 'EFT', 'Dep', 'ATM', or Check Number (e.g., '1014').", context: "Col 1: Number/Code" },
      
      // Column 2: Date
      { name: "Date (Raw)", type: "String", desc: "Date exactly as written (e.g., '1/4', '2/1').", context: "Col 2: Date" },
      { name: "Date (Normalized)", type: "Date", desc: "MM/DD/YYYY inferred from Page Year context.", context: "Computed" },
      
      // Column 3: Description (Complex)
      { name: "Payee / Description (Line 1)", type: "String", desc: "Primary text on the top half of the row (e.g., 'Spartan Lease').", context: "Col 3: Top Line" },
      { name: "Memo / Notes (Line 2)", type: "String", desc: "Secondary text on bottom half (e.g., 'Jan 2016', 'Acct# 123').", context: "Col 3: Bottom Line" },
      
      // Columns 4-7: Financials
      { name: "Payment / Debit (-)", type: "Currency", desc: "Amount of withdrawal or payment.", context: "Col 4: Payment" },
      { name: "Reconciled Flag", type: "Boolean", desc: "True if a checkmark (✓) or 'x' appears.", context: "Col 5: Checkbox" },
      { name: "Fee Amount", type: "Currency", desc: "Bank fees or service charges.", context: "Col 6: Fee" },
      { name: "Deposit / Credit (+)", type: "Currency", desc: "Amount of deposit or interest.", context: "Col 7: Deposit" },
      
      // Column 8: Balance
      { name: "Running Balance", type: "Currency", desc: "The user-calculated balance on the right.", context: "Col 8: Balance" },
      
      // Forensic Data
      { name: "Correction Indicator", type: "String", desc: "Notes on crossed-out numbers or scribbles.", context: "Visual Analysis" },
      { name: "Balance Forward Row", type: "Boolean", desc: "True if this is the top row carrying over from previous page.", context: "Top Row Logic" }
    ]
  }
];

// 2. MARKDOWN GENERATOR FUNCTION
// ------------------------------------------------------------------
function generateMarkdown(data) {
  let md = "# Document Metadata Extraction Fields\n\n";
  md += "This document outlines metadata schemas for various structured and unstructured financial documents.\n\n";

  data.forEach(cat => {
    md += `### ${cat.category}\n`;
    md += `**Sub-Category:** ${cat.subCategory}\n\n`;
    md += `> ${cat.description}\n\n`;
    
    // Table Header
    md += `| Field Name | Data Type | Description | Structure Context |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;

    // Table Rows
    cat.fields.forEach(field => {
      const safeDesc = field.desc.replace(/\|/g, '\\|'); 
      md += `| **${field.name}** | ${field.type} | ${safeDesc} | ${field.context} |\n`;
    });

    md += `\n***\n\n`;
  });

  return md;
}

// 3. EXECUTION: CREATE FILES
// ------------------------------------------------------------------
try {
  // Generate JSON File
  fs.writeFileSync('document_metadata.json', JSON.stringify(documentData, null, 2));
  console.log("✅ Successfully created 'document_metadata.json' (Updated with Checkbook Registers)");

  // Generate Markdown File
  const markdownContent = generateMarkdown(documentData);
  fs.writeFileSync('document_metadata.md', markdownContent);
  console.log("✅ Successfully created 'document_metadata.md' (Updated with Checkbook Registers)");

} catch (err) {
  console.error("Error writing files:", err);
}
