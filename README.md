# LinkedIn to Notion Job Tracker

Automate your job application tracking by saving LinkedIn job postings directly to your Notion databases with a simple hotkey (Option+N).

## What it does

* Open a LinkedIn Jobs search, click a job (details show on the right)
* Hit **Option+N** (Alt+N) or click the "Save to Notion" button
* Automatically captures: job title, company, company link, logo, location, apply mode & external link, and industry
* Writes to your Notion databases:
  * **Job Application Tracker** - Track all your applications
  * **Companies** - Store company information with icons and industry

## Features

* **No manual typing** - One hotkey saves everything
* **Smart de-duplication** - Prevents duplicate entries
* **Automatic URL detection** - Captures Easy Apply vs External application links
* **Company industry detection** - Best-effort industry identification
* **Floating save button** - Visual indicator and alternative to hotkey

## Architecture

* **Tampermonkey userscript** → Reads job details from LinkedIn's right panel
* **Local HTTP relay** → Uses Playwright to detect application types and fetch company info
* **Notion API integration** → Writes to your databases with proper relations

## Quick Start

1. **Setup Notion Integration**
   - Create a Notion internal integration
   - Share your databases with the integration
   - Get your API token and database IDs

2. **Install Dependencies**
   ```bash
   docker build -t linkedin2notion .
   ```

3. **Login to LinkedIn**
   ```bash
   docker run --rm -it -p 8787:8787 \
     -v "$PWD/storage:/app/storage" \
     --env-file .env linkedin2notion npm run login
   ```

4. **Start the Server**
   ```bash
   docker run --rm -it -p 8787:8787 \
     -v "$PWD/storage:/app/storage" \
     --env-file .env linkedin2notion
   ```

5. **Install Tampermonkey Script**
   - Install Tampermonkey browser extension
   - Create new script and paste `userscripts/tampermonkey.user.js`
   - Navigate to LinkedIn Jobs and use **Option+N**

## Configuration

Create a `.env` file with:
NOTION_TOKEN=your_notion_integration_token
JOBS_DB_ID=your_job_tracker_database_id
COMPANIES_DB_ID=your_companies_database_id
PORT=8787


## Usage

1. Open LinkedIn Jobs search
2. Click on a job posting (details appear on right)
3. Press **Option+N** or click "Save to Notion" button
4. See confirmation toast: "Saved to Notion ✓"
5. Check your Notion databases for the new entries

## Requirements

* Docker
* Tampermonkey browser extension
* Notion account with internal integration
* LinkedIn account

## License

MIT License - Feel free to modify and distribute