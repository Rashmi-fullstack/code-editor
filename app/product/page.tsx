import { redirect } from 'next/navigation';

export default function ProductRedirectPage() {
  redirect('/editor?view=product');
}
