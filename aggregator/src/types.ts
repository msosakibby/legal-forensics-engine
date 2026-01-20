export interface SummaryStrategy {
    buildHighlights(pages: any[]): string;
}