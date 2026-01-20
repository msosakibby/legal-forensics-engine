import { LaneHandler, ProcessingContext, LaneResult } from '../types.js';
import { retryWithBackoff } from '../../../src/utils/common.js';

export class GenericLaneHandler implements LaneHandler {
    async process(ctx: ProcessingContext): Promise<LaneResult> {
        const tableUsed = 'documents (metadata only)';
        const markdown = await ctx.generateMarkdown(ctx.tempPath);

        console.log("   Running Generic Extraction...");

        // Use the generic receipt/document prompt
        const prompt = ctx.promptConfig.prompts.receipt_generic.template;

        const res = await retryWithBackoff(() => ctx.reasoningModel.generateContent({
            contents: [{ role: 'user', parts: [ctx.pdfPart, { text: prompt }] }]
        }));

        const extractedData = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");

        return {
            extractedData,
            markdown,
            tableUsed,
            elementsCaptured: ["Generic Extraction"]
        };
    }
}