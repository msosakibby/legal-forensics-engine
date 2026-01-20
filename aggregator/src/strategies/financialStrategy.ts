import { SummaryStrategy } from '../types.js';

export class FinancialSummaryStrategy implements SummaryStrategy {
    buildHighlights(pages: any[]): string {
        let highlights = "";
        let allViolations: any[] = [];
        pages.forEach(p => {
            const d = p.extracted_data;
            if (d?.["Forensic Analysis"]?.Violations) {
                allViolations.push(...d["Forensic Analysis"].Violations);
            }
        });

        if (allViolations.length > 0) {
            highlights += `## 🚨 PRENUP COMPLIANCE ALERTS\n`;
            allViolations.forEach((v: any) => highlights += `- **Issue:** ${v.Violation}\n`);
            highlights += `\n`;
        }
        return highlights;
    }
}