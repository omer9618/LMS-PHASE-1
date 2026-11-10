import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { PublicProfile, profileDescription } from '@/components/teacher/PublicProfile';
import { isApiError } from '@/lib/api/errors';
import type { PublicTeacherProfile } from '@/lib/api/profile';
import { serverApi } from '@/lib/api/server';
import { publicTeacherProfile } from '@/lib/api/schemas/teacher';
import { requireId } from '@/lib/route-params';

type Params = { params: Promise<{ teacherId: string }> };

/**
 * #101: one request per render, shared by the metadata and the page. Unpublished, missing and
 * suspended teachers' profiles answer 404 from the API, and so does this page.
 */
const loadProfile = cache(async (teacherId: string): Promise<PublicTeacherProfile> => {
  requireId(teacherId);
  try {
    return await serverApi.get(`/teachers/${teacherId}`, publicTeacherProfile, { limit: 60 });
  } catch (error) {
    if (isApiError(error, 'NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED')) notFound();
    throw error;
  }
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { teacherId } = await params;
  const profile = await loadProfile(teacherId);
  const name = profile.fullName ?? 'Teacher';
  const description = profileDescription(profile);
  return {
    title: name,
    description,
    alternates: { canonical: `/teachers/${teacherId}` },
    openGraph: { type: 'profile', title: name, description },
  };
}

export default async function TeacherPublicPage({ params }: Params) {
  const { teacherId } = await params;
  const profile = await loadProfile(teacherId);
  return <PublicProfile profile={profile} />;
}
