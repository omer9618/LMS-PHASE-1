import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { TeacherGuard } from '@/components/teacher/TeacherGuard';
import { TeacherNav } from '@/components/teacher/TeacherNav';

export const metadata: Metadata = {
  title: { default: 'Teaching', template: '%s · Teaching · LMS' },
};

/** The teacher area: sand ground, compact density, the dark staff bar. */
export default function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <div className="staff-ground" data-density="compact">
      <TeacherGuard>
        <TeacherNav />
        <div className="page page-wide">{children}</div>
      </TeacherGuard>
    </div>
  );
}
