import { ReceiptLaneHandler } from '../lanes/receiptLane.js';
import assert from 'assert';

async function testReceiptLaneHandler() {
    console.log("🧪 Starting Unit Test: ReceiptLaneHandler");

    // 1. Setup Mock Data
    const mockAiResponse = {
        "Vendor Name": "Home Depot",
        "Vendor Address": "123 Main St",
        "Transaction Date": "2024-01-15",
        "Gross Receipt Total": "$45.67",
        "Tax Receipt Total": "$3.50",
        "Line Items": [
            { "Description": "Hammer", "Line Total": "$15.00" }
        ]
    };

    // 2. Create Mock Context
    const mockContext: any = {
        docId: "test-doc-receipt",
        tempPath: "/tmp/test.pdf",
        pdfPart: { inlineData: { mimeType: 'application/pdf', data: '' } },
        promptConfig: { prompts: {} },

        generateMarkdown: async () => "Mock Markdown Content",

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
                    assert.strictEqual(table, 'receipts_log');
                    assert.strictEqual(data.vendor_name, "Home Depot");
                    assert.strictEqual(data.total_amount, "$45.67");
                    return { error: null };
                }
            })
        }
    };

    // 3. Run Handler
    const handler = new ReceiptLaneHandler();
    const result = await handler.process(mockContext);

    // 4. Assertions
    assert.strictEqual(result.extractedData["Vendor Name"], "Home Depot");
    assert.strictEqual(result.elementsCaptured.length, 5);

    console.log("✅ Test Passed: ReceiptLaneHandler processed correctly.");
}

testReceiptLaneHandler().catch((err) => {
    console.error("❌ Test Failed:", err);
    process.exit(1);
});