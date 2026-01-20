import { BankStatementHandler } from '../lanes/bankLane.js';
import assert from 'assert';

async function testBankStatementHandler() {
    console.log("🧪 Starting Unit Test: BankStatementHandler");

    // 1. Setup Mock Data
    const mockLedgerResponse = {
        "Account Number": "123456789",
        "statement_lines": [
            { "date": "2024-01-01", "description": "Check #101", "amount": "-100.00", "balance": "900.00" }
        ]
    };

    const mockCheckResponse = {
        "checks": [
            {
                "Statement Verification Line": "Check 101",
                "Payor Block": { "Name": "John Doe", "Address": "123 St", "Phone": "555-5555" },
                "Date Written": "2024-01-01",
                "Check # (Image)": 101,
                "Payee Name": "Jane Smith",
                "Courtesy Amount": "$100.00",
                "Legal Amount": "One Hundred Dollars",
                "MICR Line": "A123456789A"
            }
        ]
    };

    // 2. Create Mock Context
    const mockContext: any = {
        docId: "test-doc-bank",
        tempPath: "/tmp/test_bank.pdf",
        pdfPart: { inlineData: { mimeType: 'application/pdf', data: '' } },
        promptConfig: { prompts: { bank_statement_math: { template: "Mock Ledger Prompt" } } },

        generateMarkdown: async () => "Mock Markdown Content",

        reasoningModel: {
            generateContent: async (req: any) => {
                const promptText = req.contents[0].parts[1].text;

                if (promptText.includes("Mock Ledger Prompt")) {
                    return {
                        response: {
                            candidates: [{
                                content: {
                                    parts: [{ text: JSON.stringify(mockLedgerResponse) }]
                                }
                            }]
                        }
                    };
                } else if (promptText.includes("Bank Statement Check Images")) {
                    return {
                        response: {
                            candidates: [{
                                content: {
                                    parts: [{ text: JSON.stringify(mockCheckResponse) }]
                                }
                            }]
                        }
                    };
                }
                return { response: {} };
            }
        },

        supabase: {
            from: (table: string) => ({
                insert: async (data: any) => {
                    console.log(`   [Mock] DB Insert into '${table}'`);

                    if (table === 'statement_lines') {
                        assert.strictEqual(data[0].source, 'bank_statement');
                        assert.strictEqual(data[0].account_number, "123456789");
                    } else if (table === 'evidence_logs') {
                        assert.strictEqual(data.log_type, 'check_image_extraction');
                        assert.strictEqual(data.entities.length, 1);
                        assert.strictEqual(data.entities[0]["Check # (Image)"], 101);
                    }
                    return { error: null };
                }
            })
        }
    };

    // 3. Run Handler
    const handler = new BankStatementHandler();
    const result = await handler.process(mockContext);

    // 4. Assertions
    assert.strictEqual(result.extractedData["Account Number"], "123456789");
    assert.strictEqual(result.extractedData.checks.length, 1);
    assert.ok(result.elementsCaptured.includes("Check Images"));

    console.log("✅ Test Passed: BankStatementHandler processed ledger and checks correctly.");
}

testBankStatementHandler().catch((err) => {
    console.error("❌ Test Failed:", err);
    process.exit(1);
});