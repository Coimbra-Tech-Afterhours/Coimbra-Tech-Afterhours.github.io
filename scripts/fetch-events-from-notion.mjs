#!/usr/bin/env node

/**
 * Fetches events from Notion Events database and writes them to a static JSON file.
 * 
 * This script is meant to be run locally or in a GitHub Action.
 * The frontend should only ever see the generated events.json file.
 * 
 * Usage:
 *   1. Set environment variables:
 *      - NOTION_API_KEY: Your Notion integration API key
 *      - NOTION_EVENTS_DATABASE_ID: The ID of your Events database
 *   2. Run: node scripts/fetch-events-from-notion.mjs
 *   3. The script will create/update public/events.json
 */

import { Client } from "@notionhq/client";
import { writeFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
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
    // Skip excluded properties
    if (excludedProperties.includes(key)) {
      return;
    }

    const value = extractPropertyValue(props[key]);
    // Only include non-null values (or include them if you want to see empty fields)
    if (value !== null && value !== undefined) {
      event[key] = value;
    }
  });

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
 * Main function to fetch events and write JSON file
 */
async function fetchAndWriteEvents() {
  try {
    console.log("🔄 Fetching events from Notion...");

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

