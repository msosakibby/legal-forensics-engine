import { SummaryStrategy } from '../types.js';

export class MediaSummaryStrategy implements SummaryStrategy {
    buildHighlights(pages: any[]): string {
        let highlights = "";
        let transcriptLength = 0;
        let preview = "";

        pages.forEach(p => {
            const d = p.extracted_data || {};
            const text = d.content || d.transcript || "";
            if (text) {
                transcriptLength += text.length;
                if (!preview) preview = text.substring(0, 200).replace(/\n/g, ' ') + "...";
            }
        });

        highlights += `## 🎙️ Media Transcript Analysis\n`;
        highlights += `- **Total Characters:** ${transcriptLength.toLocaleString()}\n`;
        if (preview) highlights += `- **Preview:** "${preview}"\n`;
        highlights += `\n> Note: Full transcript available in the 'TRANSCRIPTS' folder.\n\n`;

        return highlights;
    }
}