// generatePrompts.js

const fs = require('fs');

// 1. THE DATA STRUCTURE
// ------------------------------------------------------------------
const documentData = [
  {
    category: "General Transactional",
    subCategory: "Invoices, Bills, & Receipts",
    description: "Common fields for B2B invoices, utility bills, and Point-of-Sale receipts.",
    fields: [
      { name: "Vendor/Merchant Name", type: "String", desc: "The entity issuing the document.", context: "Header Logo / Top Left text" },
      { name: "Document Type", type: "Enum", desc: "Invoice, Credit Memo, Receipt, Quote.", context: "Explicit in header" },
      { name: "Document ID", type: "String", desc: "Invoice Number, Receipt ID, or Order #.", context: "Key-Value Pair (e.g., 'Inv #: 102')" },
      { name: "PO Number", type: "String", desc: "Purchase Order reference number.", context: "Header / B2B reference block" },
      { name: "Transaction Date", type: "Date", desc: "Date service was rendered or purchase made.", context: "Header / Top Right" },
      { name: "Due Date", type: "Date", desc: "Date payment is required (Net 30/60/90).", context: "Specific to Invoices/Bills" },
      { name: "Subtotal", type: "Currency", desc: "$$ \\sum (\\text{Price} \\times \\text{Qty}) $$ before tax/fees.", context: "Bottom Summary Block" },
      { name: "Tax Amount", type: "Currency", desc: "Sales tax, VAT, or GST.", context: "Bottom Summary Block" },
      { name: "Grand Total", type: "Currency", desc: "Final amount to be paid.", context: "Bottom Summary Block (Bolded)" },
      { name: "Line Item Description", type: "String", desc: "Name of product or service.", context: "Table rows (Repeated)" },
      { name: "Payment Method", type: "String", desc: "Visa, Cash, ACH, Check ending in ****.", context: "Footer / Summary" }
    ]
  },
  {
    category: "Banking & Credit",
    subCategory: "Bank Statements & Credit Card Statements",
    description: "Focuses on running balances and statement periods.",
    fields: [
      { name: "Financial Institution", type: "String", desc: "Bank or Credit Card Issuer Name.", context: "Header Logo" },
      { name: "Account Number (Masked)", type: "String", desc: "Last 4 digits of the account.", context: "Header / Top Right" },
      { name: "Statement Period", type: "Date Range", desc: "Start Date to End Date.", context: "Header info block" },
      { name: "Opening Balance", type: "Currency", desc: "Money available at start of period.", context: "Summary Box" },
      { name: "Closing Balance", type: "Currency", desc: "Money available at end of period.", context: "Summary Box" },
      { name: "Total Deposits/Credits", type: "Currency", desc: "Sum of incoming funds.", context: "Summary Box" },
      { name: "Total Withdrawals/Debits", type: "Currency", desc: "Sum of outgoing funds.", context: "Summary Box" },
      { name: "APR / Interest Rate", type: "Percentage", desc: "Annual Percentage Rate charged.", context: "Footer / Fine Print" },
      { name: "Transaction Row Date", type: "Date", desc: "Date transaction occurred.", context: "Ledger Table Column" },
      { name: "Transaction Code", type: "String", desc: "ACH, POS, CHK, DEP codes.", context: "Ledger Table Column" }
    ]
  },
  {
    category: "Legal & Agreements",
    subCategory: "Contracts (NDA, MSA, Employment)",
    description: "Unstructured text extraction requiring NLP.",
    fields: [
      { name: "Agreement Type", type: "String", desc: "NDA, MSA, Lease, etc.", context: "Title / Header" },
      { name: "Effective Date", type: "Date", desc: "When the contract becomes active.", context: "First paragraph preamble" },
      { name: "Termination Date", type: "Date", desc: "When the contract expires.", context: "'Term' clause" },
      { name: "Party A (Discloser/Lessor)", type: "Entity", desc: "Name of the first entity.", context: "Preamble" },
      { name: "Party B (Recipient/Lessee)", type: "Entity", desc: "Name of the second entity.", context: "Preamble" },
      { name: "Jurisdiction", type: "Location", desc: "State/Country laws governing contract.", context: "'Governing Law' clause" },
      { name: "Contract Value", type: "Currency", desc: "Total monetary value of the deal.", context: "Consideration / Payment Terms" },
      { name: "Renewal Type", type: "Boolean/Enum", desc: "Auto-renew vs Manual renew.", context: "'Term and Termination' clause" },
      { name: "Signatories", type: "String", desc: "Names of individuals signing.", context: "Signature Block (Bottom)" }
    ]
  },
  {
    category: "Direct Store Delivery (DSD)",
    subCategory: "Vendor Invoices (Coke, Pepsi, Frito-Lay, Aunt Millies)",
    description: "Supply chain logistics fields for route accounting.",
    fields: [
      { name: "Route Number", type: "String", desc: "ID of the specific delivery truck route.", context: "Header (Critical for tracking)" },
      { name: "Store Number", type: "String", desc: "Vendor's internal ID for the store.", context: "Header" },
      { name: "Driver Name/ID", type: "String", desc: "Who physically delivered the goods.", context: "Header or Signature line" },
      { name: "Delivery Signature", type: "Image/Bool", desc: "Proof store manager signed for goods.", context: "Bottom (Handwritten)" },
      { name: "Case Count", type: "Integer", desc: "Number of physical boxes/crates delivered.", context: "Table Total" },
      { name: "Bottle Deposit (CRV)", type: "Currency", desc: "State-mandated deposit fees.", context: "Line item or Footer" },
      { name: "Credits/Returns", type: "Currency", desc: "Deduction for damaged/stale goods.", context: "Negative values in body/footer" },
      { name: "UPC/EAN", type: "Numeric", desc: "Barcode number (12/13 digits).", context: "Table Row (High precision)" },
      { name: "Promotion/Allowance", type: "Currency", desc: "Discounts applied at delivery.", context: "Line item adjustment" }
    ]
  },
  {
    category: "Personal Finance",
    subCategory: "Handwritten Check Registers",
    description: "Unstructured handwriting grids, often requiring HTR.",
    fields: [
      { name: "Check Number", type: "Integer", desc: "Sequential number (e.g., 101, 102).", context: "First Column (Anchor field)" },
      { name: "Entry Date", type: "Date", desc: "Date written (often incomplete e.g., '1/5').", context: "Second Column" },
      { name: "Transaction Description", type: "String", desc: "Payee name or notes.", context: "Wide middle column" },
      { name: "Payment Amount (-)", type: "Currency", desc: "Debit amount.", context: "Column right of description" },
      { name: "Deposit Amount (+)", type: "Currency", desc: "Credit amount.", context: "Column right of Payment" },
      { name: "Reconciled Flag", type: "Boolean", desc: "Checkmark for bank matching.", context: "Tiny column (tick mark)" },
      { name: "Running Balance", type: "Currency", desc: "User-calculated balance.", context: "Far right column" },
      { name: "Void Indicator", type: "Boolean", desc: "Strike-through or word 'VOID'.", context: "Visual overlay" }
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
      // Escape pipe characters in description if necessary
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
  console.log("✅ Successfully created 'document_metadata.json'");

  // Generate Markdown File
  const markdownContent = generateMarkdown(documentData);
  fs.writeFileSync('document_metadata.md', markdownContent);
  console.log("✅ Successfully created 'document_metadata.md'");

} catch (err) {
  console.error("Error writing files:", err);
}
