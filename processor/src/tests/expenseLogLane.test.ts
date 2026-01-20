import { ExpenseLogHandler } from '../expenseLogLane.js';
import assert from 'assert';

async function testExpenseLogHandler() {
    console.log("🧪 Starting Unit Test: ExpenseLogHandler");

    // 1. Setup Mock Data
    const mockOcrText = `
    Judy's Expenses - Jan 2024
    Target   Auto Pay   $150.00
    "        "          $20.00   (Groceries)
    `;

    const mockAiResponse = {
        "Entity Name": "Judy",
        "Reporting Period": "Jan 2024",
        "Transactions": [
            {
                "Payee (Main)": "Target",
                "Payment Method": "Auto Pay",
                "Amount": "$150.00",
                "Payee Modifier (Margin)": null,
                "Ditto Resolution": false
            },
            {
                "Payee (Main)": "Target",
                "Payment Method": "Auto Pay",
                "Amount": "$20.00",
                "Payee Modifier (Margin)": "Groceries",
                "Ditto Resolution": true
            }
        ]
    };

    // 2. Create Mock Context
    // We cast to 'any' to avoid mocking every single property of the complex types
    const mockContext: any = {
        docId: "test-doc-123",
        fileBuffer: Buffer.from("fake-pdf-data"),
        pdfPart: { inlineData: { mimeType: 'application/pdf', data: '' } },
        promptConfig: { prompts: {} },

        // Mock Vision: Returns our sample OCR text
        extractTextWithVision: async (buf: Buffer) => {
            console.log("   [Mock] Vision OCR called");
            return mockOcrText;
        },

        // Mock Vertex AI: Returns our sample JSON structure
        reasoningModel: {
            generateContent: async (req: any) => {
                console.log("   [Mock] Vertex AI called");
                return {
                    response: {
                        candidates: [{
                            content: {
                                parts: [{ text: JSON.stringify(mockAiResponse) }]
                            }
                        }]
                    }
                };
            }
        },

        // Mock Supabase: Verifies the insert call
        supabase: {
            from: (table: string) => ({
                insert: async (data: any) => {
                    console.log(`   [Mock] DB Insert into '${table}'`);
                    assert.strictEqual(table, 'evidence_logs', "Should insert into evidence_logs table");
                    assert.strictEqual(data.doc_id, 'test-doc-123', "Doc ID mismatch");
                    assert.strictEqual(data.log_type, 'expense_log', "Log Type mismatch");
                    assert.strictEqual(data.entities.length, 2, "Should have 2 transactions");
                    return { error: null };
                }
            })
        }
    };

    // 3. Run Handler
    const handler = new ExpenseLogHandler();
    const result = await handler.process(mockContext);

    // 4. Assertions
    assert.ok(result, "Result should not be null");
    assert.strictEqual(result.tableUsed, 'evidence_logs');
    assert.strictEqual(result.extractedData["Entity Name"], "Judy");
    assert.strictEqual(result.elementsCaptured.length, 5);

    // Check Markdown generation
    assert.ok(result.markdown.includes("| Target | Auto Pay | $150.00 |"), "Markdown should contain first transaction");
    assert.ok(result.markdown.includes("| Target | Auto Pay | $20.00 |"), "Markdown should contain second transaction");

    console.log("✅ Test Passed: ExpenseLogHandler processed correctly.");
}

testExpenseLogHandler().catch((err) => {
    console.error("❌ Test Failed:", err);
    process.exit(1);
});