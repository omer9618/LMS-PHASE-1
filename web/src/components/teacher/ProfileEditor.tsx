'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Input, PageHeader, Textarea } from '@/components/ui';
import { errorMessage, fieldErrors, isApiError } from '@/lib/api/errors';
import {
  checkPhoto,
  MAX_F2F_LOCATIONS,
  MAX_SOCIAL_LINKS,
  profileApi,
  type ProfileUpdate,
  type SocialLink,
  type TeacherProfile,
} from '@/lib/api/profile';
import { formatDate } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import styles from './Teacher.module.css';
import { profileForm } from '@/lib/forms/profile';
import { validateForm } from '@/lib/zod-form';

interface Draft {
  bio: string;
  qualifications: string;
  links: SocialLink[];
  locations: Array<{ city: string; area: string; notes: string }>;
}

export function draftFrom(profile: TeacherProfile): Draft {
  return {
    bio: profile.bio ?? '',
    qualifications: profile.qualifications ?? '',
    links: profile.socialLinks.map((l) => ({ ...l })),
    locations: profile.f2fLocations.map((l) => ({
      city: l.city,
      area: l.area ?? '',
      notes: l.notes ?? '',
    })),
  };
}

/** Client checks, keyed like the API's issue paths (`socialLinks.0.url`). */
export function validateDraft(draft: Draft): Record<string, string> {
  const result = validateForm(profileForm, toFormValues(draft));
  return result.ok ? {} : result.errors;
}

/** The PUT body: the whole editable profile, empty text cleared, empty optional fields left out. */
export function updateBody(draft: Draft): ProfileUpdate {
  const result = validateForm(profileForm, toFormValues(draft));
  if (!result.ok) throw new Error('updateBody needs a valid draft');
  return result.data;
}

/** The draft uses short names for the form's boxes; the schema uses the API's. */
function toFormValues(draft: Draft) {
  return {
    bio: draft.bio,
    qualifications: draft.qualifications,
    socialLinks: draft.links,
    f2fLocations: draft.locations,
  };
}

/** #98: the teacher edits, illustrates and publishes their public profile. */
export function ProfileEditor() {
  const loaded = useApi('my-profile', (signal) => profileApi.get(signal));
  const [changed, setChanged] = useState<TeacherProfile | null>(null);

  if (loaded.status === 'loading') return <p role="status">Loading your profile…</p>;
  if (loaded.status === 'error') {
    return (
      <Alert tone="danger" title="Could not load your profile">
        <p>{errorMessage(loaded.error)}</p>
        <Button size="sm" variant="secondary" onClick={loaded.reload}>
          Try again
        </Button>
      </Alert>
    );
  }
  const profile = changed ?? loaded.data;
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Your public page"
        title="Public profile"
        description="Students see this on your teacher page once you publish it."
      />
      <PublishPanel profile={profile} onChange={setChanged} />
      <div className={styles.layout}>
        <ProfileForm profile={profile} onSaved={setChanged} />
        <PhotoPanel profile={profile} onChange={setChanged} />
      </div>
    </div>
  );
}

function PublishPanel({
  profile,
  onChange,
}: {
  profile: TeacherProfile;
  onChange: (p: TeacherProfile) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      onChange(profile.isPublished ? await profileApi.unpublish() : await profileApi.publish());
    } catch (err) {
      setError(
        isApiError(err) && err.name === 'PROFILE_INCOMPLETE'
          ? 'Add a bio and save it before publishing your profile.'
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="publish-heading">
      <div className={styles.titleRow}>
        <h2 id="publish-heading" className={styles.panelTitle}>
          Visibility
        </h2>
        <Badge tone={profile.isPublished ? 'success' : 'neutral'}>
          {profile.isPublished ? 'Published' : 'Not published'}
        </Badge>
      </div>
      {profile.moderation && (
        <Alert tone="warning" title="An admin unpublished your profile">
          <p>
            On {formatDate(profile.moderation.unpublishedAt)}.{' '}
            {profile.moderation.reason
              ? `Reason: ${profile.moderation.reason}`
              : 'No reason was given.'}
          </p>
          <p>Fix what was asked, then publish again.</p>
        </Alert>
      )}
      <p className="muted">
        {profile.isPublished
          ? 'Students can see your profile and it appears on your courses.'
          : 'Only you can see your profile. Publish it to show it on your courses.'}
      </p>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className={styles.actions}>
        <Button
          variant={profile.isPublished ? 'secondary' : 'primary'}
          loading={busy}
          loadingText={profile.isPublished ? 'Unpublishing…' : 'Publishing…'}
          onClick={() => void toggle()}
        >
          {profile.isPublished ? 'Unpublish' : 'Publish profile'}
        </Button>
        {profile.isPublished && (
          <Link href={`/teachers/${profile.teacherId}`}>View your public page</Link>
        )}
      </div>
    </section>
  );
}

function ProfileForm({
  profile,
  onSaved,
}: {
  profile: TeacherProfile;
  onSaved: (p: TeacherProfile) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const edit = (change: Partial<Draft>) => {
    setSaved(false);
    setDraft((d) => ({ ...d, ...change }));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const invalid = validateDraft(draft);
    setErrors(invalid);
    setFormError(null);
    setSaved(false);
    if (Object.keys(invalid).length > 0) {
      setFormError('Please correct the fields marked below.');
      return;
    }
    setSaving(true);
    try {
      onSaved(await profileApi.update(updateBody(draft)));
      setSaved(true);
    } catch (err) {
      const byField = fieldErrors(err);
      setErrors(byField);
      setFormError(
        Object.keys(byField).length > 0
          ? 'Please correct the fields marked below.'
          : errorMessage(err),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={`${styles.panel} stack`} noValidate onSubmit={submit} aria-label="Profile">
      <h2 className={styles.panelTitle}>About you</h2>
      {formError && <Alert tone="danger">{formError}</Alert>}
      {saved && <Alert tone="success">Profile saved.</Alert>}
      <Textarea
        label="Bio"
        hint="Required to publish. Who you are, how you teach, what students get."
        rows={6}
        maxLength={5000}
        value={draft.bio}
        onChange={(e) => edit({ bio: e.target.value })}
        error={errors.bio}
      />
      <Textarea
        label="Qualifications (optional)"
        rows={3}
        maxLength={2000}
        value={draft.qualifications}
        onChange={(e) => edit({ qualifications: e.target.value })}
        error={errors.qualifications}
      />

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Links (up to {MAX_SOCIAL_LINKS})</legend>
        {draft.links.length === 0 && <p className="muted">No links yet.</p>}
        {draft.links.map((link, i) => (
          <div key={i} className={styles.rowFields} role="group" aria-label={`Link ${i + 1}`}>
            <Input
              label="Label"
              value={link.label}
              maxLength={50}
              placeholder="YouTube"
              onChange={(e) =>
                edit({
                  links: draft.links.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)),
                })
              }
              error={errors[`socialLinks.${i}.label`]}
            />
            <Input
              label="Address"
              type="url"
              value={link.url}
              maxLength={500}
              placeholder="https://"
              onChange={(e) =>
                edit({
                  links: draft.links.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)),
                })
              }
              error={errors[`socialLinks.${i}.url`]}
            />
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove link ${i + 1}`}
              onClick={() => edit({ links: draft.links.filter((_, j) => j !== i) })}
            >
              Remove
            </Button>
          </div>
        ))}
        {draft.links.length < MAX_SOCIAL_LINKS && (
          <div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => edit({ links: [...draft.links, { label: '', url: '' }] })}
            >
              Add a link
            </Button>
          </div>
        )}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>
          Where you teach face to face (up to {MAX_F2F_LOCATIONS})
        </legend>
        {draft.locations.length === 0 && <p className="muted">Online only.</p>}
        {draft.locations.map((loc, i) => {
          const set = (key: 'city' | 'area' | 'notes', value: string) =>
            edit({
              locations: draft.locations.map((l, j) => (j === i ? { ...l, [key]: value } : l)),
            });
          return (
            <div key={i} className={styles.rowFields} role="group" aria-label={`Place ${i + 1}`}>
              <Input
                label="City"
                value={loc.city}
                maxLength={100}
                onChange={(e) => set('city', e.target.value)}
                error={errors[`f2fLocations.${i}.city`]}
              />
              <Input
                label="Area (optional)"
                value={loc.area}
                maxLength={100}
                onChange={(e) => set('area', e.target.value)}
                error={errors[`f2fLocations.${i}.area`]}
              />
              <Input
                label="Notes (optional)"
                value={loc.notes}
                maxLength={300}
                placeholder="Weekends only"
                onChange={(e) => set('notes', e.target.value)}
                error={errors[`f2fLocations.${i}.notes`]}
              />
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove place ${i + 1}`}
                onClick={() => edit({ locations: draft.locations.filter((_, j) => j !== i) })}
              >
                Remove
              </Button>
            </div>
          );
        })}
        {draft.locations.length < MAX_F2F_LOCATIONS && (
          <div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                edit({ locations: [...draft.locations, { city: '', area: '', notes: '' }] })
              }
            >
              Add a place
            </Button>
          </div>
        )}
      </fieldset>

      <div>
        <Button type="submit" loading={saving} loadingText="Saving…">
          Save profile
        </Button>
      </div>
    </form>
  );
}

function PhotoPanel({
  profile,
  onChange,
}: {
  profile: TeacherProfile;
  onChange: (p: TeacherProfile) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  async function run(action: () => Promise<TeacherProfile>) {
    setBusy(true);
    setError(null);
    try {
      onChange(await action());
      setFile(null);
      setInputKey((k) => k + 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${styles.panel} stack`} aria-labelledby="photo-heading">
      <h2 id="photo-heading" className={styles.panelTitle}>
        Photo
      </h2>
      {profile.photoUrl ? (
        // A short-lived signed storage URL: next/image's static host list cannot cover it.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.photoUrl}
          alt="Your profile photo"
          width={160}
          height={160}
          className={styles.photo}
        />
      ) : (
        <p className="muted">No photo yet.</p>
      )}
      <Input
        key={inputKey}
        label={profile.photoUrl ? 'Replace the photo' : 'Upload a photo'}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hint="PNG, JPEG or WebP, at most 2 MB. A clear, friendly head-and-shoulders photo works best."
        error={fileError}
        onChange={(e) => {
          const chosen = e.target.files?.[0] ?? null;
          setFile(chosen);
          setFileError(chosen ? checkPhoto(chosen) : undefined);
        }}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      <div className={styles.actions}>
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          loadingText="Uploading…"
          onClick={() => {
            const problem = checkPhoto(file);
            setFileError(problem);
            if (!problem && file) void run(() => profileApi.uploadPhoto(file));
          }}
        >
          Upload
        </Button>
        {profile.photoUrl && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void run(profileApi.removePhoto)}
          >
            Remove photo
          </Button>
        )}
      </div>
    </section>
  );
}
