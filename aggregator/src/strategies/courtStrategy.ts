import { SummaryStrategy } from '../types.js';

export class CourtSummaryStrategy implements SummaryStrategy {
    buildHighlights(pages: any[]): string {
        let highlights = "";
        let courts = new Set<string>();
        let caseNumbers = new Set<string>();
        let rulings = new Set<string>();
        let judgmentAmounts: string[] = [];
        let obligations: string[] = [];

        pages.forEach(p => {
            const d = p.extracted_data || {};
            if (d["Court Name"]) courts.add(d["Court Name"]);
            if (d["Case Number"]) caseNumbers.add(d["Case Number"]);
            if (d["Ruling"]) rulings.add(d["Ruling"]);
            if (d["Judgment Amount"]) judgmentAmounts.push(d["Judgment Amount"]);
            if (d["Financial Obligations"]) obligations.push(d["Financial Obligations"]);
        });

        highlights += `## ⚖️ Court Judgment Summary\n`;
        if (courts.size > 0) highlights += `- **Court:** ${Array.from(courts).join(', ')}\n`;
        if (caseNumbers.size > 0) highlights += `- **Case #:** ${Array.from(caseNumbers).join(', ')}\n`;
        if (rulings.size > 0) highlights += `- **Ruling:** ${Array.from(rulings).join(', ')}\n`;

        if (judgmentAmounts.length > 0) {
            highlights += `- **Judgment Amount:** ${judgmentAmounts.join(', ')}\n`;
        }

        if (obligations.length > 0) {
            highlights += `### Financial Obligations\n`;
            obligations.forEach(obs => highlights += `- ${obs}\n`);
        }

        return highlights;
    }
}