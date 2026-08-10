import { redirect } from 'next/navigation';

export default function Home() {
  // The app shell decides between the dashboard and the login screen.
  redirect('/dashboard');
}
