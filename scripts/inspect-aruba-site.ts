#!/usr/bin/env tsx
/**
 * Inspect Aruba Listings Site
 * Uses Playwright to fetch and analyze the actual HTML structure
 */

import { chromium } from 'playwright';

async function inspectSite() {
  console.log('🔍 Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('📡 Navigating to arubalistings.com/rent...');
    await page.goto('https://arubalistings.com/rent', { waitUntil: 'networkidle' });

    console.log('⏳ Waiting for content to load...');
    await page.waitForTimeout(3000);

    // Get the HTML
    const html = await page.content();
    console.log(`\n📄 HTML Length: ${html.length} characters\n`);

    // Find common listing patterns
    console.log('🔍 Searching for listing elements...\n');

    const patterns = [
      'div[class*="listing"]',
      'div[class*="property"]',
      'div[class*="card"]',
      'article',
      'div[class*="item"]',
      '[data-listing]',
      '[data-property]'
    ];

    for (const pattern of patterns) {
      const count = await page.locator(pattern).count();
      if (count > 0) {
        console.log(`✅ Found ${count} elements matching: ${pattern}`);

        // Get first element's classes
        if (count > 0) {
          const firstElement = page.locator(pattern).first();
          const className = await firstElement.getAttribute('class');
          console.log(`   First element classes: ${className}`);
        }
      }
    }

    // Check for specific text
    console.log('\n🏠 Checking for rental-related text...');
    const hasRent = await page.locator('text=/rent|rental|bedroom|price/i').count();
    console.log(`Found ${hasRent} elements with rental-related text`);

    // Save HTML for manual inspection
    const fs = await import('fs');
    fs.writeFileSync('/tmp/aruba-listings.html', html);
    console.log('\n💾 Saved HTML to /tmp/aruba-listings.html');

    // Get page title
    const title = await page.title();
    console.log(`\n📋 Page title: ${title}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
    console.log('\n✅ Done!');
  }
}

inspectSite();
