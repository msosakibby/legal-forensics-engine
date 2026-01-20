import { SummaryStrategy } from '../types.js';

export class LegalSummaryStrategy implements SummaryStrategy {
    buildHighlights(pages: any[]): string {
        let highlights = "";
        let allRisks: any[] = [];
        let timelineEvents: any[] = [];

        pages.forEach(p => {
            const d = p.extracted_data;
            if (d?.Risks) allRisks.push(...d.Risks);
            if (d?.Timeline) timelineEvents.push(...d.Timeline);
        });

        if (allRisks.length > 0) {
            highlights += `## ⚠️ Legal Risk Assessment\n`;
            const highRisks = allRisks.filter((r: any) => r.Severity === 'High');
            if (highRisks.length > 0) {
                highlights += `### 🚨 CRITICAL RISKS\n`;
                highRisks.forEach((r: any) => highlights += `- **${r.Risk}**: ${r.Reasoning}\n`);
            }
            highlights += `\n**Total Risks:** ${allRisks.length}\n\n`;
        }

        if (timelineEvents.length > 0) {
            highlights += `## 📅 Constructed Timeline\n`;
            timelineEvents.sort((a: any, b: any) => new Date(a.Date).getTime() - new Date(b.Date).getTime());
            timelineEvents.forEach((t: any) => highlights += `- **${t.Date}**: ${t.Event}\n`);
            highlights += `\n`;
        }
        return highlights;
    }
}