# LinkedIn to Notion Job Tracker

Automate your job application tracking by saving LinkedIn job postings directly to your Notion databases with a simple hotkey (Option+N).

## What it does

* Open a LinkedIn Jobs search, click a job (details show on the right)
* Hit **Option+N** (Alt+N) or click the "Save to Notion" button
* Automatically captures: job title, company, company link, logo, location, apply mode & external link, and job description
* Writes to your Notion databases:
  * **Job Application Tracker** - Track all your applications
  * **Companies** - Store company information with icons

## Features

* **No manual typing** - One hotkey saves everything
* **Smart de-duplication** - Prevents duplicate entries
* **Automatic URL detection** - Captures Easy Apply vs External application links
* **Job description extraction** - Preserves formatting and extracts key details
* **Floating save button** - Visual indicator and alternative to hotkey

## Architecture

* **Tampermonkey userscript** → reads fields from LinkedIn's **right panel**, plus the current job URL
* Sends JSON to a **local HTTP relay** (`server.js`) running on your machine
* Relay uses **Notion API** (with your token) to upsert **Companies** and **Jobs**

# Notion Database Structure

### Jobs — "Job Application Tracker"

* `Job Applications` (title) ← job title
* `Companies` (relation → Companies database)
* `Job Role Categorisation` (select) ← (we'll leave empty for now; easy to auto-tag later)
* `Application URL` (url) ← LinkedIn job page URL
* `location` (multi-select) ← auto-create options
* `Requirements` (text) ← job requirements/description
* `Contact Person` (text) ← contact person name
* `Contact Email` (email) ← contact email address
* `DDL` (date) ← application deadline
* `Created time` (created time) ← auto-generated
* `Last edited time` (last edited time) ← auto-generated

### Companies

* `Name` (title) ← company name
* `Industry` (multi-select) ← company industry (if found)
* `Company link` (url) ← LinkedIn company page
* `Job Application Tracker` (relation) ← links back to jobs
* **Icon** ← set from company logo URL

## De-dup logic (no extra fields)

* **Companies**: match by `Company link` first; else canonicalize name (lowercase, strip `llc/ltd/plc/inc/co/corp`) to merge **"Google"** and **"Google LLC"**
* **Jobs** (within a company): update if an existing row has **same title** *and* (**same Application URL** or **same primary location**). Else create a new row

## Repo layout
linkedin2notion/
├─ Dockerfile
├─ package.json
├─ server.js # Express + Notion API integration
├─ scripts/
│ └─ tampermonkey.user.js # adds "Save to Notion" button + Option+N
├─ storage/ # holds storage/state.json (LinkedIn session)
├─ .env.example # template for secrets
└─ README.md # this file

## Secrets (.env)

Create `.env` in the repo root (don't commit it):
```
NOTION_TOKEN=secret_xxx_from_notion_integration
JOBS_DB_ID=24d756c8c8c380d3ac87e2c5c0af366c
COMPANIES_DB_ID=24d756c8c8c380d3ac87e2c5c0af366d
```

## Quick start

1. **Share both DBs with your integration** (critical)
2. **Install dependencies**: `npm i`
3. **Create .env file** with your Notion credentials
4. **Start server**: `npm start` or `node server.js`
5. **Install Tampermonkey + paste the userscript**
6. **Test**: go to LinkedIn Jobs, click a job, press Option+N

## How it works

1. **Userscript** adds a "Save to Notion" button to LinkedIn Jobs
2. **Click button or press Option+N** → scrapes job details from right panel
3. **Sends to local server** → server processes data and calls Notion API
4. **Server calls Notion API** → creates/updates company + job entries
5. **Smart de-duplication** → no duplicate companies or jobs

## Troubleshooting

* **"Missing required environment variables"** → check your .env file
* **"Notion 401/403"** → check token + DB sharing
* **Button not visible** → check Tampermonkey is enabled + no exclusions
* **Wrong data** → check console for debugging output
* **API validation errors** → ensure your Notion database structure matches the expected schema

## Recent Updates

* **Removed Status field** - No more "Status is expected to be status" errors
* **Simplified data flow** - Direct Notion API integration without complex MCP layers
* **Enhanced job description extraction** - Better formatting preservation
* **Improved location detection** - More reliable location extraction from various sources