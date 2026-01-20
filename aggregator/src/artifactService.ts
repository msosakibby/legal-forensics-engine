import { Storage } from '@google-cloud/storage';
import { VertexAI } from '@google-cloud/vertexai';
import { PDFDocument } from 'pdf-lib';
import { SummaryFactory } from './strategies/factory.js';
import { retryWithBackoff } from './../../src/utils/common.js';

export class ArtifactService {
    constructor(
        private storage: Storage,
        private vertexAI: VertexAI
    ) { }

    async generateAndUploadArtifacts(
        docRecord: any,
        pages: any[],
        targetName: string,
        folderPath: string
    ): Promise<any> {
        const firstPageData = pages[0].extracted_data || {};
        const reportMeta = firstPageData._reporting || { lane: "Unknown", table: "Unknown", elements: [] };

        console.log("4. Generating 5-File Artifact Set...");

        // --- File 1: Transcript.md ---
        let fullTranscript = `# Layout-Aware Transcript: ${targetName}\n\n`;
        for (const page of pages) {
            if (page.gcs_markdown_path) {
                // We download the MD file created by the Processor
                const [buf] = await this.storage.bucket(process.env.PROCESSING_BUCKET!).file(page.gcs_markdown_path).download();
                fullTranscript += `### Page ${page.page_index + 1}\n\n${buf.toString()}\n\n---\n\n`;
            }
        }

        // --- File 2: Analysis.md ---
        let forensicMd = `# Forensic Analysis: ${targetName}\n\n`;
        forensicMd += `## 📋 Metadata\n`;
        forensicMd += `- **Lane:** ${reportMeta.lane}\n`;
        forensicMd += `- **Table:** ${reportMeta.table}\n`;
        forensicMd += `- **Elements:** ${reportMeta.elements ? reportMeta.elements.join(', ') : 'None'}\n\n`;

        // Append Highlights
        const strategy = SummaryFactory.getStrategy(reportMeta.lane);
        if (strategy) {
            forensicMd += strategy.buildHighlights(pages);
        }

        // If empty highlights, use AI fallback
        if (!forensicMd.includes("##")) {
            console.log("   Generating AI Fallback Summary...");
            const proModel = this.vertexAI.getGenerativeModel({ model: 'gemini-1.5-pro-001' });
            const sampleText = pages.slice(0, 3).map(p => JSON.stringify(p.extracted_data)).join('\n');
            const res = await retryWithBackoff(() => proModel.generateContent(
                `Summarize this document (${reportMeta.lane}). Focus on dates, money, and entities.\n${sampleText.substring(0, 5000)}`
            ));
            forensicMd += `\n## Executive Summary\n${res.response.candidates?.[0]?.content?.parts?.[0]?.text || "No summary available."}`;
        }

        // --- File 3: Full JSON ---
        const fullJson = {
            meta: { originalName: docRecord.filename, processedDate: new Date(), folder: folderPath },
            reporting: reportMeta,
            summary: forensicMd,
            pages: pages.map(p => p.extracted_data)
        };

        // --- File 4: Clean PDF ---
        const [originalPdfBuf] = await this.storage.bucket(process.env.INPUT_BUCKET!).file(docRecord.filename).download();

        // --- File 5: Meta PDF ---
        // CRITICAL FIX: ignoreEncryption here too
        const pdfDoc = await PDFDocument.load(originalPdfBuf, { ignoreEncryption: true });
        pdfDoc.setTitle(targetName);
        pdfDoc.setSubject(forensicMd.substring(0, 2000));
        pdfDoc.setKeywords(['LegalForensics', reportMeta.lane]);
        const pdfMetaBytes = await pdfDoc.save();

        // Upload to Archive
        const archive = this.storage.bucket(process.env.ARCHIVE_BUCKET!);
        console.log(`5. Uploading artifacts to ${process.env.ARCHIVE_BUCKET}/${folderPath}/ ...`);

        await Promise.all([
            archive.file(`${folderPath}/${targetName}_Transcript.md`).save(fullTranscript),
            archive.file(`${folderPath}/${targetName}_Analysis.md`).save(forensicMd),
            archive.file(`${folderPath}/${targetName}.json`).save(JSON.stringify(fullJson, null, 2)),
            archive.file(`${folderPath}/${targetName}_Clean.pdf`).save(originalPdfBuf),
            archive.file(`${folderPath}/${targetName}_WithMeta.pdf`).save(pdfMetaBytes)
        ]);

        return fullJson;
    }
}