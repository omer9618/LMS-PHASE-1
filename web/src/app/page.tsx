import { redirect } from 'next/navigation';

/** The catalogue is the front door until a landing page is designed. */
export default function HomePage() {
  redirect('/courses');
}
