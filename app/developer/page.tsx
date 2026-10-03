import { redirect } from 'next/navigation';

export default function DeveloperRedirectPage() {
  redirect('/editor?view=developer');
}
