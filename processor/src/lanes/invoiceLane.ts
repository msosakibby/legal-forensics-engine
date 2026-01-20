import { LaneHandler, ProcessingContext, LaneResult } from '../types.js';
import { retryWithBackoff } from '../../../src/utils/common.js';

export class InvoiceLaneHandler implements LaneHandler {
    async process(ctx: ProcessingContext): Promise<LaneResult> {
        const tableUsed = 'receipts_log'; // Reusing table but with distinct category
        const markdown = await ctx.generateMarkdown(ctx.tempPath);

        console.log("   Extracting Invoice/Bill Data...");

        const INVOICE_PROMPT = `
You are a forensic analyst. Extract all details from this Invoice or Bill.

EXTRACT:
- Vendor/Biller Details: Name, Address, Phone, Email.
- Invoice Details: Invoice Number, Account Number, PO Number.
- Dates: Invoice Date, Due Date, Service Period.
- Financials: Subtotal, Tax, Fees, Total Amount Due.
- Line Items: Description, Quantity, Unit Price, Amount.

OUTPUT JSON:
{
  "Vendor Name": "string",
  "Vendor Address": "string",
  "Invoice Number": "string",
  "Account Number": "string",
  "PO Number": "string",
  "Invoice Date": "YYYY-MM-DD",
  "Due Date": "YYYY-MM-DD",
  "Total Amount Due": "currency string",
  "Tax Amount": "currency string",
  "Line Items": [
    { "Description": "string", "Qty": "string", "Unit Price": "string", "Line Total": "string" }
  ]
}`;

        const res = await retryWithBackoff(() => ctx.reasoningModel.generateContent({
            contents: [{ role: 'user', parts: [ctx.pdfPart, { text: INVOICE_PROMPT }] }]
        }));

        const extractedData = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");

        await ctx.supabase.from(tableUsed).insert({
            doc_id: ctx.docId,
            vendor_name: extractedData["Vendor Name"],
            transaction_date: extractedData["Invoice Date"],
            total_amount: extractedData["Total Amount Due"],
            tax_amount: extractedData["Tax Amount"],
            category: "Invoice/Bill"
        });

        return {
            extractedData,
            markdown,
            tableUsed,
            elementsCaptured: ["Vendor Name", "Invoice Number", "Invoice Date", "Total Amount Due", "Line Items"]
        };
    }
}