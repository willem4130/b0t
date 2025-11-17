/**
 * Lead Generation & Enrichment Modules
 *
 * Comprehensive lead generation toolkit with 8 specialized modules
 * for finding, enriching, and qualifying B2B leads.
 *
 * @module leads
 */

// Hunter.io - Email finder and verification (6 functions)
export * as hunter from './hunter';

// Apollo.io - B2B lead database (8 functions)
export * as apollo from './apollo';

// Clearbit - Company and person enrichment (6 functions)
export * as clearbit from './clearbit';

// ZoomInfo - B2B database with technographics (8 functions)
export * as zoominfo from './zoominfo';

// Lusha - Contact finder with phone numbers (7 functions)
export * as lusha from './lusha';

// Proxycurl - LinkedIn scraper (8 functions)
export * as proxycurl from './proxycurl';

// PhantomBuster - Web automation (8 functions)
export * as phantombuster from './phantombuster';

// Apify - Web scraping platform (9 functions)
export * as apify from './apify';

/**
 * Module Summary:
 *
 * hunter:
 *   - findEmail: Find email for person at company
 *   - verifyEmail: Verify email deliverability
 *   - domainSearch: Search emails at domain
 *   - getEmailCount: Get email count for domain
 *   - bulkVerify: Verify multiple emails
 *   - getAccountInfo: Get API usage info
 *   - searchLeads: Search leads by company
 *   - validateEmailFormat: Validate email format
 *
 * apollo:
 *   - searchPeople: Search for people in database
 *   - enrichContact: Enrich contact information
 *   - getCompanyInfo: Get company information
 *   - createContact: Create a contact
 *   - searchCompanies: Search for companies
 *   - getEmail: Reveal email for person
 *   - getJobPostings: Get job postings for company
 *
 * clearbit:
 *   - enrichPerson: Enrich person from email
 *   - enrichCompany: Enrich company from domain
 *   - revealCompany: Reveal company from IP
 *   - getCombinedEnrichment: Get person + company data
 *   - autocompleteCompany: Autocomplete company names
 *   - findPersonByName: Find person by name and domain
 *   - getCompanyLogo: Get company logo URL
 *   - validateDomain: Validate domain format
 *
 * zoominfo:
 *   - searchContacts: Search for contacts
 *   - enrichCompany: Enrich company information
 *   - getTechnographics: Get technology stack
 *   - getContactDetails: Get contact details by ID
 *   - searchCompanies: Search for companies
 *   - getIntentData: Get buying signals
 *   - getScoops: Get company news and events
 *
 * lusha:
 *   - enrichContact: Enrich contact information
 *   - findEmail: Find email by name and company
 *   - findPhone: Find phone by name and company
 *   - bulkEnrich: Bulk enrich contacts
 *   - enrichCompany: Enrich company information
 *   - enrichFromLinkedIn: Enrich from LinkedIn URL
 *   - getCreditBalance: Get API credit balance
 *
 * proxycurl:
 *   - getProfile: Get LinkedIn profile data
 *   - getCompany: Get LinkedIn company data
 *   - searchPeople: Search for people on LinkedIn
 *   - getPosts: Get LinkedIn posts
 *   - getContactInfo: Get contact info from profile
 *   - getCompanyEmployees: Get company employees
 *   - resolveProfileFromEmail: Find LinkedIn from email
 *   - searchCompanies: Search for companies
 *
 * phantombuster:
 *   - launchPhantom: Launch a Phantom (scraper)
 *   - getPhantomStatus: Get Phantom execution status
 *   - getPhantomOutput: Get Phantom results
 *   - listPhantoms: List all Phantoms
 *   - stopPhantom: Stop a running Phantom
 *   - getAgent: Get Agent details
 *   - launchAndWait: Launch and wait for completion
 *   - getAgentCsvOutput: Get Agent CSV output
 *
 * apify:
 *   - runActor: Run an Actor (scraper)
 *   - getActorRun: Get Actor run status
 *   - getDatasetItems: Get scraping results
 *   - listActors: List available Actors
 *   - waitForRun: Wait for Actor completion
 *   - runActorAndWait: Run and wait for completion
 *   - getKeyValueStoreItem: Get KV store item
 *   - abortActorRun: Abort an Actor run
 *
 * Environment Variables Required:
 *   - HUNTER_API_KEY
 *   - APOLLO_API_KEY
 *   - CLEARBIT_API_KEY
 *   - ZOOMINFO_API_KEY
 *   - LUSHA_API_KEY
 *   - PROXYCURL_API_KEY
 *   - PHANTOMBUSTER_API_KEY
 *   - APIFY_API_KEY
 */
