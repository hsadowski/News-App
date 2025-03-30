import { stripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server' // Use server client for user auth & profile fetch
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers' // Import cookies

export async function POST(req: Request) { // Changed to POST as it initiates an action
  const cookieStore = cookies() // Get cookie store
  const supabase = createClient() // Create server client

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    console.error("Error: NEXT_PUBLIC_APP_URL is not set in environment variables.")
    return new NextResponse(JSON.stringify({ error: 'Internal Server Configuration Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    // Fetch the user's Stripe Customer ID from their profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (profileError) {
        console.error(`Error fetching profile for user ${user.id}:`, profileError)
        // Handle case where profile might not exist or other DB errors
        return new NextResponse(JSON.stringify({ error: 'Failed to retrieve user profile.' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    if (!profile?.stripe_customer_id) {
      console.warn(`User ${user.id} does not have a Stripe customer ID. Cannot create portal link.`)
      // This might happen if the user hasn't subscribed yet.
      return new NextResponse(JSON.stringify({ error: 'Stripe customer ID not found for user. Have you subscribed?' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const stripeCustomerId = profile.stripe_customer_id
    console.log(`Creating Stripe Billing Portal session for customer ${stripeCustomerId}`)

    // Create a Billing Portal session
    const { url } = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${appUrl}/account`, // Redirect back to the user's account page
    })

    console.log(`Stripe Billing Portal session created. URL: ${url}`)
    return NextResponse.json({ url })

  } catch (error: any) {
    console.error('Stripe Billing Portal Session Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error'
    return new NextResponse(JSON.stringify({ error: errorMessage }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
