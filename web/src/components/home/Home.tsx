import { ButtonLink, MarkSheet } from '@/components/ui';
import styles from './Home.module.css';

/** The steps of buying a course by bank transfer, as the client described them. */
const STEPS = [
  {
    title: 'Watch a free preview',
    text: 'Every course has at least one preview lesson, so you can hear the teacher before you pay.',
  },
  {
    title: 'Place your order',
    text: 'The price is fixed when you order. You get a payment reference to use as the transfer remark.',
    reference: 'LMS-7K2M-9QXD',
  },
  {
    title: 'Transfer and upload proof',
    text: 'Send the amount from your bank app, then add the transaction ID and a screenshot of the receipt.',
  },
  {
    title: 'Start learning',
    text: 'Once the payment is verified, every lesson unlocks and your receipt arrives by email.',
  },
];

const PRACTICE = [
  {
    tag: 'Timed',
    title: 'Real time limits',
    text: 'The clock runs on our server, so a refresh or a closed tab does not pause it. Answers save as you go.',
  },
  {
    tag: 'Numeric',
    title: 'Answers with units and tolerance',
    text: 'Type the number; the unit is printed beside the box. Teachers set how close an answer must be.',
  },
  {
    tag: 'Checkpoints',
    title: 'Pass to move on',
    text: 'Step-by-step courses unlock in order, and checkpoint quizzes must be passed before the next topic opens.',
  },
];

const TEACHER_FACTS = [
  ['Earnings', 'Credited to your statement when each sale is verified'],
  ['Payouts', 'Itemised by sale, with a few days to raise a concern'],
  ['Students', 'See who is enrolled and how far each student has got'],
  ['Profile', 'A public page with your bio, qualifications and courses'],
];

/** The public landing page: what the platform is, how buying works, how quizzes work, teaching. */
export function Home() {
  return (
    <>
      <section className={`grid-paper ${styles.hero}`} aria-labelledby="hero-title">
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <span className={styles.pill}>Cambridge and Edexcel</span>
            <h1 id="hero-title" className={styles.display}>
              Learn your syllabus from teachers who <em>mark like examiners</em>
            </h1>
            <p className={styles.lead}>
              Every course is filed under its board, level and syllabus code. Watch a free preview
              lesson first, pay by bank transfer when you are ready, and practise with timed quizzes
              that show the marks for every step.
            </p>
            <div className={styles.actions}>
              <ButtonLink href="/courses" size="lg">
                Browse courses
              </ButtonLink>
              <ButtonLink href="#how" variant="secondary" size="lg">
                See how it works
              </ButtonLink>
            </div>
            <ul className={styles.checks}>
              <li>Free preview on every course</li>
              <li>Payments checked by our team</li>
              <li>Works on any phone</li>
            </ul>
          </div>
          <div className={styles.showcase}>
            <MarkSheet
              heading="5054 · Motion check · Q3 of 5"
              marks={2}
              timer="11:42 left"
              question="A car accelerates uniformly from rest to 14 m/s in 7.0 s. Calculate its acceleration."
              equation="a = (v − u) ⁄ t"
              answer={{ value: '2.0', unit: 'm/s²', correct: true }}
              points={[
                {
                  code: 'M1 · Method',
                  text: 'Substitutes into a = (v − u) ⁄ t: (14 − 0) ⁄ 7.0',
                  awarded: true,
                },
                { code: 'A1 · Accuracy', text: '2.0 m/s² with the correct unit', awarded: true },
              ]}
            />
          </div>
        </div>
      </section>

      <section id="how" className={styles.section} aria-labelledby="how-title">
        <div className={styles.inner}>
          <div className={styles.sectionHead}>
            <span className="eyebrow">From preview to first lesson</span>
            <h2 id="how-title" className={styles.sectionTitle}>
              How buying a course works
            </h2>
            <p className={styles.sectionLead}>
              There is no card checkout. You pay by bank transfer with a reference we give you, and
              a member of our team matches it against the bank statement.
            </p>
          </div>
          <ol className={styles.steps}>
            {STEPS.map((step, index) => (
              <li key={step.title} className={styles.step}>
                <span className={styles.stepNumber}>{String(index + 1).padStart(2, '0')}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                {step.reference && <code className={styles.reference}>{step.reference}</code>}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.sectionAlt} aria-labelledby="practice-title">
        <div className={styles.inner}>
          <div className={styles.sectionHead}>
            <span className="eyebrow">Practise under exam conditions</span>
            <h2 id="practice-title" className={styles.sectionTitle}>
              Quizzes built the way papers are marked
            </h2>
            <p className={styles.sectionLead}>
              Teachers set the timing, the attempts and when answers are shown. You see where every
              mark came from.
            </p>
          </div>
          <div className={styles.cards}>
            {PRACTICE.map((item) => (
              <article key={item.title} className={styles.card}>
                <span className="eyebrow">{item.tag}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="teach" className={styles.teach} aria-labelledby="teach-title">
        <div className={styles.inner}>
          <div className={styles.teachText}>
            <span className={styles.teachEyebrow}>For teachers</span>
            <h2 id="teach-title" className={styles.teachTitle}>
              Publish your course. We handle payments and pay you out.
            </h2>
            <p>
              Apply with your CV. Once you are approved, build your course with videos, notes and
              quizzes. We agree the price and commission with you before it goes live.
            </p>
            <ButtonLink href="/teach-with-us" variant="secondary">
              Apply to teach
            </ButtonLink>
          </div>
          <dl className={styles.teachFacts}>
            {TEACHER_FACTS.map(([term, text]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}
