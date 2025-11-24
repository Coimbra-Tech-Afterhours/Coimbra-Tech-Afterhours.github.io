#!/usr/bin/env node

/**
 * Lightweight script to check if Notion database was updated since last sync.
 * Also checks if any events have dates that have passed (for automatic status updates).
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

/**
 * Check if any events have dates that have passed since last sync
 * This ensures we update status from Upcoming to Past even if database wasn't edited
 */
async function checkForDateBasedStatusChanges(lastSyncDate) {
  try {
    // Query for events that are marked as Upcoming
    // We only need to find ONE event that needs updating to trigger fetch
    const response = await notion.databases.query({
      database_id: NOTION_EVENTS_DATABASE_ID,
      filter: {
        and: [
          {
            property: "Visible on site",
            checkbox: {
              equals: true,
            },
          },
          {
            property: "Status",
            status: {
              equals: "Upcoming",
            },
          },
        ],
      },
      page_size: 10, // Only need to check a few - if we find one, that's enough
    });

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Check if any Upcoming events have dates in the past
    // We check all past events, not just ones that passed since last sync
    // (in case previous syncs failed or were skipped)
    for (const page of response.results) {
      const dateProp = page.properties.Date || page.properties.date;
      if (dateProp && dateProp.type === "date" && dateProp.date) {
        const eventDate = new Date(dateProp.date.start);
        eventDate.setHours(0, 0, 0, 0);
        
        if (eventDate < now) {
          const eventName = page.properties.Name?.title?.[0]?.plain_text || page.properties.name?.title?.[0]?.plain_text || "Unknown";
          console.log(`🔄 Found Upcoming event with date that passed: "${eventName}" (${dateProp.date.start})`);
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.warn("⚠️  Could not check for date-based status changes:", error.message);
    // On error, assume we should check (fail-safe)
    return true;
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

  const lastSyncDate = new Date(lastSyncTimestamp);
  lastSyncDate.setHours(0, 0, 0, 0);

  // If we couldn't get database metadata, fetch to be safe
  if (!databaseLastEdited) {
    console.log("ℹ️  Could not check database timestamp, fetch needed");
    return true;
  }

  const dbEditedDate = new Date(databaseLastEdited);

  // Check if database was edited since last sync
  const dbWasUpdated = dbEditedDate > lastSyncDate;

  // Also check if any events have dates that passed (for automatic status updates)
  // This is important because date-based status changes don't update database last_edited_time
  const hasDateBasedChanges = await checkForDateBasedStatusChanges(lastSyncDate);

  if (!dbWasUpdated && !hasDateBasedChanges) {
    console.log("✅ Database not updated and no date-based status changes, skip fetch");
    console.log(`   Last sync: ${lastSyncTimestamp}`);
    console.log(`   DB last edited: ${databaseLastEdited}`);
    return false;
  }

  if (dbWasUpdated) {
    console.log(`🔄 Database updated since last sync, fetch needed`);
    console.log(`   Last sync: ${lastSyncTimestamp}`);
    console.log(`   DB last edited: ${databaseLastEdited}`);
  }
  
  if (hasDateBasedChanges) {
    console.log(`🔄 Events with dates that passed found, fetch needed for status updates`);
  }

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

