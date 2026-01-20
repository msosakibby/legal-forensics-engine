import { SummaryStrategy } from '../types.js';

export class TaxSummaryStrategy implements SummaryStrategy {
    buildHighlights(pages: any[]): string {
        let highlights = "";
        let taxYears = new Set<string>();
        let entities = new Set<string>();
        let totalIncome = 0;
        let totalTax = 0;

        pages.forEach(p => {
            const d = p.extracted_data;
            if (d?.["Tax Year"]) taxYears.add(d["Tax Year"]);
            if (d?.["Entity"]) entities.add(d["Entity"]);

            // Capture the first non-zero values found (assuming summary is on page 1)
            if (d?.["Total Income"] && totalIncome === 0) {
                totalIncome = parseFloat(String(d["Total Income"]).replace(/[^0-9.-]+/g, "")) || 0;
            }
            if (d?.["Tax Liability"] && totalTax === 0) {
                totalTax = parseFloat(String(d["Tax Liability"]).replace(/[^0-9.-]+/g, "")) || 0;
            }
        });

        highlights += `## 🏛️ Tax Return Summary\n`;
        if (entities.size > 0) highlights += `- **Entity:** ${Array.from(entities).join(', ')}\n`;
        if (taxYears.size > 0) highlights += `- **Tax Year:** ${Array.from(taxYears).join(', ')}\n`;
        highlights += `- **Total Income:** $${totalIncome.toLocaleString()}\n`;
        highlights += `- **Tax Liability:** $${totalTax.toLocaleString()}\n\n`;

        return highlights;
    }
}