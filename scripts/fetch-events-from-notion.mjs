#!/usr/bin/env node

/**
 * Fetches events from Notion Events database and writes them to a static JSON file.
 * Also automatically updates event Status in Notion (Upcoming → Past) based on date.
 * 
 * This script is meant to be run locally or in a GitHub Action.
 * The frontend should only ever see the generated events.json file.
 * 
 * Features:
 * - Automatically updates Status in Notion database (replaces Notion automation)
 * - Excludes Place data (Place Name, Place Link) for security (secret locations)
 * - Only fetches events marked as "Visible on site"
 * 
 * Usage:
 *   1. Set environment variables:
 *      - NOTION_API_KEY: Your Notion integration API key
 *      - NOTION_EVENTS_DATABASE_ID: The ID of your Events database
 *   2. Run: node scripts/fetch-events-from-notion.mjs
 *   3. The script will:
 *      - Update Status in Notion for past events
 *      - Create/update public/events.json
 * 
 * Note: The Notion integration must have write access to update Status.
 */

import { Client } from "@notionhq/client";
import { writeFile, mkdir, readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import dotenv from "dotenv";

// Load environment variables from .env file if it exists
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..");

// Read environment variables
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_EVENTS_DATABASE_ID = process.env.NOTION_EVENTS_DATABASE;

if (!NOTION_API_KEY) {
  console.error("❌ Error: NOTION_API_KEY environment variable is not set");
  process.exit(1);
}

if (!NOTION_EVENTS_DATABASE_ID) {
  console.error("❌ Error: NOTION_EVENTS_DATABASE_ID environment variable is not set");
  process.exit(1);
}

// Initialize Notion client
const notion = new Client({ auth: NOTION_API_KEY });

/**
 * Formats a date to a pretty string (e.g., "12 Nov 2025, 19:00")
 */
function formatDatePretty(dateString) {
  if (!dateString) return null;
  
  const date = new Date(dateString);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  
  return formatter.format(date).replace(",", "");
}

/**
 * Extracts a value from any Notion property type
 */
function extractPropertyValue(property) {
  if (!property || !property.type) {
    return null;
  }

  switch (property.type) {
    case "title":
      return property.title?.map((text) => text.plain_text).join("") || null;
    
    case "rich_text":
      return property.rich_text?.map((text) => text.plain_text).join("") || null;
    
    case "number":
      return property.number;
    
    case "select":
      return property.select?.name || null;
    
    case "multi_select":
      return property.multi_select?.map((item) => item.name) || [];
    
    case "date":
      return property.date?.start || null;
    
    case "checkbox":
      return property.checkbox || false;
    
    case "url":
      return property.url || null;
    
    case "email":
      return property.email || null;
    
    case "phone_number":
      return property.phone_number || null;
    
    case "status":
      return property.status?.name || null;
    
    case "relation":
      // Relations return array of page IDs
      return property.relation?.map((rel) => rel.id) || [];
    
    case "rollup":
      // Rollups can be various types, try to extract the value
      if (property.rollup?.array) {
        return property.rollup.array.map((item) => {
          if (item.type === "title") {
            return item.title?.map((text) => text.plain_text).join("") || null;
          }
          return extractPropertyValue(item);
        }).filter((v) => v !== null);
      }
      return property.rollup?.number || null;
    
    case "formula":
      // Formulas can be various types
      if (property.formula?.type === "string") {
        return property.formula.string || null;
      }
      if (property.formula?.type === "number") {
        return property.formula.number;
      }
      if (property.formula?.type === "boolean") {
        return property.formula.boolean;
      }
      if (property.formula?.type === "date") {
        return property.formula.date?.start || null;
      }
      return null;
    
    case "created_time":
      return property.created_time || null;
    
    case "last_edited_time":
      return property.last_edited_time || null;
    
    case "created_by":
      return property.created_by?.id || null;
    
    case "last_edited_by":
      return property.last_edited_by?.id || null;
    
    case "people":
      return property.people?.map((person) => person.id) || [];
    
    case "files":
      return property.files?.map((file) => ({
        name: file.name,
        url: file.file?.url || file.external?.url || null,
      })) || [];
    
    default:
      // For unknown types, try to return the raw value or null
      console.warn(`⚠️  Unknown property type: ${property.type}`);
      return null;
  }
}

/**
 * Maps a Notion page to a simple event object with all properties
 */
function mapEvent(page, debug = false) {
  const props = page.properties;
  const event = {};

  // Properties to exclude from the output
  const excludedProperties = [
    'Location', // Relation to places database (we use Place lookup instead)
    'Place Name', // Venue name - not displayed on site (location provided in event details)
    'Place Link', // Venue link - not displayed on site (location provided in event details)
    'Visible on site', // Filter property, not needed in output
  ];

  // Debug: log all available property names
  if (debug) {
    console.log("\n📋 Available properties in Notion:");
    Object.keys(props).forEach(key => {
      console.log(`  - "${key}" (type: ${props[key].type})`);
    });
  }

  // Extract all properties generically, excluding specified ones
  Object.keys(props).forEach((key) => {
    // Skip excluded properties (including Place data for security - secret locations)
    if (excludedProperties.includes(key)) {
      if (debug) {
        console.log(`   ⏭️  Skipping excluded property: "${key}"`);
      }
      return;
    }

    const value = extractPropertyValue(props[key]);
    // Only include non-null values (or include them if you want to see empty fields)
    if (value !== null && value !== undefined) {
      event[key] = value;
    }
  });
  
  // Double-check: Ensure Place data is never included (security measure)
  delete event['Place Name'];
  delete event['Place Link'];
  delete event['Place'];

  // Add pretty date formatting if Date property exists
  if (event.Date) {
    event.datePretty = formatDatePretty(event.Date);
  }
  // Also check for lowercase 'date' or other variations
  if (!event.datePretty && event.date) {
    event.datePretty = formatDatePretty(event.date);
  }


  return event;
}

/**
 * Reads the last sync timestamp from file
 */
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

/**
 * Writes the last sync timestamp to file
 */
async function writeLastSyncTimestamp(timestamp) {
  const syncFile = join(ROOT_DIR, ".last-sync");
  await writeFile(syncFile, timestamp, "utf-8");
}

/**
 * Gets the database's last edited time
 */
async function getDatabaseLastEditedTime() {
  try {
    const database = await notion.databases.retrieve({
      database_id: NOTION_EVENTS_DATABASE_ID,
    });
    return database.last_edited_time;
  } catch (error) {
    console.warn("⚠️  Could not retrieve database metadata, proceeding with fetch:", error.message);
    return null;
  }
}

/**
 * Updates event Status in Notion database based on date
 * Since Notion free plan can't automate, we do it here via GitHub Actions
 */
async function updateEventStatusesInNotion() {
  try {
    console.log("🔄 Checking for events that need status updates...");

    // Query for events marked as "Upcoming" that are visible on site
    // Fetch all pages (handle pagination)
    let allPages = [];
    let hasMore = true;
    let startCursor = undefined;

    while (hasMore) {
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
        start_cursor: startCursor,
      });

      allPages = allPages.concat(response.results);
      hasMore = response.has_more;
      startCursor = response.next_cursor;
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0); // Set to start of day for fair comparison

    let updatedCount = 0;
    const updatePromises = [];

    for (const page of allPages) {
      const dateProp = page.properties.Date || page.properties.date;
      if (!dateProp || dateProp.type !== "date" || !dateProp.date) {
        continue;
      }

      const eventDate = new Date(dateProp.date.start);
      eventDate.setHours(0, 0, 0, 0);

      // If event date is in the past, update Status to "Past" in Notion
      if (eventDate < now) {
        const eventName = page.properties.Name?.title?.[0]?.plain_text || page.properties.name?.title?.[0]?.plain_text || "Unknown";
        console.log(`   📅 Updating "${eventName}" (${dateProp.date.start}) from Upcoming → Past`);

        updatePromises.push(
          notion.pages.update({
            page_id: page.id,
            properties: {
              Status: {
                status: {
                  name: "Past",
                },
              },
            },
          })
            .then(() => {
              updatedCount++;
              return true;
            })
            .catch((error) => {
              console.error(`   ❌ Failed to update page ${page.id}:`, error.message);
              return false;
            })
        );
      }
    }

    // Wait for all updates to complete
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
      console.log(`✅ Updated Status to "Past" for ${updatedCount} event(s) in Notion`);
    } else {
      console.log("✅ No events need status updates");
    }

    return updatedCount > 0;
  } catch (error) {
    console.error("❌ Error updating event statuses in Notion:", error.message);
    // Don't fail the entire sync if status updates fail
    return false;
  }
}

/**
 * Computes a hash of the events array for comparison
 */
function computeEventsHash(events) {
  const content = JSON.stringify(events);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Reads existing events.json and computes its hash
 */
async function getExistingEventsHash() {
  const outputPath = join(ROOT_DIR, "public", "events.json");
  try {
    const content = await readFile(outputPath, "utf-8");
    const events = JSON.parse(content);
    return computeEventsHash(events);
  } catch (err) {
    if (err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Main function to fetch events and write JSON file
 */
async function fetchAndWriteEvents() {
  try {
    console.log("🔄 Fetching events from Notion...");

    // First, update any event statuses in Notion that need updating
    // This ensures the database stays in sync (replaces Notion automation)
    const statusUpdated = await updateEventStatusesInNotion();
    
    // If we updated statuses, wait a moment for Notion to process
    if (statusUpdated) {
      console.log("⏳ Waiting for Notion to process status updates...");
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
    }

    // Get database last edited time for timestamp tracking
    const databaseLastEdited = await getDatabaseLastEditedTime();

    // Query the database with filters
    const response = await notion.databases.query({
      database_id: NOTION_EVENTS_DATABASE_ID,
      filter: {
        property: "Visible on site",
        checkbox: {
          equals: true,
        },
      },
      sorts: [
        {
          property: "Date",
          direction: "ascending",
        },
      ],
    });

    console.log(`✅ Found ${response.results.length} visible events`);

    // Map events to simple objects (enable debug for first event to see property names)
    const events = response.results.map((page, index) => {
      return mapEvent(page, index === 0); // Debug first event only
    });

    // Filter out events without a Name or Date property
    const validEvents = events.filter(
      (event) => (event.Name || event.name) && (event.Date || event.date)
    );

    console.log(`✅ Mapped ${validEvents.length} valid events`);

    // Check if content actually changed
    const newHash = computeEventsHash(validEvents);
    const existingHash = await getExistingEventsHash();
    
    if (existingHash && newHash === existingHash) {
      console.log("ℹ️  Events content unchanged, no update needed.");
      // Update sync timestamp even if content didn't change (to track last check)
      if (databaseLastEdited) {
        await writeLastSyncTimestamp(databaseLastEdited);
      }
      process.exit(0); // Exit successfully without changes
    }

    // Ensure public directory exists
    const publicDir = join(ROOT_DIR, "public");
    try {
      await mkdir(publicDir, { recursive: true });
    } catch (err) {
      // Directory might already exist, ignore error
      if (err.code !== "EEXIST") {
        throw err;
      }
    }

    // Write events to JSON file
    const outputPath = join(publicDir, "events.json");
    await writeFile(outputPath, JSON.stringify(validEvents, null, 2), "utf-8");

    console.log(`✅ Successfully wrote ${validEvents.length} events to ${outputPath}`);
    
    // Update sync timestamp
    if (databaseLastEdited) {
      await writeLastSyncTimestamp(databaseLastEdited);
      console.log(`✅ Updated sync timestamp: ${databaseLastEdited}`);
    }
    
    console.log("🎉 Done!");
  } catch (error) {
    console.error("❌ Error fetching events from Notion:", error.message);
    if (error.code === "object_not_found") {
      console.error(
        "   Hint: Check that NOTION_EVENTS_DATABASE_ID is correct and the integration has access to the database."
      );
    } else if (error.code === "unauthorized") {
      console.error(
        "   Hint: Check that NOTION_API_KEY is correct and the integration is active."
      );
    }
    process.exit(1);
  }
}

// Run the script
fetchAndWriteEvents();

