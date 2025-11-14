#!/usr/bin/env node

/**
 * Lightweight script to check if Notion database was updated since last sync.
 * Exits with code 0 if fetch is needed, code 1 if skip is needed.
 * This allows the workflow to conditionally run the fetch step.
 */

import { Client } from "@notionhq/client";
import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..");

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_EVENTS_DATABASE_ID = process.env.NOTION_EVENTS_DATABASE;

if (!NOTION_API_KEY || !NOTION_EVENTS_DATABASE_ID) {
  // If credentials missing, assume we should fetch (fail-safe)
  console.log("⚠️  Missing credentials, will fetch to be safe");
  process.exit(0);
}

const notion = new Client({ auth: NOTION_API_KEY });

async function readLastSyncTimestamp() {
  const syncFile = join(ROOT_DIR, ".last-sync");
  try {
    const content = await readFile(syncFile, "utf-8");
    return content.trim();
  } catch (err) {
    if (err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

async function getDatabaseLastEditedTime() {
  try {
    const database = await notion.databases.retrieve({
      database_id: NOTION_EVENTS_DATABASE_ID,
    });
    return database.last_edited_time;
  } catch (error) {
    console.warn("⚠️  Could not retrieve database metadata:", error.message);
    // If we can't check, assume we should fetch (fail-safe)
    return null;
  }
}

async function checkIfFetchNeeded() {
  const lastSyncTimestamp = await readLastSyncTimestamp();
  const databaseLastEdited = await getDatabaseLastEditedTime();

  // If no last sync timestamp exists, we need to fetch
  if (!lastSyncTimestamp) {
    console.log("ℹ️  No previous sync found, fetch needed");
    return true;
  }

  // If we couldn't get database metadata, fetch to be safe
  if (!databaseLastEdited) {
    console.log("ℹ️  Could not check database timestamp, fetch needed");
    return true;
  }

  const lastSyncDate = new Date(lastSyncTimestamp);
  const dbEditedDate = new Date(databaseLastEdited);

  if (dbEditedDate <= lastSyncDate) {
    console.log("✅ Database not updated since last sync, skip fetch");
    console.log(`   Last sync: ${lastSyncTimestamp}`);
    console.log(`   DB last edited: ${databaseLastEdited}`);
    return false;
  }

  console.log(`🔄 Database updated since last sync, fetch needed`);
  console.log(`   Last sync: ${lastSyncTimestamp}`);
  console.log(`   DB last edited: ${databaseLastEdited}`);
  return true;
}

checkIfFetchNeeded()
  .then((shouldFetch) => {
    process.exit(shouldFetch ? 0 : 1);
  })
  .catch((error) => {
    console.error("❌ Error checking database:", error.message);
    // On error, fetch to be safe
    process.exit(0);
  });

