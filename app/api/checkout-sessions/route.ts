import { stripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server' // Use server client for user auth
import { createAdminClient } from '@/lib/supabase/admin' // Use admin client for profile updates
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers' // Import cookies

export async function POST(req: Request) {
  const cookieStore = cookies() // Get cookie store
  const supabase = createClient() // Create server client
  const supabaseAdmin = createAdminClient() // Create admin client

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  const { priceId, quantity = 1 } = await req.json()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!priceId) {
    return new NextResponse(JSON.stringify({ error: 'Missing priceId' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
  if (!appUrl) {
    console.error("Error: NEXT_PUBLIC_APP_URL is not set in environment variables.")
    return new NextResponse(JSON.stringify({ error: 'Internal Server Configuration Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }


  try {
    // Check if user exists as a Stripe customer in our DB, create if not
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (profileError && profileError.code !== 'PGRST116') { // Ignore 'not found' error initially
        console.error('Supabase Profile Fetch Error:', profileError)
        throw profileError; // Rethrow other errors
    }

    let customerId = profile?.stripe_customer_id

    if (!customerId) {
      console.log(`Creating Stripe customer for Supabase user ${user.id}`)
      const customer = await stripe.customers.create({
        email: user.email, // Use user's email
        metadata: { supabaseUUID: user.id }, // Link Stripe customer to Supabase user ID
        name: user.email, // Optional: set name
      })
      customerId = customer.id
      console.log(`Stripe customer created: ${customerId}`)

      // Update profile with Stripe customer ID using Admin client
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)

      if (updateError) {
        console.error('Supabase Profile Update Error:', updateError)
        // Decide if this is critical. Maybe log and continue?
        // For now, we'll throw to indicate a potential issue.
        throw new Error(`Failed to update profile with Stripe customer ID: ${updateError.message}`)
      }
       console.log(`Supabase profile updated for user ${user.id}`)
    } else {
         console.log(`Found existing Stripe customer ID for user ${user.id}: ${customerId}`)
    }

    // Create Stripe Checkout Session
    console.log(`Creating Stripe Checkout session for customer ${customerId} with price ${priceId}`)
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      billing_address_collection: 'required',
      customer: customerId,
      line_items: [{ price: priceId, quantity }],
      mode: 'subscription',
      allow_promotion_codes: true,
      subscription_data: {
        // trial_from_plan: true, // Optional: inherit trial from plan in Stripe dashboard
        metadata: { supabaseUUID: user.id } // Link subscription to Supabase user
      },
      success_url: `${appUrl}/account?session_id={CHECKOUT_SESSION_ID}`, // Redirect to account page on success
      cancel_url: `${appUrl}/subscribe`, // Redirect back to subscription page on cancel
    })
    console.log(`Stripe Checkout session created: ${session.id}`)

    return NextResponse.json({ sessionId: session.id })

  } catch (error: any) {
    console.error('Stripe Checkout Session Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error'
    return new NextResponse(JSON.stringify({ error: errorMessage }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
