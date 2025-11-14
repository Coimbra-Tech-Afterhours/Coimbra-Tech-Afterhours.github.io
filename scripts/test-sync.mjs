#!/usr/bin/env node

/**
 * Test script to simulate the GitHub Actions workflow locally.
 * 
 * Usage:
 *   1. Create a .env file with:
 *      NOTION_API_KEY=your_api_key
 *      NOTION_EVENTS_DATABASE=your_database_id
 *   2. Run: npm run test-sync
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..");

function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    console.log(`\n📋 Running: ${scriptPath}\n`);
    
    const child = spawn("node", [scriptPath], {
      cwd: ROOT_DIR,
      stdio: "inherit",
      env: { ...process.env },
    });

    child.on("close", (code) => {
      resolve(code);
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

async function main() {
  console.log("🧪 Testing Notion sync workflow locally\n");
  console.log("=" .repeat(50));

  // Step 1: Check if updates are needed
  console.log("\n1️⃣  Step 1: Checking if Notion database was updated...");
  const checkExitCode = await runScript("scripts/check-notion-updates.mjs");

  if (checkExitCode === 0) {
    console.log("\n✅ Check result: Fetch is needed (database was updated)");
    console.log("\n2️⃣  Step 2: Fetching events from Notion...");
    const fetchExitCode = await runScript("scripts/fetch-events-from-notion.mjs");
    
    if (fetchExitCode === 0) {
      console.log("\n✅ Fetch completed successfully!");
    } else {
      console.log("\n❌ Fetch failed with exit code:", fetchExitCode);
      process.exit(1);
    }
  } else if (checkExitCode === 1) {
    console.log("\n✅ Check result: Skip fetch (database not updated)");
    console.log("\n⏭️  Skipping fetch step (as workflow would)");
  } else {
    console.log("\n❌ Check script failed with exit code:", checkExitCode);
    process.exit(1);
  }

  console.log("\n" + "=".repeat(50));
  console.log("\n🎉 Test completed!");
  console.log("\n💡 Tips:");
  console.log("   - Check .last-sync file to see the last sync timestamp");
  console.log("   - Check public/events.json to see the fetched events");
  console.log("   - Run again immediately to test the skip logic");
}

main().catch((error) => {
  console.error("\n❌ Error:", error.message);
  process.exit(1);
});

