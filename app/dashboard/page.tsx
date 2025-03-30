import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers' // Import cookies

// Define a simple component for the dashboard content
function DashboardContent({ profile, user }: { profile: any, user: any }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      <p className="mb-2">Welcome, {profile?.full_name || user.email}!</p>
      <p className="mb-4">Your User ID: {user.id}</p>
      {profile?.stripe_customer_id && (
        <p className="mb-4 text-sm text-gray-600">Stripe Customer ID: {profile.stripe_customer_id}</p>
      )}
      {/* TODO: Add actual dashboard features here */}
      <div className="mt-6 p-4 border rounded bg-gray-50">
        <h2 className="text-lg font-semibold mb-2">Placeholder Content</h2>
        <p>This is where dashboard widgets and features will go, such as:</p>
        <ul className="list-disc list-inside ml-4 text-sm">
          <li>"On This Day" feature</li>
          <li>Recent activity</li>
          <li>Saved articles</li>
          <li>Account/Subscription status</li>
        </ul>
      </div>
       {/* Add a Logout Button (Example - requires client component interaction) */}
       {/* <SignOutButton /> */}
       <p className="mt-4 text-sm text-gray-400">(Logout button needs implementation in a Client Component)</p>
    </div>
  )
}


export default async function DashboardPage() {
  const cookieStore = cookies() // Get cookie store
  const supabase = createClient() // Pass cookie store implicitly

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // Middleware should handle this, but redirect as a fallback
    redirect('/login?message=Authentication required')
  }

  // Fetch user-specific data (profile)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError && profileError.code !== 'PGRST116') {
    // PGRST116 means 'Resource Not Found', which might happen briefly
    // if the profile creation trigger hasn't run yet. Handle other errors.
    console.error("Error fetching profile:", profileError)
    // Optionally redirect to an error page or show an error message
    // For now, we'll proceed but the profile might be null
  }

  return <DashboardContent profile={profile} user={user} />
}
