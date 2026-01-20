import { LaneHandler, ProcessingContext, LaneResult } from '../types.js';
import { retryWithBackoff } from '../../../src/utils/common.js';

export class ReceiptLaneHandler implements LaneHandler {
    async process(ctx: ProcessingContext): Promise<LaneResult> {
        const tableUsed = 'receipts_log';
        const markdown = await ctx.generateMarkdown(ctx.tempPath);

        console.log("   Extracting Receipt Data...");

        const RECEIPT_PROMPT = `
You are a forensic analyst. Extract all details from this receipt/invoice.

EXTRACT:
- Vendor Details: Name, Address, Phone.
- Transaction Details: Date, Time, Store ID, Register ID, Cashier/Operator, Receipt ID.
- Financials: Net Total (Subtotal), Tax Total, Gross Total (Final).
- Tax Breakdown: Array of tax rates/amounts if present.
- Payment: Method (Card/Cash), Card Last 4, Auth Code.
- Line Items: Full list with Product Code, Description, Qty, Price.

OUTPUT JSON:
{
  "Vendor Name": "string",
  "Vendor Address": "string",
  "Vendor Phone": "string",
  "Transaction Date": "YYYY-MM-DD",
  "Store ID": "string",
  "Register ID": "string",
  "Operator/Cashier": "string",
  "Receipt ID": "string",
  "Net Receipt Total": "currency string",
  "Tax Receipt Total": "currency string",
  "Gross Receipt Total": "string",
  "Tax Breakdown": [{ "Locality": "string", "Rate": "string", "Amount": "string" }],
  "Payment Information": { "Method": "string", "Card Last 4": "string", "Auth Code": "string" },
  "Line Items": [
    { "Description": "string", "Product Code": "string", "Qty": "string", "Unit Price": "string", "Line Total": "string" }
  ]
}`;

        const res = await retryWithBackoff(() => ctx.reasoningModel.generateContent({
            contents: [{ role: 'user', parts: [ctx.pdfPart, { text: RECEIPT_PROMPT }] }]
        }));

        const extractedData = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");

        await ctx.supabase.from(tableUsed).insert({
            doc_id: ctx.docId,
            vendor_name: extractedData["Vendor Name"],
            transaction_date: extractedData["Transaction Date"],
            total_amount: extractedData["Gross Receipt Total"],
            tax_amount: extractedData["Tax Receipt Total"],
            category: "Receipt"
        });

        return {
            extractedData,
            markdown,
            tableUsed,
            elementsCaptured: ["Vendor Name", "Transaction Date", "Gross Receipt Total", "Tax Receipt Total", "Line Items"]
        };
    }
}