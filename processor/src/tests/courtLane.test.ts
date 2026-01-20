import { CourtLaneHandler } from '../lanes/courtLane.js';
import assert from 'assert';

async function testCourtLaneHandler() {
    console.log("🧪 Starting Unit Test: CourtLaneHandler");

    // 1. Setup Mock Data
    const mockAiResponse = {
        "Court Name": "Superior Court of California",
        "Case Number": "DIV-12345",
        "Judgment Date": "2024-01-15",
        "Plaintiff": "Jane Doe",
        "Defendant": "John Doe",
        "Ruling": "Granted",
        "Judgment Amount": "$50,000.00",
        "Financial Obligations": "Alimony of $2,000/month",
        "Terms": "Standard dissolution terms apply."
    };

    // 2. Create Mock Context
    const mockContext: any = {
        docId: "test-doc-court",
        tempPath: "/tmp/test_judgment.pdf",
        pdfPart: { inlineData: { mimeType: 'application/pdf', data: '' } },
        promptConfig: { prompts: {} },

        generateMarkdown: async () => "Mock Markdown Content for Judgment",

        reasoningModel: {
            generateContent: async () => ({
                response: {
                    candidates: [{
                        content: {
                            parts: [{ text: JSON.stringify(mockAiResponse) }]
                        }
                    }]
                }
            })
        },

        supabase: {
            from: (table: string) => ({
                insert: async (data: any) => {
                    console.log(`   [Mock] DB Insert into '${table}'`);
                    assert.strictEqual(table, 'legal_documents');
                    assert.strictEqual(data.document_type, "Court Judgment");
                    assert.strictEqual(data.effective_date, "2024-01-15");
                    assert.strictEqual(data.parties.Plaintiff, "Jane Doe");
                    assert.strictEqual(data.financial_obligations.amount, "$50,000.00");
                    return { error: null };
                }
            })
        }
    };

    // 3. Run Handler
    const handler = new CourtLaneHandler();
    const result = await handler.process(mockContext);

    // 4. Assertions
    assert.strictEqual(result.extractedData["Court Name"], "Superior Court of California");
    assert.strictEqual(result.elementsCaptured.length, 5);
    assert.strictEqual(result.tableUsed, 'legal_documents');

    console.log("✅ Test Passed: CourtLaneHandler processed correctly.");
}

testCourtLaneHandler().catch((err) => {
    console.error("❌ Test Failed:", err);
    process.exit(1);
});