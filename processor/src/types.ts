import { SupabaseClient } from '@supabase/supabase-js';
import { GenerativeModel } from '@google-cloud/vertexai';

export interface ProcessingContext {
    docId: string;
    tempPath: string;
    pdfPart: any;
    fileBuffer: Buffer;
    reasoningModel: GenerativeModel;
    promptConfig: any;
    supabase: SupabaseClient;
    generateMarkdown: (path: string) => Promise<string>;
    extractTextWithVision: (buffer: Buffer) => Promise<string>;
}

export interface LaneResult {
    extractedData: any;
    markdown: string;
    tableUsed: string;
    elementsCaptured: string[];
}

export interface LaneHandler {
    process(context: ProcessingContext): Promise<LaneResult>;
}

export interface SummaryStrategy {
    buildHighlights(pages: any[]): string;
}