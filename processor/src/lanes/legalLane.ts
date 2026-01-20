import { LaneHandler, ProcessingContext, LaneResult } from '../types.js';
import { retryWithBackoff } from '../../../src/utils/common.js';

export class LegalLaneHandler implements LaneHandler {
    async process(ctx: ProcessingContext): Promise<LaneResult> {
        const tableUsed = 'legal_documents';
        const markdown = await ctx.generateMarkdown(ctx.tempPath);

        const prompt = ctx.promptConfig.prompts.legal_analysis.template;
        console.log("   Running Forensic Legal Analysis (Strategy Pattern)...");

        const res = await retryWithBackoff(() => ctx.reasoningModel.generateContent({
            contents: [{ role: 'user', parts: [ctx.pdfPart, { text: prompt }] }]
        }));

        const extractedData = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");

        await ctx.supabase.from(tableUsed).insert({
            doc_id: ctx.docId,
            document_type: extractedData["Document Type"],
            effective_date: extractedData["Effective Date"],
            parties: extractedData["Parties"],
            financial_obligations: extractedData["Obligations"],
            restrictions: extractedData["Restrictions"],
            risks: extractedData["Risks"],
            timeline: extractedData["Timeline"]
        });

        return {
            extractedData,
            markdown,
            tableUsed,
            elementsCaptured: ["Parties", "Effective Date", "Obligations", "Restrictions", "Risks", "Timeline"]
        };
    }
}