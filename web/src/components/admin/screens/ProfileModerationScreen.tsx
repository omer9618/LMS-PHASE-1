'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Badge, Button, Loadable, PageHeader, Section, Textarea } from '@/components/ui';
import { adminApi, type TeacherProfile } from '@/lib/api/admin';
import {
  linesToLinks,
  linesToLocations,
  linksToLines,
  locationsToLines,
} from '@/lib/profile-lines';
import { useApi } from '@/lib/use-api';
import styles from '../Admin.module.css';
import { MutationStatus, ReasonAction } from '@/components/ui';
import { useMutation, type Mutation } from '@/lib/use-mutation';
import { formatDateTime } from '@/lib/format';

/** #100: an admin edits or unpublishes any teacher's public profile. Every change is audited. */
export function ProfileModerationScreen({ teacherId }: { teacherId: string }) {
  const profile = useApi(`admin-profile:${teacherId}`, (signal) =>
    adminApi.getTeacherProfile(teacherId, signal),
  );
  const mutation = useMutation();
  return (
    <Loadable state={profile} what="the profile">
      {(p) => (
        <>
          <PageHeader
            eyebrow="Teacher · public page"
            title={`Public profile: ${p.fullName ?? 'teacher'}`}
            description={
              <>
                <Link href={`/admin/users/${teacherId}`}>Back to the account</Link>
                {p.isPublished && (
                  <>
                    {' · '}
                    <Link href={`/teachers/${teacherId}`}>View public page</Link>
                  </>
                )}
              </>
            }
            actions={
              <Badge tone={p.isPublished ? 'success' : 'neutral'}>
                {p.isPublished ? 'Published' : 'Not published'}
              </Badge>
            }
          />
          <MutationStatus mutation={mutation} />
          {p.moderation && (
            <p className="muted">
              Unpublished by an admin on {formatDateTime(p.moderation.unpublishedAt)}
              {p.moderation.reason ? `: ${p.moderation.reason}` : ''}
            </p>
          )}
          <Section title="Moderation">
            {!p.isPublished && !p.photoUrl && (
              <p className="muted">
                Nothing to moderate yet: the profile is not published and has no photo.
              </p>
            )}
            <div className={styles.actions}>
              {p.isPublished && (
                <ReasonAction
                  label="Unpublish profile"
                  variant="danger"
                  hint="The teacher sees this reason and may republish after fixing it."
                  onConfirm={async (reason) => {
                    const ok = await mutation.run(
                      () => adminApi.unpublishTeacherProfile(teacherId, reason),
                      'Profile unpublished.',
                    );
                    if (ok) profile.reload();
                    return ok;
                  }}
                />
              )}
              {p.photoUrl && (
                <ReasonAction
                  label="Remove photo"
                  variant="danger"
                  onConfirm={async (reason) => {
                    const ok = await mutation.run(
                      () => adminApi.removeTeacherPhoto(teacherId, reason),
                      'Photo removed.',
                    );
                    if (ok) profile.reload();
                    return ok;
                  }}
                />
              )}
            </div>
            {p.photoUrl && (
              // A signed, short-lived storage URL: next/image would need the bucket configured.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.photoUrl} alt={`Photo of ${p.fullName ?? 'the teacher'}`} width={120} />
            )}
          </Section>
          <ProfileForm
            profile={p}
            teacherId={teacherId}
            mutation={mutation}
            onSaved={profile.reload}
          />
        </>
      )}
    </Loadable>
  );
}

function ProfileForm({
  profile,
  teacherId,
  mutation,
  onSaved,
}: {
  profile: TeacherProfile;
  teacherId: string;
  mutation: Mutation;
  onSaved: () => void;
}) {
  const [bio, setBio] = useState(profile.bio ?? '');
  const [qualifications, setQualifications] = useState(profile.qualifications ?? '');
  const [links, setLinks] = useState(linksToLines(profile.socialLinks));
  const [locations, setLocations] = useState(locationsToLines(profile.f2fLocations));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await mutation.run(
      () =>
        adminApi.updateTeacherProfile(teacherId, {
          bio: bio.trim() || null,
          qualifications: qualifications.trim() || null,
          socialLinks: linesToLinks(links),
          f2fLocations: linesToLocations(locations),
        }),
      'Profile saved. The edit is recorded in the audit log.',
    );
    if (ok) onSaved();
  }

  return (
    <Section title="Edit profile">
      <form className={styles.form} onSubmit={submit}>
        <Textarea label="Bio" rows={5} value={bio} onChange={(e) => setBio(e.target.value)} />
        <Textarea
          label="Qualifications"
          rows={3}
          value={qualifications}
          onChange={(e) => setQualifications(e.target.value)}
        />
        <Textarea
          label="Links"
          hint="One per line: Label | https://…"
          rows={3}
          value={links}
          onChange={(e) => setLinks(e.target.value)}
        />
        <Textarea
          label="Face-to-face locations"
          hint="One per line: City | Area | Notes (area and notes optional)"
          rows={3}
          value={locations}
          onChange={(e) => setLocations(e.target.value)}
        />
        <div className={styles.actions}>
          <Button type="submit" size="sm" loading={mutation.pending}>
            Save profile
          </Button>
        </div>
      </form>
    </Section>
  );
}
