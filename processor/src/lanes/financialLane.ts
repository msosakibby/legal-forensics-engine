import { LaneHandler, ProcessingContext, LaneResult } from '../types.js';
import { retryWithBackoff } from '../../../src/utils/common.js';
import { SupabaseClient } from '@supabase/supabase-js';

export class FinancialLaneHandler implements LaneHandler {
    async process(ctx: ProcessingContext): Promise<LaneResult> {
        const tableUsed = 'financial_correspondence';
        const markdown = await ctx.generateMarkdown(ctx.tempPath);

        // Fetch Prenup Context specifically for this lane
        const rules = await this.getPrenupContext(ctx.supabase);
        console.log("   Cross-referencing against Prenup Rules...");

        const prompt = ctx.promptConfig.prompts.financial_planner.template.replace('{{PRENUP_CONTEXT}}', rules);

        const res = await retryWithBackoff(() => ctx.reasoningModel.generateContent({
            contents: [{ role: 'user', parts: [ctx.pdfPart, { text: prompt }] }]
        }));

        const extractedData = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");

        await ctx.supabase.from(tableUsed).insert({
            doc_id: ctx.docId,
            letter_date: extractedData["Letter Date"],
            addressor_name: extractedData["Organization"],
            addressee_name: extractedData["Recipients"],
            subject: extractedData["Subject"],
            analysis_data: extractedData["Forensic Analysis"]
        });

        return {
            extractedData,
            markdown,
            tableUsed,
            elementsCaptured: ["Letter Date", "Organization", "Recipients", "Subject", "Forensic Analysis"]
        };
    }

    private async getPrenupContext(supabase: SupabaseClient): Promise<string> {
        console.log("   -> Fetching Legal Context (Prenup)...");
        const { data } = await supabase.from('legal_documents')
            .select('restrictions, financial_obligations')
            .eq('document_type', 'Prenuptial Agreement')
            .order('created_at', { ascending: false })
            .limit(1);

        if (!data || data.length === 0) {
            console.log("      No active prenup found.");
            return "NO ACTIVE RESTRICTIONS FOUND.";
        }
        return JSON.stringify(data[0]);
    }
}