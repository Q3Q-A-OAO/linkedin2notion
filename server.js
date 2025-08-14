import dotenv from 'dotenv';
dotenv.config();

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { chromium } from "playwright";
import { Client } from "@notionhq/client";
import fs from "fs";
import path from "path";
const {
  NOTION_TOKEN,
  JOBS_DB_ID,
  COMPANIES_DB_ID,
  PORT = 8787
} = process.env;

if (!NOTION_TOKEN || !JOBS_DB_ID || !COMPANIES_DB_ID) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });
const app = express();
const storagePath = path.resolve("storage/state.json");

app.use(cors());
app.use(bodyParser.json());

// Check if LinkedIn session exists
function checkSession() {
  if (!fs.existsSync(storagePath)) {
    throw new Error("LinkedIn session not found. Run 'npm run login' first.");
  }
}

// Upsert company (create or update)
async function upsertCompany({ name, url, logo }) {
  if (!name || !url) return null;

  // Try to find existing by URL first
  let existing = await notion.databases.query({
    database_id: COMPANIES_DB_ID,
    filter: { property: "Company link", url: { equals: url } }
  });

  if (existing.results.length === 0) {
    // Try to find by canonicalized name
    const canonicalName = name.toLowerCase().replace(/\b(llc|ltd|plc|inc|co|corp)\b/g, "").trim();
    existing = await notion.databases.query({
      database_id: COMPANIES_DB_ID,
      filter: { property: "Name", title: { contains: canonicalName } }
    });
  }

  if (existing.results.length > 0) {
    // Update existing
    const company = existing.results[0];
    await notion.pages.update({
      page_id: company.id,
      properties: {
        "Industry": { multi_select: [] }, // Leave empty for now
        "Company link": { url: url }
      }
    });
    return company.id;
  } else {
    // Create new
    const company = await notion.pages.create({
      parent: { database_id: COMPANIES_DB_ID },
      properties: {
        "Name": { title: [{ text: { content: name } }] },
        "Industry": { multi_select: [] }, // Leave empty for now
        "Company link": { url: url }
      },
      icon: logo ? { type: "external", external: { url: logo } } : undefined
    });
    return company.id;
  }
}

// Upsert job (create or update) - NO STATUS FIELD
// Now properly handles multiple jobs from same company by distinguishing by location
async function upsertJob({
  title, companyId, jobUrl, applyUrl, locationStr,
  jobDescription, contactPerson, contactEmail, ddl
}) {
  // Find existing by (title + company + location) to handle multiple jobs from same company
  console.log(`Searching for existing job: "${title}" at "${locationStr}" for company ${companyId}`);
  
  const base = await notion.databases.query({
    database_id: JOBS_DB_ID,
    filter: {
      and: [
        { property: "Job Applications", title: { equals: title } },
        { property: "Companies", relation: { contains: companyId } },
        { property: "location", multi_select: { contains: locationStr } }
      ]
    }
  });
  
  console.log(`Found ${base.results.length} existing jobs with same title + company + location`);

  if (base.results.length > 0) {
    // Update existing
    const job = base.results[0];
    await notion.pages.update({
      page_id: job.id,
      properties: {
        "Application URL": { url: applyUrl },
        "location": { multi_select: locationStr ? [{ name: locationStr }] : [] },
        "Contact Person": { rich_text: contactPerson ? [{ text: { content: contactPerson } }] : [] },
        "Contact Email": { email: contactEmail || null },
        "DDL": { date: ddl ? { start: ddl } : null }
      }
    });
    
    console.log(`Updated existing job: ${title} at ${locationStr} for company ${companyId}`);
    
    // Update page content with job description
    if (jobDescription) {
      // Convert LinkedIn formatting to proper Notion blocks
      const descriptionBlocks = [];
      
      // Split by line breaks to preserve the original structure
      const lines = jobDescription.split('\n');
      let currentList = [];
      let inList = false;
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        // Check if this is a bullet point
        if (trimmedLine.match(/^[•\-]\s/)) {
          if (!inList) {
            inList = true;
            currentList = [];
          }
          // Extract text after bullet
          const text = trimmedLine.replace(/^[•\-]\s/, '').trim();
          if (text) {
            currentList.push(text);
          }
        } else {
          // If we were building a list, finish it
          if (inList && currentList.length > 0) {
            // Create bulleted list block
            for (const item of currentList) {
              if (item.length > 2000) {
                // Split long list items
                let remaining = item;
                while (remaining.length > 0) {
                  const chunk = remaining.substring(0, 2000);
                  descriptionBlocks.push({
                    object: "block",
                    type: "bulleted_list_item",
                    bulleted_list_item: {
                      rich_text: [{ type: "text", text: { content: chunk } }]
                    }
                  });
                  remaining = remaining.substring(2000);
                }
              } else {
                descriptionBlocks.push({
                  object: "block",
                  type: "bulleted_list_item",
                  bulleted_list_item: {
                    rich_text: [{ type: "text", text: { content: item } }]
                  }
                });
              }
            }
            inList = false;
            currentList = [];
          }
          
          // Handle regular text lines
          if (trimmedLine.length > 2000) {
            // Split long lines into multiple blocks
            let remaining = trimmedLine;
            while (remaining.length > 0) {
              const chunk = remaining.substring(0, 2000);
              descriptionBlocks.push({
                object: "block",
                type: "paragraph",
                paragraph: {
                  rich_text: [{ type: "text", text: { content: chunk } }]
                }
              });
              remaining = remaining.substring(2000);
            }
          } else {
            descriptionBlocks.push({
              object: "block",
              type: "paragraph",
              paragraph: {
                rich_text: [{ type: "text", text: { content: trimmedLine } }]
              }
            });
          }
        }
      }
      
      // Handle any remaining list items
      if (inList && currentList.length > 0) {
        for (const item of currentList) {
          if (item.length > 2000) {
            let remaining = item;
            while (remaining.length > 0) {
              const chunk = remaining.substring(0, 2000);
              descriptionBlocks.push({
                object: "block",
                type: "bulleted_list_item",
                bulleted_list_item: {
                  rich_text: [{ type: "text", text: { content: chunk } }]
                }
              });
              remaining = remaining.substring(2000);
            }
          } else {
            descriptionBlocks.push({
              object: "block",
              type: "bulleted_list_item",
              bulleted_list_item: {
                rich_text: [{ type: "text", text: { content: item } }]
              }
            });
          }
        }
      }

      await notion.blocks.children.append({
        block_id: job.id,
        children: [
          {
            object: "block",
            type: "table_of_contents",
            table_of_contents: {}
          },
          {
            object: "block",
            type: "heading_1",
            heading_1: {
              rich_text: [{ type: "text", text: { content: "Job Description" } }]
            }
          },
          ...descriptionBlocks
        ]
      });
    }
    
    return job.id;
  } else {
    // Create new - NO STATUS FIELD (Notion will auto-generate)
    const job = await notion.pages.create({
      parent: { database_id: JOBS_DB_ID },
      properties: {
        "Job Applications": { title: [{ text: { content: title } }] },
        "Companies": { relation: [{ id: companyId }] },
        "Job Role Categorisation": { select: null }, // Leave empty for now
        "Application URL": { url: applyUrl },
        "location": { multi_select: locationStr ? [{ name: locationStr }] : [] },
        "Contact Person": { rich_text: contactPerson ? [{ text: { content: contactPerson } }] : [] },
        "Contact Email": { email: contactEmail || null },
        "DDL": { date: ddl ? { start: ddl } : null }
      }
    });
    
    console.log(`Created new job: ${title} at ${locationStr} for company ${companyId}`);
    
    // Add page content with job description using the template structure
    if (jobDescription) {
      // Convert LinkedIn formatting to proper Notion blocks
      const descriptionBlocks = [];
      
      // Split by line breaks to preserve the original structure
      const lines = jobDescription.split('\n');
      let currentList = [];
      let inList = false;
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        // Check if this is a bullet point
        if (trimmedLine.match(/^[•\-]\s/)) {
          if (!inList) {
            inList = true;
            currentList = [];
          }
          // Extract text after bullet
          const text = trimmedLine.replace(/^[•\-]\s/, '').trim();
          if (text) {
            currentList.push(text);
          }
        } else {
          // If we were building a list, finish it
          if (inList && currentList.length > 0) {
            // Create bulleted list block
            for (const item of currentList) {
              if (item.length > 2000) {
                // Split long list items
                let remaining = item;
                while (remaining.length > 0) {
                  const chunk = remaining.substring(0, 2000);
                  descriptionBlocks.push({
                    object: "block",
                    type: "bulleted_list_item",
                    bulleted_list_item: {
                      rich_text: [{ type: "text", text: { content: chunk } }]
                    }
                  });
                  remaining = remaining.substring(2000);
                }
              } else {
                descriptionBlocks.push({
                  object: "block",
                  type: "bulleted_list_item",
                  bulleted_list_item: {
                    rich_text: [{ type: "text", text: { content: item } }]
                  }
                });
              }
            }
            inList = false;
            currentList = [];
          }
          
          // Handle regular text lines
          if (trimmedLine.length > 2000) {
            // Split long lines into multiple blocks
            let remaining = trimmedLine;
            while (remaining.length > 0) {
              const chunk = remaining.substring(0, 2000);
              descriptionBlocks.push({
                object: "block",
                type: "paragraph",
                paragraph: {
                  rich_text: [{ type: "text", text: { content: chunk } }]
                }
              });
              remaining = remaining.substring(2000);
            }
          } else {
            descriptionBlocks.push({
              object: "block",
              type: "paragraph",
              paragraph: {
                rich_text: [{ type: "text", text: { content: trimmedLine } }]
              }
            });
          }
        }
      }
      
      // Handle any remaining list items
      if (inList && currentList.length > 0) {
        for (const item of currentList) {
          if (item.length > 2000) {
            let remaining = item;
            while (remaining.length > 0) {
              const chunk = remaining.substring(0, 2000);
              descriptionBlocks.push({
                object: "block",
                type: "bulleted_list_item",
                bulleted_list_item: {
                  rich_text: [{ type: "text", text: { content: chunk } }]
                }
              });
              remaining = remaining.substring(2000);
            }
          } else {
            descriptionBlocks.push({
              object: "block",
              type: "bulleted_list_item",
              bulleted_list_item: {
                rich_text: [{ type: "text", text: { content: item } }]
              }
            });
          }
        }
      }

      await notion.blocks.children.append({
        block_id: job.id,
        children: [
          {
            object: "block",
            type: "table_of_contents",
            table_of_contents: {}
          },
          {
            object: "block",
            type: "heading_1",
            heading_1: {
              rich_text: [{ type: "text", text: { content: "Job Description" } }]
            }
          },
          ...descriptionBlocks,
          {
            object: "block",
            type: "heading_1",
            heading_1: {
              rich_text: [{ type: "text", text: { content: "Job Application" } }]
            }
          },
          {
            object: "block",
            type: "heading_2",
            heading_2: {
              rich_text: [{ type: "text", text: { content: "CV" } }]
            }
          },
          {
            object: "block",
            type: "heading_2",
            heading_2: {
              rich_text: [{ type: "text", text: { content: "Portfolio" } }]
            }
          },
          {
            object: "block",
            type: "heading_1",
            heading_1: {
              rich_text: [{ type: "text", text: { content: "Test" } }]
            }
          },
          {
            object: "block",
            type: "heading_2",
            heading_2: {
              rich_text: [{ type: "text", text: { content: "Test Preparation" } }]
            }
          },
          {
            object: "block",
            type: "heading_2",
            heading_2: {
              rich_text: [{ type: "text", text: { content: "Process Review" } }]
            }
          },
          {
            object: "block",
            type: "heading_1",
            heading_1: {
              rich_text: [{ type: "text", text: { content: "Interview" } }]
            }
          },
          {
            object: "block",
            type: "heading_2",
            heading_2: {
              rich_text: [{ type: "text", text: { content: "Preparation" } }]
            }
          },
          {
            object: "block",
            type: "heading_2",
            heading_2: {
              rich_text: [{ type: "text", text: { content: "Process Review" } }]
            }
          }
        ]
      });
    }
    
    return job.id;
  }
}

// Main ingest endpoint - CLEAN AND SIMPLE
app.post("/ingest", async (req, res) => {
  try {
    checkSession();
    
    const { 
      jobUrl, 
      title, 
      companyName, 
      companyUrl, 
      logoUrl, 
      location, 
      applicationType,
      jobDescription,
      contactPerson,
      contactEmail,
      ddl
    } = req.body;
    
    console.log("Received job data:", { title, companyName, applicationType });

    // Always use LinkedIn job URL (simple approach)
    const finalApplicationUrl = jobUrl;
    console.log("Using LinkedIn job URL:", finalApplicationUrl);

    // Create/update company first
    const companyId = await upsertCompany({ 
      name: companyName, 
      url: companyUrl, 
      logo: logoUrl 
    });

    if (!companyId) {
      throw new Error("Failed to create/update company");
    }

    // Now create/update the job (no status field)
    const jobId = await upsertJob({
      title,
      companyId,
      jobUrl,
      applyUrl: finalApplicationUrl,
      locationStr: location,
      jobDescription,
      contactPerson,
      contactEmail,
      ddl
    });

    res.json({ 
      success: true, 
      jobId, 
      companyId,
      applicationUrl: finalApplicationUrl,
      applicationType 
    });
    
  } catch (error) {
    console.error("Ingest error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));