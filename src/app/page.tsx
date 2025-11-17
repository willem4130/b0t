import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export default async function HomePage() {
  // Check authentication status
  const session = await auth();

  // If authenticated, redirect to dashboard
  if (session) {
    redirect('/dashboard');
  }

  // If not authenticated, redirect to sign in
  redirect('/auth/signin');
}
