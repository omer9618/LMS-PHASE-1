import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { CourseDetailContent } from '@/components/course/CourseDetailView';
import { isRequestError } from '@/lib/api/errors';
import { courseDetail, type CourseDetail } from '@/lib/api/schemas/catalogue';
import { courseDescription } from '@/lib/course-meta';
import { serverApi } from '@/lib/api/server';
import { requireId } from '@/lib/route-params';

type Params = { params: Promise<{ courseId: string }> };

/**
 * One request per render, shared by the metadata and the page, so the course is in the HTML that
 * search engines and link previews fetch. A course that is missing or not published answers 404
 * from the API, and so does this page. Enrolment and cart state stay in the browser.
 */
const loadCourse = cache(async (courseId: string): Promise<CourseDetail> => {
  requireId(courseId);
  try {
    return await serverApi.get(`/catalogue/courses/${courseId}`, courseDetail);
  } catch (error) {
    if (isRequestError(error, 'NOT_FOUND') || isRequestError(error, 'VALIDATION_FAILED')) {
      notFound();
    }
    throw error;
  }
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { courseId } = await params;
  const course = await loadCourse(courseId);
  const description = courseDescription(course);
  return {
    title: course.title,
    description,
    alternates: { canonical: `/courses/${courseId}` },
    openGraph: { type: 'website', title: course.title, description },
  };
}

export default async function CoursePage({ params }: Params) {
  const { courseId } = await params;
  return <CourseDetailContent course={await loadCourse(courseId)} />;
}
