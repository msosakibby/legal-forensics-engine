import { LaneHandler, ProcessingContext, LaneResult } from '../types.js';
import { retryWithBackoff } from '../../../src/utils/common.js';
import { verifyMath } from '../../../src/utils/math.js';

export class CreditCardLaneHandler implements LaneHandler {
    async process(ctx: ProcessingContext): Promise<LaneResult> {
        const tableUsed = 'statement_lines';
        const markdown = await ctx.generateMarkdown(ctx.tempPath);

        const prompt = ctx.promptConfig.prompts.bank_statement_math.template;
        console.log("   Extracting Credit Card Ledger & Verifying Math...");

        const res = await retryWithBackoff(() => ctx.reasoningModel.generateContent({
            contents: [{ role: 'user', parts: [ctx.pdfPart, { text: prompt }] }]
        }));

        const extractedData = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");

        // Run Math Verification
        if (extractedData.statement_lines) {
            const failedIndices = verifyMath(extractedData.statement_lines);
            const failureCount = failedIndices.length;
            if (failureCount > 0) console.warn(`   ⚠️ MATH AUDIT FAILED on ${failureCount} rows.`);

            const pageIndex = process.env.PAGE_INDEX ? parseInt(process.env.PAGE_INDEX) : 0;

            const rows = extractedData.statement_lines.map((line: any, index: number) => ({
                doc_id: ctx.docId,
                page_number: pageIndex,
                account_number: extractedData["Account Number"],
                date: line.date,
                description: line.description,
                amount: line.amount,
                balance: line.balance,
                is_math_verified: !failedIndices.includes(index),
                source: 'credit_card'
            }));

            if (rows.length > 0) await ctx.supabase.from(tableUsed).insert(rows);
        }

        return {
            extractedData,
            markdown,
            tableUsed,
            elementsCaptured: ["Account Number", "Period", "Transactions (Math Verified)"]
        };
    }
}