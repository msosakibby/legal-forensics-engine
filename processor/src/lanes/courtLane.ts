import { LaneHandler, ProcessingContext, LaneResult } from '../types.js';
import { retryWithBackoff } from '../../../src/utils/common.js';

export class CourtLaneHandler implements LaneHandler {
    async process(ctx: ProcessingContext): Promise<LaneResult> {
        const tableUsed = 'legal_documents';
        const markdown = await ctx.generateMarkdown(ctx.tempPath);

        console.log("   Extracting Court Judgment Data...");

        const PROMPT = `
You are a forensic analyst. Analyze this Court Judgment / Decree.

EXTRACT:
- Court Details: Court Name, Jurisdiction, Case Number.
- Dates: Filing Date, Judgment Date.
- Parties: Plaintiff, Defendant, Attorneys.
- Judgment: Ruling (Granted/Denied), Judgment Amount, Terms, Ongoing Obligations (e.g. Alimony, Child Support).

OUTPUT JSON:
{
  "Court Name": "string",
  "Case Number": "string",
  "Judgment Date": "YYYY-MM-DD",
  "Plaintiff": "string",
  "Defendant": "string",
  "Ruling": "string",
  "Judgment Amount": "currency string",
  "Financial Obligations": "string",
  "Terms": "string"
}`;

        const res = await retryWithBackoff(() => ctx.reasoningModel.generateContent({
            contents: [{ role: 'user', parts: [ctx.pdfPart, { text: PROMPT }] }]
        }));

        const extractedData = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");

        await ctx.supabase.from(tableUsed).insert({
            doc_id: ctx.docId,
            document_type: "Court Judgment",
            effective_date: extractedData["Judgment Date"],
            parties: {
                Plaintiff: extractedData["Plaintiff"],
                Defendant: extractedData["Defendant"],
                Court: extractedData["Court Name"]
            },
            financial_obligations: {
                amount: extractedData["Judgment Amount"],
                details: extractedData["Financial Obligations"]
            },
            restrictions: extractedData["Terms"],
            risks: extractedData["Ruling"]
        });

        return {
            extractedData,
            markdown,
            tableUsed,
            elementsCaptured: ["Court Name", "Case Number", "Judgment Date", "Parties", "Judgment Amount"]
        };
    }
}