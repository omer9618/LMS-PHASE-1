'use client';

import { usePathname } from 'next/navigation';
import { StaffBar } from '@/components/chrome/StaffBar';

const LINKS = [
  { href: '/teacher/courses', label: 'Courses' },
  { href: '/teacher/earnings', label: 'Earnings' },
  { href: '/teacher/profile', label: 'Profile' },
];

/** The teacher area's own navigation: the dark staff bar. */
export function TeacherNav() {
  const pathname = usePathname() ?? '';
  return (
    <StaffBar
      area="Teaching"
      home="/teacher/courses"
      label="Teaching"
      links={LINKS.map((link) => ({ ...link, current: pathname.startsWith(link.href) }))}
    />
  );
}
