import { stripe } from '@/lib/stripe'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { buffer } from 'node:stream/consumers'
import { createAdminClient } from '@/lib/supabase/admin' // Use admin client for DB updates

// Helper function to update user subscription status in Supabase
// IMPORTANT: This function interacts directly with your database using admin privileges.
async function manageSubscriptionStatusChange(
  subscriptionId: string,
  customerId: string,
  isCheckoutSession = false // Flag to differentiate initial creation via checkout
) {
  const supabaseAdmin = createAdminClient() // Use admin client for elevated privileges

  console.log(`Webhook: Managing subscription change for Stripe Sub ID: ${subscriptionId}, Customer ID: ${customerId}`)

  // Get user UUID from Stripe customer ID stored in our profiles table
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id') // Select the Supabase user ID (uuid)
    .eq('stripe_customer_id', customerId)
    .single()

  if (profileError) {
    // If profile not found, it might be a race condition or an issue. Log and exit.
    console.error(`Webhook Error: Could not find profile for Stripe customer ${customerId}. Error: ${profileError.message}`)
    // Depending on your logic, you might want to retry or handle this differently.
    // For now, we stop processing for this customer.
    return new NextResponse(`Webhook Error: User profile not found for customer ${customerId}`, { status: 400 })
  }

  const userId = profile.id
  console.log(`Webhook: Found Supabase User ID ${userId} for Stripe Customer ${customerId}`)

  // Retrieve the latest subscription details directly from Stripe
  // This ensures we have the most up-to-date status, price, etc.
  let subscription: Stripe.Subscription;
  try {
      subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['default_payment_method', 'items.data.price.product'], // Expand to get price and product info if needed
      })
      console.log(`Webhook: Retrieved subscription ${subscription.id} details from Stripe. Status: ${subscription.status}`)
  } catch (stripeError: any) {
      console.error(`Webhook Error: Could not retrieve subscription ${subscriptionId} from Stripe. Error: ${stripeError.message}`)
      return new NextResponse(`Webhook Error: Could not retrieve subscription from Stripe`, { status: 500 })
  }


  // Prepare data for Supabase 'subscriptions' table, matching your schema
  const subscriptionData = {
    id: subscription.id, // Stripe Subscription ID is the primary key
    user_id: userId,
    metadata: subscription.metadata,
    status: subscription.status, // Use the enum type defined in your DB
    price_id: subscription.items.data[0].price.id, // Assumes one item per subscription
    // product_id: typeof subscription.items.data[0].price.product === 'string' ? subscription.items.data[0].price.product : subscription.items.data[0].price.product.id, // Example if you store product ID
    quantity: subscription.items.data[0].quantity, // Assumes quantity is on the first item
    cancel_at_period_end: subscription.cancel_at_period_end,
    created: new Date(subscription.created * 1000).toISOString(), // Convert Stripe timestamp
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    ended_at: subscription.ended_at ? new Date(subscription.ended_at * 1000).toISOString() : null,
    cancel_at: subscription.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : null,
    canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
    trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
    trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
  }

  // Upsert (insert or update) the subscription data into Supabase
  // This handles both new subscriptions and updates to existing ones.
  const { error: upsertError } = await supabaseAdmin
    .from('subscriptions')
    .upsert(subscriptionData) // Use upsert based on the primary key 'id'

  if (upsertError) {
    console.error(`Webhook Error: Failed to upsert subscription ${subscription.id} for user ${userId}. Error: ${upsertError.message}`)
    // Return an error response to Stripe so it knows the webhook failed
    return new NextResponse(`Webhook Error: Database update failed`, { status: 500 })
  } else {
    console.log(`Webhook: Successfully upserted subscription ${subscription.id} for user ${userId} with status ${subscription.status}`)
    // If needed, trigger other actions here (e.g., update user roles, send email)
  }

  // Return success response to Stripe
  return new NextResponse(JSON.stringify({ received: true }), { status: 200 })
}


// --- Main Webhook Handler ---
export async function POST(req: Request) {
  let event: Stripe.Event

  // 1. Verify the webhook signature
  try {
    const body = await buffer(req.body as any) // Read raw body for signature verification
    const sig = headers().get('Stripe-Signature') as string
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

    if (!sig || !webhookSecret) {
      console.error("Webhook Error: Missing Stripe signature or webhook secret.")
      return new NextResponse('Webhook Error: Configuration issue.', { status: 400 })
    }

    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
    console.log(`Webhook: Received verified event: ${event.id}, Type: ${event.type}`)

  } catch (err: any) {
    console.error(`Webhook Signature Verification Error: ${err.message}`)
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 })
  }

  // 2. Handle the verified event
  try {
    let response: NextResponse | undefined;
    switch (event.type) {
      // Handle successful payment for initial subscription creation or renewal
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`Webhook: Handling invoice.payment_succeeded for invoice ${invoice.id}, subscription ${invoice.subscription}`);
        if (invoice.subscription) {
          const subscriptionId = invoice.subscription as string;
          const customerId = invoice.customer as string;
          // Call helper to update DB status (active, trialing, etc.)
          response = await manageSubscriptionStatusChange(subscriptionId, customerId);
        } else {
           console.warn(`Webhook Warning: invoice.payment_succeeded event without a subscription ID. Invoice: ${invoice.id}`);
           response = new NextResponse(JSON.stringify({ received: true, message: 'Handled non-subscription invoice payment.' }), { status: 200 });
        }
        break;
      }

      // Handle subscription updates (plan changes, cancellations, etc.)
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`Webhook: Handling customer.subscription.updated for subscription ${subscription.id}`);
        // Call helper to update DB status, cancel_at_period_end, etc.
        response = await manageSubscriptionStatusChange(subscription.id, subscription.customer as string);
        break;
      }

      // Handle subscription deletions (when subscription ends immediately or after cancellation period)
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`Webhook: Handling customer.subscription.deleted for subscription ${subscription.id}`);
        // Call helper to update DB status (e.g., to 'canceled' or handle removal)
        response = await manageSubscriptionStatusChange(subscription.id, subscription.customer as string);
        break;
      }

       // Handle successful checkout session completion (specifically for subscriptions)
      case 'checkout.session.completed': {
        const checkoutSession = event.data.object as Stripe.Checkout.Session;
        console.log(`Webhook: Handling checkout.session.completed for session ${checkoutSession.id}`);
        if (checkoutSession.mode === 'subscription' && checkoutSession.subscription) {
          const subscriptionId = checkoutSession.subscription as string;
          const customerId = checkoutSession.customer as string;
          // Call helper to potentially create/update the subscription record in DB
          // The 'invoice.payment_succeeded' might handle the final status update,
          // but this ensures the record exists promptly.
          response = await manageSubscriptionStatusChange(subscriptionId, customerId, true);
        } else {
           console.log(`Webhook: Ignoring checkout.session.completed event for mode ${checkoutSession.mode}`);
           response = new NextResponse(JSON.stringify({ received: true, message: 'Ignoring non-subscription checkout session.' }), { status: 200 });
        }
        break;
      }

      // Optional: Handle other events like trial ending soon, payment failures, etc.
      // case 'customer.subscription.trial_will_end': { ... }
      // case 'invoice.payment_failed': { ... }

      default:
        console.log(`Webhook: Unhandled event type ${event.type}`);
        response = new NextResponse(JSON.stringify({ received: true, message: `Unhandled event type: ${event.type}` }), { status: 200 });
    }
     // Ensure a response is always returned if not handled by manageSubscriptionStatusChange
     return response || new NextResponse(JSON.stringify({ received: true }), { status: 200 });

  } catch (error) {
    console.error('Webhook handler error:', error);
    // Return error to Stripe only if something went wrong processing the event
    return new NextResponse('Webhook handler failed processing the event.', { status: 500 });
  }
}
