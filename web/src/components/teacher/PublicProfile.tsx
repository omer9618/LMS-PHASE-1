import Link from 'next/link';
import { CourseCard } from '@/components/catalogue/CourseCard';
import catalogueStyles from '@/components/catalogue/Catalogue.module.css';
import { locationLabel, type PublicTeacherProfile } from '@/lib/api/profile';
import styles from './PublicProfile.module.css';

/** Plain-text summary for search results and link previews: the bio's first 160 characters. */
export function profileDescription(profile: PublicTeacherProfile): string {
  const text = (profile.bio ?? profile.qualifications ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return `Courses by ${profile.fullName ?? 'this teacher'}.`;
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}

/** #101: a published teacher profile. Server-rendered, no client state. */
export function PublicProfile({ profile }: { profile: PublicTeacherProfile }) {
  const name = profile.fullName ?? 'Teacher';
  const courses = profile.courses.items;
  return (
    <article className={styles.layout} aria-labelledby="teacher-name">
      <nav aria-label="Breadcrumb" className="hint">
        <Link href="/courses">Courses</Link> / Teachers / {name}
      </nav>
      <header className={styles.header}>
        {profile.photoUrl && (
          // A short-lived signed storage URL: next/image's static host list cannot cover it.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.photoUrl}
            alt={`Photo of ${name}`}
            width={128}
            height={128}
            className={styles.photo}
          />
        )}
        <div className={styles.intro}>
          <h1 id="teacher-name">{name}</h1>
          {profile.qualifications && (
            <p className={styles.qualifications}>{profile.qualifications}</p>
          )}
        </div>
      </header>

      {profile.bio && (
        <section aria-labelledby="about-heading" className={styles.section}>
          <h2 id="about-heading">About</h2>
          <p className={styles.prose}>{profile.bio}</p>
        </section>
      )}

      {profile.f2fLocations.length > 0 && (
        <section aria-labelledby="places-heading" className={styles.section}>
          <h2 id="places-heading">Teaches face to face in</h2>
          <ul className={styles.list}>
            {profile.f2fLocations.map((place, i) => (
              <li key={`${place.city}-${place.area ?? ''}-${i}`}>
                <strong>{locationLabel(place)}</strong>
                {place.notes && <span className="muted"> — {place.notes}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {profile.socialLinks.length > 0 && (
        <section aria-labelledby="links-heading" className={styles.section}>
          <h2 id="links-heading">Links</h2>
          <ul className={styles.links}>
            {profile.socialLinks.map((link) => (
              <li key={link.url}>
                {/* Teacher-supplied: never pass our referrer or give the page a handle on ours. */}
                <a href={link.url} rel="noopener noreferrer nofollow ugc" target="_blank">
                  {link.label}
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="courses-heading" className={styles.section}>
        <h2 id="courses-heading">
          Courses{profile.courses.total > 0 ? ` (${profile.courses.total})` : ''}
        </h2>
        {courses.length === 0 ? (
          <p className="muted">No published courses yet.</p>
        ) : (
          <ul className={catalogueStyles.cards}>
            {courses.map((course) => (
              <li key={course.id}>
                <CourseCard course={course} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
