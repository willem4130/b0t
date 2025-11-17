# Facebook Integration Setup Guide

This guide will help you configure Facebook credentials for the **Iconic Festival** workflow and other Facebook integrations.

## Prerequisites

- A Facebook Page (Business or Personal)
- Facebook Developer Account
- App created in Facebook Developer Portal

## Step 1: Create a Facebook App

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Click **My Apps** → **Create App**
3. Select **Business** as the app type
4. Fill in app details:
   - **App Name**: "b0t Workflow Automation" (or your choice)
   - **App Contact Email**: Your email
   - **Business Account**: Optional

## Step 2: Add Facebook Login Product

1. In your app dashboard, click **Add Product**
2. Find **Facebook Login** and click **Set Up**
3. Select **Web** as the platform
4. Enter your website URL (for development: `http://localhost:3000`)

## Step 3: Get Page Access Token

### Method 1: Graph API Explorer (Quick)

1. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your app from the dropdown
3. Click **Generate Access Token**
4. Request these permissions:
   - `pages_read_engagement` (Required for reading posts/comments)
   - `pages_manage_posts` (Optional - for posting/replying)
   - `pages_manage_metadata` (Optional - for page insights)
5. Click **Generate Access Token** and authorize
6. Copy the **User Access Token** (starts with `EAAA...`)
7. Click **Get Page Access Token** to convert to Page Token
8. Select your page and copy the **Page Access Token**

### Method 2: Long-Lived Token (Production)

For production use, generate a long-lived page token:

```bash
# 1. Exchange short-lived user token for long-lived token
curl -X GET "https://graph.facebook.com/v21.0/oauth/access_token?\
grant_type=fb_exchange_token&\
client_id=YOUR_APP_ID&\
client_secret=YOUR_APP_SECRET&\
fb_exchange_token=YOUR_SHORT_LIVED_TOKEN"

# 2. Get Page ID
curl -X GET "https://graph.facebook.com/v21.0/me/accounts?\
access_token=YOUR_LONG_LIVED_USER_TOKEN"

# 3. Get Page Access Token (never expires)
curl -X GET "https://graph.facebook.com/v21.0/YOUR_PAGE_ID?\
fields=access_token&\
access_token=YOUR_LONG_LIVED_USER_TOKEN"
```

## Step 4: Add Credentials to b0t

### Via Web UI (Recommended)

1. Start the development server:
   ```bash
   npm run dev:full
   ```

2. Navigate to: http://localhost:3000/dashboard/credentials

3. Click **Add Credential**

4. Fill in the form:
   - **Platform**: Select "Facebook" from the dropdown
   - **Name**: "Iconic Festival Page Token" (or your choice)
   - **Page Access Token**: Paste your token (starts with `EAAxxxxx...`)

5. Click **Save**

### Via Environment Variable (Development Only)

Add to `.env.local`:
```bash
FACEBOOK_ACCESS_TOKEN=EAAxxxxx...
```

## Step 5: Configure the Workflow

1. Navigate to: http://localhost:3000/dashboard/workflows

2. Find the **Iconic Festival** workflow

3. Click **Edit**

4. Update these fields:
   - **Facebook Page ID**: Your Page ID (found in Page Settings → About)
   - **Slack Channel ID**: Your Slack channel (e.g., `C01ABC123DEF`)

5. Click **Save**

6. Change workflow status from **Draft** to **Active**

## Step 6: Test the Workflow

### Manual Test Run

```bash
# Find the workflow ID
npx tsx scripts/list-workflows.ts

# Run a test
npx tsx scripts/test-workflow.ts <workflow-id>
```

### Expected Behavior

The workflow will:
1. ✅ Fetch your 5 most recent Facebook posts
2. ✅ Extract all comments (up to 100 per post)
3. ✅ Analyze sentiment using AI
4. ✅ Filter very positive/negative comments
5. ✅ Send Slack alerts for actionable comments
6. ✅ Return a table of flagged comments

## Troubleshooting

### Error: "Facebook access token not configured"

- **Solution**: Add credentials via the web UI (Settings → Credentials)
- Platform must be exactly: `facebook` (lowercase)

### Error: "Invalid OAuth access token"

- **Cause**: Token expired or invalid permissions
- **Solution**: Generate a new Page Access Token with correct permissions
- **Required Permission**: `pages_read_engagement`

### Error: "Unsupported get request"

- **Cause**: Invalid Page ID or token doesn't have access to the page
- **Solution**:
  1. Verify your Page ID in Facebook Page Settings
  2. Ensure the token was generated for the correct page
  3. Check that your app has been added to the page

### No comments found

- **Cause**: Posts have no comments or privacy settings
- **Solution**:
  1. Ensure your page has public posts with comments
  2. Check that comments are not hidden/disabled
  3. Verify API permissions include `pages_read_engagement`

## Finding Your Facebook Page ID

### Method 1: Page Settings
1. Go to your Facebook Page
2. Click **Settings** → **About**
3. Scroll down to **Page ID**

### Method 2: Graph API
```bash
curl -X GET "https://graph.facebook.com/v21.0/me/accounts?\
access_token=YOUR_USER_TOKEN"
```

## Security Best Practices

1. **Never commit tokens** to version control
2. **Use long-lived Page Tokens** for production
3. **Rotate tokens** every 60-90 days
4. **Limit permissions** to only what's needed
5. **Monitor API usage** in Facebook Developer Portal

## API Rate Limits

Facebook enforces the following rate limits:
- **200 calls per hour** per user token
- Circuit breaker activates after **50% errors**
- Rate limiter prevents exceeding limits

The Facebook module includes built-in:
- ✅ Rate limiting (200 calls/hour)
- ✅ Circuit breaker protection
- ✅ Automatic retries
- ✅ Error logging

## Required Permissions

| Permission | Purpose | Required |
|------------|---------|----------|
| `pages_read_engagement` | Read posts, comments, reactions | ✅ Yes |
| `pages_manage_posts` | Reply to comments, create posts | Optional |
| `pages_manage_metadata` | Read page insights/analytics | Optional |

## Support

If you encounter issues:
1. Check the server logs: `npm run dev:full`
2. Verify credentials in the database
3. Test API token in Graph API Explorer
4. Review Facebook Developer Console for errors

## Next Steps

Once configured, you can:
- ✅ Monitor Facebook engagement automatically
- ✅ Get Slack alerts for important comments
- ✅ Build custom Facebook workflows
- ✅ Integrate with other b0t modules

Happy automating! 🚀
