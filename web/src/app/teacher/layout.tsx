import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { TeacherGuard } from '@/components/teacher/TeacherGuard';
import { TeacherNav } from '@/components/teacher/TeacherNav';

export const metadata: Metadata = {
  title: { default: 'Teaching', template: '%s · Teaching · LMS' },
};

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <div className="page">
      <TeacherGuard>
        <TeacherNav />
        {children}
      </TeacherGuard>
    </div>
  );
}
