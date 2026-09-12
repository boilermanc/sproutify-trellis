import React from 'react';

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

export const Page = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cx('tr-page', className)} {...props} />
);

export const PageHeader = ({ className, ...props }: React.HTMLAttributes<HTMLElement>) => (
  <header className={cx('tr-page-header', className)} {...props} />
);

export const PageTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h1 className={cx('tr-page-title', className)} {...props} />
);

export const SectionHeader = ({ className, ...props }: React.HTMLAttributes<HTMLElement>) => (
  <header className={cx('tr-card-header', className)} {...props} />
);

export const SectionTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cx('tr-section-title', className)} {...props} />
);

export const Card = ({ className, ...props }: React.HTMLAttributes<HTMLElement>) => (
  <section className={cx('tr-card', className)} {...props} />
);

export const CardBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cx('tr-card-body', className)} {...props} />
);

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export const Button = ({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) => (
  <button type={type} className={cx(`tr-btn-${variant}`, className)} {...props} />
);

export const FieldLabel = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cx('tr-label block', className)} {...props} />
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cx('tr-input', className)} {...props} />,
);
Input.displayName = 'Input';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cx('tr-input', className)} {...props} />,
);
Select.displayName = 'Select';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cx('tr-input', className)} {...props} />,
);
Textarea.displayName = 'Textarea';

export const StatusLabel = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cx('tr-status', className)} {...props} />
);

export const EmptyState = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cx('tr-empty', className)} {...props} />
);

export const DataRow = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cx('grid min-h-11 items-center gap-3 border-b border-trellis-line px-4 py-3 last:border-b-0', className)} {...props} />
);

export const Tabs = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cx('tr-tabs', className)} role="tablist" {...props} />
);

export interface TabProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export const Tab = ({ active = false, className, type = 'button', ...props }: TabProps) => (
  <button
    type={type}
    role="tab"
    aria-selected={active}
    className={cx('tr-tab', active && 'tr-tab-active', className)}
    {...props}
  />
);

export interface ModalShellProps extends React.HTMLAttributes<HTMLDivElement> {
  labelledBy?: string;
  panelClassName?: string;
}

export const ModalShell = ({ labelledBy, className, panelClassName, children, ...props }: ModalShellProps) => (
  <div className={cx('tr-modal-backdrop', className)} {...props}>
    <div className={cx('tr-modal max-w-2xl', panelClassName)} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      {children}
    </div>
  </div>
);

export interface DrawerProps extends React.HTMLAttributes<HTMLElement> {
  side?: 'left' | 'right';
}

export const Drawer = ({ side = 'right', className, ...props }: DrawerProps) => (
  <aside
    className={cx(
      'fixed inset-y-0 z-50 w-full max-w-md border-trellis-line bg-white shadow-2xl',
      side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
      className,
    )}
    {...props}
  />
);

