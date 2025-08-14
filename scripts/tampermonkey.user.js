// ==UserScript==
// @name         LinkedIn → Notion (Option+N)
// @namespace    leslie.linkedin.notion
// @match        https://www.linkedin.com/jobs/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// ==/UserScript==

(function () {
    const ENDPOINT = "http://localhost:8787/ingest";
  
    function scrapeFromRightPanel(){
    console.log("=== Starting LinkedIn scraping ===");

    // Job title - look for the main heading anywhere on the page
    const title = document.querySelector('h1')?.textContent?.trim() || 
                  document.querySelector('.text-heading-large')?.textContent?.trim() || 
                  document.querySelector('[data-test-job-details-title]')?.textContent?.trim() || "";
    console.log("Title found:", title);

    // Company name + link + logo - smart detection
    let companyName = "";
    let companyUrl = "";
    let logoUrl = "";

    // Method 1: Look for company link by href pattern
    const companyLink = document.querySelector('a[href*="/company/"]');
    if (companyLink) {
      companyUrl = new URL(companyLink.getAttribute('href'), location.origin).href;
      
      // Extract company name from the link text
      companyName = companyLink.textContent?.trim();
      
      // If textContent is empty, extract from URL
      if (!companyName && companyLink.href) {
        const urlParts = companyLink.href.split('/');
        const companySlug = urlParts[urlParts.length - 2];
        if (companySlug) {
          companyName = companySlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }
      }
      
      // Look for logo near the company link
      const logoImg = companyLink.querySelector('img') || 
                     companyLink.closest('div')?.querySelector('img') ||
                     companyLink.parentElement?.querySelector('img');
      if (logoImg) {
        logoUrl = logoImg.src;
      }
    }
    
    console.log("Company name:", companyName);
    console.log("Company URL:", companyUrl);
    console.log("Logo URL:", logoUrl);

    // Job URL - FIXED to get the actual job URL from the right panel only
    let jobUrl = "";
    
    // Method 1: Look for the job title link in the right panel specifically
    const rightPanel = document.querySelector('[data-job-details]') || 
                       document.querySelector('.jobs-unified-top-card') ||
                       document.querySelector('.job-details-jobs-unified-top-card') ||
                       document.querySelector('[class*="job-details"]');
    
    if (rightPanel) {
      // Look for job title link within the right panel only
      const jobTitleLink = rightPanel.querySelector('a[href*="/jobs/view/"]') ||
                           rightPanel.querySelector('h1 a[href*="/jobs/"]') ||
                           rightPanel.querySelector('[data-test-job-details-title] a[href*="/jobs/"]');
      
      if (jobTitleLink) {
        jobUrl = new URL(jobTitleLink.getAttribute('href'), location.origin).href;
        console.log("Job URL extracted from right panel title link:", jobUrl);
      } else {
        // Method 2: Look for any job link in the right panel
        const anyJobLink = rightPanel.querySelector('a[href*="/jobs/view/"]') ||
                          rightPanel.querySelector('a[href*="/jobs/"]');
        if (anyJobLink) {
          jobUrl = new URL(anyJobLink.getAttribute('href'), location.origin).href;
          console.log("Job URL extracted from right panel job link:", jobUrl);
        }
      }
    }
    
    // Method 3: If still no URL, use the current page URL (most reliable fallback)
    if (!jobUrl) {
      jobUrl = window.location.href.split('?')[0];
      console.log("Job URL fallback to current page:", jobUrl);
    }

    console.log("Final Job URL:", jobUrl);

    // Application Type Detection
    let applicationType = "";
    const applyButton = document.querySelector('#jobs-apply-button-id');
    if (applyButton) {
      const buttonText = applyButton.querySelector('.artdeco-button__text')?.textContent?.trim() || "";
      console.log("Apply button text:", buttonText);
      
      if (buttonText === "Easy Apply") {
        applicationType = "Easy Apply";
      } else if (buttonText === "Apply") {
        applicationType = "External Application";
      }
    } else {
      applicationType = "No Apply Button";
    }
    console.log("Application Type:", applicationType);

    // Location - SIMPLE: find any text with comma and take everything before first comma
      let locationText = "";
    
    // Method 1: Look for location in the job header area (most reliable)
    const jobHeader = document.querySelector('.job-details-jobs-unified-top-card__primary-description-container') ||
                      document.querySelector('[class*="job-header"]') ||
                      document.querySelector('[class*="job-location"]') ||
                      document.querySelector('.jobs-unified-top-card__job-insight--highlighted');
    
    if (jobHeader) {
      const headerText = jobHeader.textContent;
      console.log("Job header text:", headerText);
      
      // Find first comma and take everything before it
      const commaIndex = headerText.indexOf(',');
      if (commaIndex > -1) {
        locationText = headerText.substring(0, commaIndex).trim();
        console.log("Location found in header (before comma):", locationText);
      }
    }
    
    // Method 2: Look for location in job insights
    if (!locationText) {
      const insights = document.querySelectorAll('[class*="job-insight"], [class*="job-benefit"], [class*="job-detail"]');
      console.log("Found insights elements:", insights.length);
      
      for (const insight of insights) {
        const text = insight.textContent?.trim();
        console.log("Insight text:", text);
        
        // Find first comma and take everything before it
        const commaIndex = text.indexOf(',');
        if (commaIndex > -1) {
          locationText = text.substring(0, commaIndex).trim();
          console.log("Location found in insights (before comma):", locationText);
          break;
        }
      }
    }
    
    // Method 3: Look in job description for any text with comma
    if (!locationText) {
      const jobDesc = document.querySelector('p[dir="ltr"], .description__text, .show-more-less-text');
      if (jobDesc) {
        const descText = jobDesc.textContent;
        // Find first comma and take everything before it
        const commaIndex = descText.indexOf(',');
        if (commaIndex > -1) {
          locationText = descText.substring(0, commaIndex).trim();
          console.log("Location found in description (before comma):", locationText);
        }
      }
    }
    
    // Method 4: Look for location in the page title
    if (!locationText) {
      const pageTitle = document.title;
      console.log("Page title:", pageTitle);
      // Find first comma and take everything before it
      const commaIndex = pageTitle.indexOf(',');
      if (commaIndex > -1) {
        locationText = pageTitle.substring(0, commaIndex).trim();
        console.log("Location found in page title (before comma):", locationText);
      }
    }
    
    // Clean up the location text
    if (locationText) {
      locationText = locationText
        .replace(/Filter results by:\s*/gi, '')
        .replace(/Filter by\s*/gi, '')
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      console.log("Final location found:", locationText);
    }

    // Job Description - ENHANCED with better formatting preservation
    let jobDescription = "";
    const descElement = document.querySelector("#job-details > div > p") ||
                       document.querySelector('p[dir="ltr"]') ||
                       document.querySelector('.description__text') ||
                       document.querySelector('.show-more-less-text') ||
                       document.querySelector('[class*="job-description"]');
    
    if (descElement) {
      // Enhanced formatting preservation for better Notion integration
      let htmlContent = descElement.innerHTML;
      
      // Clean up HTML while preserving structure
      htmlContent = htmlContent
        // Remove HTML comments
        .replace(/<!---->/g, '')
        // Replace <br> and <span><br></span> with double line breaks for paragraph separation
        .replace(/<span><br><\/span>/g, '\n\n')
        .replace(/<br>/g, '\n\n')
        // Replace <strong> tags with ** for emphasis
        .replace(/<strong>/g, '**')
        .replace(/<\/strong>/g, '**')
        // Replace <em> tags with * for emphasis
        .replace(/<em>/g, '*')
        .replace(/<\/em>/g, '*')
        // Handle lists properly
        .replace(/<ul>/g, '\n')
        .replace(/<\/ul>/g, '\n')
        .replace(/<ol>/g, '\n')
        .replace(/<\/ol>/g, '\n')
        .replace(/<li>/g, '\n• ')
        .replace(/<\/li>/g, '')
        // Handle headings
        .replace(/<h[1-6]>/g, '\n\n')
        .replace(/<\/h[1-6]>/g, '\n\n')
        // Remove other HTML tags but keep their content
        .replace(/<[^>]*>/g, '')
        // Clean up multiple line breaks (keep double breaks for paragraphs)
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        // Clean up extra spaces within lines
        .replace(/[ \t]+/g, ' ')
        // Trim whitespace
        .trim();
      
      jobDescription = htmlContent;
      console.log("Job description extracted with enhanced formatting:", jobDescription.substring(0, 300) + "...");
    } else {
      console.log("No job description element found");
    }

    // Contact Person - look for in description (simplified)
    let contactPerson = "";
    if (jobDescription) {
      const contactMatch = jobDescription.match(/(?:contact|reach out to|email|message)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
      if (contactMatch) {
        contactPerson = contactMatch[1];
      }
    }
    console.log("Contact Person found:", contactPerson);

    // Contact Email - look for in description (simplified)
    let contactEmail = "";
    if (jobDescription) {
      const emailMatch = jobDescription.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
      if (emailMatch) {
        contactEmail = emailMatch[1];
      }
    }
    console.log("Contact Email found:", contactEmail);

    // DDL - look for deadline in description (simplified)
    let ddl = "";
    if (jobDescription) {
      const deadlineMatch = jobDescription.match(/(?:deadline|apply by|closing|due|until)\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})/i);
      if (deadlineMatch) {
        ddl = deadlineMatch[1];
      }
    }
    console.log("DDL found:", ddl);

    // SIMPLIFIED RESULT - ready for Notion integration
    const result = { 
      jobUrl, 
      title, 
      companyName, 
      companyUrl, 
      logoUrl, 
      location: locationText,
      applicationType,
      jobDescription,
      contactPerson,
      contactEmail,
      ddl
    };
    
    console.log("Final result:", result);
    return result;
  }

  async function send(data){
    try {
      // FINAL SAFETY CHECK: Ensure no HTML content in any field before sending
      const dataToSend = { ...data };
      for (const [key, value] of Object.entries(dataToSend)) {
        if (typeof value === 'string' && (value.includes('<') || value.includes('<!DOCTYPE') || value.includes('<html'))) {
          console.error(`Field ${key} contains HTML content, cleaning...`);
          dataToSend[key] = value.replace(/<[^>]*>/g, '').trim();
        }
      }
      
      console.log("Final cleaned data to send:", dataToSend);
      
      // Send data to Notion via local server
      GM_xmlhttpRequest({
        method: "POST",
        url: ENDPOINT,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify(dataToSend),
        onload: r => alert(r.status < 300 ? "Saved to Notion ✓" : "Failed: " + r.responseText),
        onerror: () => alert("Failed: network error")
      });
    } catch (error) {
      console.error("Error in send function:", error);
      alert("Failed: " + error.message);
    }
  }
  
    function addButton(){
      if (document.getElementById("li2notion")) return;
      const b = document.createElement("button");
      b.id = "li2notion";
      b.textContent = "Save to Notion";
      Object.assign(b.style, {
      position:"fixed",
      right:"16px",
      bottom:"16px",
      zIndex:999999,
      padding:"10px 14px",
      border:"0",
      borderRadius:"10px",
      backgroundColor:"#0073b1", // LinkedIn blue
      color:"white", // White text
      fontSize:"14px",
      fontWeight:"600",
      boxShadow:"0 6px 16px rgba(0,0,0,.2)",
      cursor:"pointer"
      });
      b.onclick = () => send(scrapeFromRightPanel());
      document.body.appendChild(b);
    }
  
  // Add hotkey support
    window.addEventListener("keydown", (e)=>{
      if (e.altKey && e.key.toLowerCase()==="n") {
        e.preventDefault();
        send(scrapeFromRightPanel());
      }
    });
  
    const iv = setInterval(()=>{
      addButton();
      // re-bind as LI swaps the right panel with AJAX
    }, 1200);
  })();