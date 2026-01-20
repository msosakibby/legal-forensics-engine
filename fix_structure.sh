#!/bin/bash

echo "🔧 Reorganizing file structure..."

# 1. Create Directories
mkdir -p processor/src/lanes
mkdir -p processor/src/tests
mkdir -p aggregator/src/strategies
mkdir -p aggregator/src/services
mkdir -p src/utils

# 2. Move Shared Utils
if [ -f common.ts ]; then mv common.ts src/utils/; fi
if [ -f math.ts ]; then mv math.ts src/utils/; fi
if [ -f processor/src/common.ts ]; then mv processor/src/common.ts src/utils/; fi
if [ -f processor/src/math.ts ]; then mv processor/src/math.ts src/utils/; fi

# 3. Move Processor Lanes (From root)
mv bankLane.ts processor/src/lanes/ 2>/dev/null || true
mv creditCardLane.ts processor/src/lanes/ 2>/dev/null || true
mv checkRegisterLane.ts processor/src/lanes/ 2>/dev/null || true
mv courtLane.ts processor/src/lanes/ 2>/dev/null || true
mv expenseLogLane.ts processor/src/lanes/ 2>/dev/null || true
mv financialLane.ts processor/src/lanes/ 2>/dev/null || true
mv genericLane.ts processor/src/lanes/ 2>/dev/null || true
mv invoiceLane.ts processor/src/lanes/ 2>/dev/null || true
mv legalLane.ts processor/src/lanes/ 2>/dev/null || true
mv realEstateLane.ts processor/src/lanes/ 2>/dev/null || true
mv receiptLane.ts processor/src/lanes/ 2>/dev/null || true
mv taxLane.ts processor/src/lanes/ 2>/dev/null || true

# 3b. Move Processor Lanes (From processor/src)
find processor/src -maxdepth 1 -name "*Lane.ts" -exec mv {} processor/src/lanes/ \;

# 4. Move Processor Tests
find processor/src -maxdepth 1 -name "*.test.ts" -exec mv {} processor/src/tests/ \;

# 5. Move Aggregator Strategies
find aggregator/src -maxdepth 1 -name "*Strategy.ts" -exec mv {} aggregator/src/strategies/ \;

# 6. Move Aggregator Services (From root or aggregator/src)
if [ -f aggregator/src/naming.ts ]; then mv aggregator/src/naming.ts aggregator/src/services/; fi
if [ -f aggregator/src/artifactService.ts ]; then mv aggregator/src/artifactService.ts aggregator/src/services/; fi

# 7. Move Aggregator Factory (From aggregator/src)
if [ -f aggregator/src/factory.ts ]; then mv aggregator/src/factory.ts aggregator/src/strategies/; fi

# 8. Fix Misplaced Files
if [ -f processor/src/naming.ts ]; then mv processor/src/naming.ts aggregator/src/services/; fi
if [ -f processor/src/artifactService.ts ]; then mv processor/src/artifactService.ts aggregator/src/services/; fi

# 9. Cleanup Duplicates / Garbage
# Remove aggregator files that might have been copied from processor by mistake
rm -f aggregator/src/bankLane.ts
rm -f aggregator/src/legalLane.ts

# Force move any strategies stuck in processor/src to aggregator
mv processor/src/bankStrategy.ts aggregator/src/strategies/ 2>/dev/null || true
mv processor/src/checkRegisterStrategy.ts aggregator/src/strategies/ 2>/dev/null || true
mv processor/src/courtStrategy.ts aggregator/src/strategies/ 2>/dev/null || true
mv processor/src/creditCardStrategy.ts aggregator/src/strategies/ 2>/dev/null || true
mv processor/src/expenseLogStrategy.ts aggregator/src/strategies/ 2>/dev/null || true
mv processor/src/financialStrategy.ts aggregator/src/strategies/ 2>/dev/null || true
mv processor/src/genericStrategy.ts aggregator/src/strategies/ 2>/dev/null || true
mv processor/src/invoiceStrategy.ts aggregator/src/strategies/ 2>/dev/null || true
mv processor/src/legalStrategy.ts aggregator/src/strategies/ 2>/dev/null || true
mv processor/src/mediaStrategy.ts aggregator/src/strategies/ 2>/dev/null || true
mv processor/src/realEstateStrategy.ts aggregator/src/strategies/ 2>/dev/null || true
mv processor/src/receiptStrategy.ts aggregator/src/strategies/ 2>/dev/null || true
mv processor/src/taxStrategy.ts aggregator/src/strategies/ 2>/dev/null || true

echo "✅ File structure fixed."