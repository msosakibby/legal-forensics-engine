import { LaneHandler, ProcessingContext, LaneResult } from '../types.js';
import { retryWithBackoff } from '../../../src/utils/common.js';

export class RealEstateLaneHandler implements LaneHandler {
    async process(ctx: ProcessingContext): Promise<LaneResult> {
        const tableUsed = 'real_estate_assets';
        const markdown = await ctx.generateMarkdown(ctx.tempPath);

        console.log("   Extracting Real Estate Data...");

        const PROMPT = `
You are a forensic analyst specializing in Real Estate. Analyze this document.

EXTRACT:
- Document Type: Deed, Mortgage, Lease, Title Policy, Appraisal, Closing Statement.
- Property: Full Address, Parcel ID / APN.
- Dates: Execution Date, Recording Date.
- Parties: Grantor/Seller/Landlord, Grantee/Buyer/Tenant, Lender.
- Financials: Purchase Price, Loan Amount, Monthly Rent, Appraised Value.

OUTPUT JSON:
{
  "Document Type": "string",
  "Property Address": "string",
  "Parcel ID": "string",
  "Execution Date": "YYYY-MM-DD",
  "Recording Date": "YYYY-MM-DD",
  "Parties": {
    "Grantor_Seller_Landlord": ["string"],
    "Grantee_Buyer_Tenant": ["string"],
    "Lender": "string"
  },
  "Financials": {
    "Purchase Price": "currency string",
    "Loan Amount": "currency string",
    "Monthly Rent": "currency string",
    "Appraised Value": "currency string"
  }
}`;

        const res = await retryWithBackoff(() => ctx.reasoningModel.generateContent({
            contents: [{ role: 'user', parts: [ctx.pdfPart, { text: PROMPT }] }]
        }));

        const extractedData = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");

        await ctx.supabase.from(tableUsed).insert({
            doc_id: ctx.docId,
            document_type: extractedData["Document Type"],
            property_address: extractedData["Property Address"],
            execution_date: extractedData["Execution Date"],
            parties: extractedData["Parties"],
            financials: extractedData["Financials"]
        });

        return {
            extractedData,
            markdown,
            tableUsed,
            elementsCaptured: ["Document Type", "Property Address", "Execution Date", "Parties", "Financials"]
        };
    }
}