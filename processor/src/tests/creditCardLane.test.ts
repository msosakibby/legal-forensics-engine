import { CreditCardLaneHandler } from '../lanes/creditCardLane.js';
import assert from 'assert';

async function testCreditCardLaneHandler() {
    console.log("🧪 Starting Unit Test: CreditCardLaneHandler");

    // 1. Setup Mock Data
    const mockAiResponse = {
        "Account Number": "****-1234",
        "statement_lines": [
            { "date": "2024-01-01", "description": "Opening Balance", "amount": "0.00", "balance": "100.00" },
            { "date": "2024-01-02", "description": "Purchase", "amount": "50.00", "balance": "150.00" }
        ]
    };

    // 2. Create Mock Context
    const mockContext: any = {
        docId: "test-doc-cc",
        tempPath: "/tmp/test_cc.pdf",
        pdfPart: { inlineData: { mimeType: 'application/pdf', data: '' } },
        promptConfig: { prompts: { bank_statement_math: { template: "Mock Prompt" } } },

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
                    assert.strictEqual(table, 'statement_lines');

                    // Verify array insertion
                    if (Array.isArray(data)) {
                        assert.strictEqual(data.length, 2);
                        assert.strictEqual(data[0].source, 'credit_card');
                        assert.strictEqual(data[0].account_number, "****-1234");
                        // Math verification check (100 + 50 = 150, so index 1 should be verified)
                        assert.strictEqual(data[1].is_math_verified, true);
                    }
                    return { error: null };
                }
            })
        }
    };

    // 3. Run Handler
    const handler = new CreditCardLaneHandler();
    const result = await handler.process(mockContext);

    // 4. Assertions
    assert.strictEqual(result.extractedData["Account Number"], "****-1234");
    assert.strictEqual(result.tableUsed, 'statement_lines');
    assert.ok(result.elementsCaptured.includes("Transactions (Math Verified)"));

    console.log("✅ Test Passed: CreditCardLaneHandler processed correctly.");
}

testCreditCardLaneHandler().catch((err) => {
    console.error("❌ Test Failed:", err);
    process.exit(1);
});