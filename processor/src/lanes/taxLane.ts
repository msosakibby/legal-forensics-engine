import { LaneHandler, ProcessingContext, LaneResult } from '../types.js';
import { retryWithBackoff } from '../../../src/utils/common.js';

export class TaxReturnHandler implements LaneHandler {
    async process(ctx: ProcessingContext): Promise<LaneResult> {
        const tableUsed = 'tax_documents';
        const markdown = await ctx.generateMarkdown(ctx.tempPath);

        const prompt = ctx.promptConfig.prompts.tax_return.template;
        console.log("   Extracting Tax Data...");

        const res = await retryWithBackoff(() => ctx.reasoningModel.generateContent({
            contents: [{ role: 'user', parts: [ctx.pdfPart, { text: prompt }] }]
        }));

        const extractedData = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");

        await ctx.supabase.from(tableUsed).insert({
            doc_id: ctx.docId,
            tax_year: extractedData["Tax Year"],
            form_number: extractedData["Form"],
            entity_name: extractedData["Entity"],
            total_income: extractedData["Total Income"],
            tax_liability: extractedData["Tax Liability"],
            depreciation_schedule: extractedData["Depreciation"]
        });

        return {
            extractedData,
            markdown,
            tableUsed,
            elementsCaptured: ["Tax Year", "Form", "Entity", "Total Income", "Tax Liability", "Depreciation"]
        };
    }
}