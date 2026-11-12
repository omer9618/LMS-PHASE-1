'use client';

import { Icon } from './Icon';

import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cx } from './cx';
import styles from './Field.module.css';

interface FieldOwnProps {
  label: ReactNode;
  /** Help text under the control, linked with aria-describedby. */
  hint?: ReactNode;
  /** Error text; marks the control aria-invalid and is announced with it. */
  error?: ReactNode;
  /** Hide the label visually (it stays the accessible name). */
  hideLabel?: boolean;
}

/** Ids and ARIA wiring shared by every labelled control. */
function useFieldIds(id: string | undefined, hint: ReactNode, error: ReactNode) {
  const generated = useId();
  const controlId = id ?? `field${generated}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return { controlId, hintId, errorId, describedBy };
}

function FieldText({
  hint,
  hintId,
  error,
  errorId,
}: {
  hint: ReactNode;
  hintId?: string;
  error: ReactNode;
  errorId?: string;
}) {
  return (
    <>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          <Icon name="alert" />
          {error}
        </p>
      )}
    </>
  );
}

function Label({
  htmlFor,
  required,
  hidden,
  children,
}: {
  htmlFor: string;
  required?: boolean;
  hidden?: boolean;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className={cx(styles.label, hidden && 'visually-hidden')}>
      {children}
      {required ? (
        <span className={styles.required} aria-hidden="true">
          {' '}
          *
        </span>
      ) : null}
    </label>
  );
}

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> & FieldOwnProps;

export function Input({ label, hint, error, hideLabel, id, className, ...rest }: InputProps) {
  const { controlId, hintId, errorId, describedBy } = useFieldIds(id, hint, error);
  // A password box can show what was typed: on a phone a hidden typo is the usual reason to fail.
  const [revealed, setRevealed] = useState(false);
  const isPassword = rest.type === 'password';
  const control = (
    <input
      {...rest}
      type={isPassword && revealed ? 'text' : rest.type}
      id={controlId}
      className={cx(styles.control, isPassword && styles.withReveal)}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
    />
  );
  return (
    <div className={cx(styles.field, className)}>
      <Label htmlFor={controlId} required={rest.required} hidden={hideLabel}>
        {label}
      </Label>
      {isPassword ? (
        <div className={styles.revealWrap}>
          {control}
          <button
            type="button"
            className={styles.reveal}
            aria-pressed={revealed}
            aria-controls={controlId}
            onClick={() => setRevealed((r) => !r)}
          >
            {revealed ? 'Hide' : 'Show'} <span className="visually-hidden">password</span>
          </button>
        </div>
      ) : (
        control
      )}
      <FieldText hint={hint} hintId={hintId} error={error} errorId={errorId} />
    </div>
  );
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & FieldOwnProps;

export function Select({
  label,
  hint,
  error,
  hideLabel,
  id,
  className,
  children,
  ...rest
}: SelectProps) {
  const { controlId, hintId, errorId, describedBy } = useFieldIds(id, hint, error);
  return (
    <div className={cx(styles.field, className)}>
      <Label htmlFor={controlId} required={rest.required} hidden={hideLabel}>
        {label}
      </Label>
      <select
        {...rest}
        id={controlId}
        className={cx(styles.control, styles.select)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      >
        {children}
      </select>
      <FieldText hint={hint} hintId={hintId} error={error} errorId={errorId} />
    </div>
  );
}

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> &
  Omit<FieldOwnProps, 'hideLabel'>;

export function Checkbox({ label, hint, error, id, className, ...rest }: CheckboxProps) {
  const { controlId, hintId, errorId, describedBy } = useFieldIds(id, hint, error);
  return (
    <div className={cx(styles.checkboxField, className)}>
      <div className={styles.checkboxRow}>
        <input
          {...rest}
          type="checkbox"
          id={controlId}
          className={styles.checkbox}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        <label htmlFor={controlId} className={styles.checkboxLabel}>
          {label}
        </label>
      </div>
      <FieldText hint={hint} hintId={hintId} error={error} errorId={errorId} />
    </div>
  );
}

export interface RadioGroupProps<T extends string> {
  legend: ReactNode;
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode }>;
  hint?: ReactNode;
}

/** A set of mutually exclusive choices, each row a full-size tap target. */
export function RadioGroup<T extends string>({
  legend,
  name,
  value,
  onChange,
  options,
  hint,
}: RadioGroupProps<T>) {
  return (
    <fieldset className={styles.radioGroup}>
      <legend className={styles.label}>{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className={styles.radioRow}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className={styles.checkbox}
          />
          <span className={styles.checkboxLabel}>{option.label}</span>
        </label>
      ))}
      {hint && <p className={styles.hint}>{hint}</p>}
    </fieldset>
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldOwnProps;

export function Textarea({ label, hint, error, hideLabel, id, className, ...rest }: TextareaProps) {
  const { controlId, hintId, errorId, describedBy } = useFieldIds(id, hint, error);
  return (
    <div className={cx(styles.field, className)}>
      <Label htmlFor={controlId} required={rest.required} hidden={hideLabel}>
        {label}
      </Label>
      <textarea
        rows={4}
        {...rest}
        id={controlId}
        className={cx(styles.control, styles.textarea)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      <FieldText hint={hint} hintId={hintId} error={error} errorId={errorId} />
    </div>
  );
}
