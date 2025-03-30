import { createClient } from '@/lib/supabase/server'
import axios from 'axios'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers' // Import cookies

// Basic In-memory Caching (Replace with Redis/Upstash for production)
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_DURATION_MS = {
  search: 15 * 60 * 1000, // 15 minutes for search results
  page: 6 * 60 * 60 * 1000, // 6 hours for specific page details
  titles: 24 * 60 * 60 * 1000, // 24 hours for newspaper titles/metadata
  default: 60 * 60 * 1000, // 1 hour default
};

// Function to determine cache duration based on endpoint
function getCacheDuration(endpoint: string): number {
  if (endpoint.startsWith('search/pages/results') || endpoint.startsWith('search/titles/results')) {
    return CACHE_DURATION_MS.search;
  } else if (endpoint.includes('/seq-')) { // Assuming endpoints with sequence numbers are page details
    return CACHE_DURATION_MS.page;
  } else if (endpoint.startsWith('newspapers') || endpoint.startsWith('lccn')) {
    return CACHE_DURATION_MS.titles;
  }
  return CACHE_DURATION_MS.default;
}


export async function GET(request: NextRequest) {
  const cookieStore = cookies() // Get cookie store
  const supabase = createClient() // Create server client

  const { data: { user } } = await supabase.auth.getUser()

  // --- Subscription Check (Example) ---
  // This check is basic. You might need more complex logic based on tiers or specific features.
  let hasActiveSubscription = false;
  if (user) {
    try {
      const { data: subscription, error: subError } = await supabase
        .from('subscriptions')
        .select('status')
        .in('status', ['active', 'trialing']) // Check for active or trialing status
        .eq('user_id', user.id)
        .maybeSingle() // Use maybeSingle to handle null case gracefully

      if (subError) {
        console.error("Proxy: Error fetching subscription status:", subError);
        // Decide how to handle DB errors - fail open or closed? For now, assume no subscription.
      }
      hasActiveSubscription = !!subscription; // True if a subscription record with 'active' or 'trialing' status exists
      console.log(`Proxy: User ${user.id} subscription status check. Active/Trialing: ${hasActiveSubscription}`);

    } catch (dbError) {
        console.error("Proxy: Database error during subscription check:", dbError);
        // Fail open or closed? Assume no subscription on error.
    }
  } else {
     console.log("Proxy: No user session found for subscription check.");
  }

  // --- Prepare API Request ---
  const searchParams = request.nextUrl.searchParams
  // Extract the target Chronicling America endpoint path from the query params
  const endpointPath = searchParams.get('endpoint')
  searchParams.delete('endpoint') // Remove our internal param before forwarding

  if (!endpointPath) {
     return new NextResponse(JSON.stringify({ error: 'Missing required "endpoint" query parameter' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  // --- Access Control Logic (Example) ---
  // Deny access to OCR text for non-subscribers
  if (endpointPath.endsWith('/ocr.txt') && !hasActiveSubscription) {
     console.log(`Proxy: Denying access to OCR endpoint ${endpointPath} for non-subscriber.`);
     return new NextResponse(JSON.stringify({ error: 'Subscription required for OCR text access' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  }
  // Add more rules here based on subscription tiers or features if needed

  // Construct the full URL for the Chronicling America API
  const baseApiUrl = 'https://chroniclingamerica.loc.gov'
  const queryString = searchParams.toString()
  // Ensure format=json is always included unless the endpoint is for raw text/pdf
  const formatParam = (endpointPath.endsWith('.txt') || endpointPath.endsWith('.pdf') || endpointPath.endsWith('.jp2')) ? '' : 'format=json';
  const finalQueryString = [queryString, formatParam].filter(Boolean).join('&');
  const fullUrl = `${baseApiUrl}/${endpointPath}${finalQueryString ? '?' + finalQueryString : ''}`

  // --- Caching Logic ---
  const cacheDuration = getCacheDuration(endpointPath);
  const cached = cache.get(fullUrl)
  if (cached && Date.now() - cached.timestamp < cacheDuration) {
    console.log(`Proxy: Cache HIT for ${fullUrl}`)
    // Determine content type based on endpoint
    const contentType = endpointPath.endsWith('.txt') ? 'text/plain' : 'application/json';
    return new NextResponse(contentType === 'text/plain' ? cached.data : JSON.stringify(cached.data), {
        status: 200,
        headers: { 'Content-Type': contentType, 'X-Cache-Status': 'HIT' }
    });
  }
  console.log(`Proxy: Cache MISS for ${fullUrl}`)

  // --- Forward Request to API ---
  try {
    console.log(`Proxy: Forwarding request to ${fullUrl}`)
    const response = await axios.get(fullUrl, {
        timeout: 15000, // 15 second timeout
        responseType: endpointPath.endsWith('.txt') ? 'text' : 'json' // Get raw text for .txt endpoints
    })

    // Cache the successful response
    cache.set(fullUrl, { data: response.data, timestamp: Date.now() })
    console.log(`Proxy: Caching response for ${fullUrl}`)

    // Return the response from Chronicling America
    const contentType = response.headers['content-type'] || (endpointPath.endsWith('.txt') ? 'text/plain' : 'application/json');
    return new NextResponse(contentType.includes('json') ? JSON.stringify(response.data) : response.data, {
        status: response.status,
        headers: { 'Content-Type': contentType, 'X-Cache-Status': 'MISS' }
    });

  } catch (error: any) {
    console.error(`Proxy: Error fetching from Chronicling America (${fullUrl}):`, error.response?.status, error.message)
    // Handle specific errors (e.g., 404, timeout, 429 rate limit)
    const status = error.response?.status || 502; // Default to Bad Gateway
    let errorMessage = 'Failed to fetch data from Chronicling America';
    if (status === 404) errorMessage = 'Resource not found at Chronicling America';
    if (error.code === 'ECONNABORTED') errorMessage = 'Request to Chronicling America timed out';
    if (status === 429) errorMessage = 'Rate limit exceeded when contacting Chronicling America';

    return new NextResponse(JSON.stringify({ error: errorMessage }), { status: status, headers: { 'Content-Type': 'application/json' } })
  }
}
