import { SummaryStrategy } from '../types.js';

export class CheckRegisterSummaryStrategy implements SummaryStrategy {
    buildHighlights(pages: any[]): string {
        let highlights = "";
        let entities = new Set<string>();
        let periods = new Set<string>();
        let transactionCount = 0;

        pages.forEach(p => {
            const d = p.extracted_data;
            if (d?.register_summary?.entity) entities.add(d.register_summary.entity);
            if (d?.register_summary?.period) periods.add(d.register_summary.period);
            if (Array.isArray(d?.transactions)) {
                transactionCount += d.transactions.length;
            }
        });

        highlights += `## 📓 Check Register Reconstruction\n`;
        if (entities.size > 0) highlights += `- **Entity:** ${Array.from(entities).join(', ')}\n`;
        if (periods.size > 0) highlights += `- **Period:** ${Array.from(periods).join(', ')}\n`;
        highlights += `- **Transactions Logged:** ${transactionCount}\n`;

        highlights += `\n> Note: This ledger was reconstructed from handwriting via Vision OCR + AI.\n\n`;

        return highlights;
    }
}