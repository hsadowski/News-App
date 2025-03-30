'use client' // This is a client component

import { getStripe } from '@/lib/stripe-client'
import { useState } from 'react'

interface SubscribeButtonProps {
  priceId: string; // The Stripe Price ID for the subscription plan
  className?: string; // Optional additional classes for styling
}

export default function SubscribeButton({ priceId, className = '' }: SubscribeButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubscribe = async () => {
    setLoading(true)
    setError(null)
    try {
      // Call the API route to create a checkout session
      const res = await fetch('/api/checkout-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }), // Send the Price ID
      })

      if (!res.ok) {
        // Handle API errors (e.g., user not logged in, server error)
        const errorData = await res.json().catch(() => ({ error: 'Failed to parse error response' }))
        throw new Error(errorData.error || `API Error: ${res.statusText}`)
      }

      const { sessionId } = await res.json()
      if (!sessionId) {
        throw new Error('Failed to retrieve session ID from the server.')
      }

      // Get the Stripe.js instance
      const stripe = await getStripe()
      if (!stripe) {
         throw new Error('Stripe.js failed to load.')
      }

      // Redirect user to Stripe Checkout
      const { error: stripeError } = await stripe.redirectToCheckout({ sessionId })

      // If redirectToCheckout fails (e.g., network error), show error
      if (stripeError) {
        console.error('Stripe Redirect Error:', stripeError)
        setError(stripeError.message || 'Failed to redirect to Stripe.')
      }
      // Note: If redirect is successful, the user leaves this page,
      // so we don't need to handle the success case here directly.

    } catch (err: any) {
      console.error('Subscription Button Error:', err)
      setError(err.message || 'An unexpected error occurred during subscription.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={handleSubscribe}
        disabled={loading}
        className={`bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:opacity-50 ${className}`}
      >
        {loading ? 'Processing...' : 'Subscribe'}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </>
  )
}
