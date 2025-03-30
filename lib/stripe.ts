import Stripe from 'stripe'

// Ensure environment variable is defined
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is not set.')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { // Added non-null assertion for env var
  apiVersion: '2025-02-24.acacia', // Updated to match TS error expectation
  typescript: true,
  // Optionally add app info for Stripe telemetry
  // appInfo: {
  //   name: 'Historical News Platform',
  //   version: '0.1.0',
  // },
})
