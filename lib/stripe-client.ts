import { loadStripe, Stripe as StripeClient } from '@stripe/stripe-js'

let stripePromise: Promise<StripeClient | null>;

export const getStripe = () => {
  // Ensure environment variable is defined
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (!publishableKey) {
    throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY environment variable is not set.')
  }

  if (!stripePromise) {
    stripePromise = loadStripe(publishableKey)
  }
  return stripePromise
}
