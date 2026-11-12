'use client';

import { useId, type ReactNode } from 'react';
import { cx } from './cx';
import styles from './Table.module.css';

export interface Column<Row> {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** Right-aligns and uses tabular figures: for money, counts and dates. */
  numeric?: boolean;
  /** The column that names the row; rendered as a row header (`<th scope="row">`). */
  rowHeader?: boolean;
}

export interface TableProps<Row> {
  /** Required: names the table for assistive technology. Hide it with `hideCaption`. */
  caption: ReactNode;
  hideCaption?: boolean;
  columns: Array<Column<Row>>;
  rows: Row[];
  rowKey: (row: Row) => string;
  /** The row being worked on: gets the selected bar (a mark, not just a tint). */
  isSelected?: (row: Row) => boolean;
  /** Shown in a single full-width cell when there are no rows. */
  empty?: ReactNode;
  className?: string;
}

/**
 * A semantic data table. Wide tables scroll inside a focusable, labelled region rather than
 * widening the page, so they stay usable on a phone and by keyboard.
 */
export function Table<Row>({
  caption,
  hideCaption = false,
  columns,
  rows,
  rowKey,
  isSelected,
  empty = 'Nothing to show.',
  className,
}: TableProps<Row>) {
  const captionId = `table${useId()}`;
  return (
    <div
      className={cx(styles.scroller, className)}
      role="region"
      aria-labelledby={captionId}
      tabIndex={0}
    >
      <table className={styles.table}>
        <caption id={captionId} className={cx(styles.caption, hideCaption && 'visually-hidden')}>
          {caption}
        </caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cx(styles.th, column.numeric && styles.numeric)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className={cx(styles.td, styles.empty)} colSpan={columns.length}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={styles.row}
                data-selected={isSelected?.(row) || undefined}
              >
                {columns.map((column) => {
                  const className = cx(styles.td, column.numeric && styles.numeric);
                  return column.rowHeader ? (
                    <th key={column.key} scope="row" className={cx(className, styles.rowHeader)}>
                      {column.cell(row)}
                    </th>
                  ) : (
                    <td key={column.key} className={className}>
                      {column.cell(row)}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
