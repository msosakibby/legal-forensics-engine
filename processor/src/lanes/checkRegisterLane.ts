import { LaneHandler, ProcessingContext, LaneResult } from '../types.js';
import { retryWithBackoff } from '../../../src/utils/common.js';

export class CheckRegisterHandler implements LaneHandler {
    async process(ctx: ProcessingContext): Promise<LaneResult> {
        const tableUsed = 'evidence_logs';

        // Check Registers rely on Vision OCR for handwriting
        const ocrText = await ctx.extractTextWithVision(ctx.fileBuffer);
        const markdown = `[OCR TRANSCRIPT]\n${ocrText}`;

        const prompt = ctx.promptConfig.prompts.check_register.template.replace('{{OCR_TEXT}}', ocrText);
        console.log("   Reconstructing Handwritten Ledger...");

        const res = await retryWithBackoff(() => ctx.reasoningModel.generateContent({
            contents: [{ role: 'user', parts: [ctx.pdfPart, { text: prompt }] }]
        }));

        const extractedData = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");

        await ctx.supabase.from(tableUsed).insert({
            doc_id: ctx.docId,
            log_type: 'check_register_reconstruction',
            entities: extractedData.transactions,
            content: `Entity: ${extractedData.register_summary?.entity}`
        });

        return {
            extractedData,
            markdown,
            tableUsed,
            elementsCaptured: ["Handwritten Ledger", "OCR Text"]
        };
    }
}