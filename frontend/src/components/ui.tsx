import type { ReactNode } from 'react';
import type { AttributionClass, CaseStatus, RiskLevel } from '../api/types';

export const DISCLAIMER = 'Blockchain attribution is an analytical inference and does not by itself establish beneficial ownership.';

const pill = 'inline-block rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide whitespace-nowrap';

const CLASS_STYLE: Record<AttributionClass, string> = {
  CONFIRMED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  STRONGLY_INFERRED: 'bg-teal-50 text-teal-800 border-teal-200',
  PROBABLE: 'bg-sky-50 text-sky-800 border-sky-200',
  POSSIBLE: 'bg-amber-50 text-amber-800 border-amber-200',
  LOW_CONFIDENCE: 'bg-orange-50 text-orange-800 border-orange-200',
  UNKNOWN: 'bg-slate-100 text-slate-600 border-slate-300',
};
export const classLabel = (c: AttributionClass) => c.replace('_', ' ').toLowerCase().replace(/^\w/, (x) => x.toUpperCase());
export const ClassBadge = ({ value }: { value: AttributionClass }) => <span className={`${pill} ${CLASS_STYLE[value]}`}>{classLabel(value)}</span>;

const RISK_STYLE: Record<RiskLevel, string> = {
  LOW: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  MEDIUM: 'bg-amber-50 text-amber-800 border-amber-200',
  HIGH: 'bg-orange-50 text-orange-800 border-orange-200',
  CRITICAL: 'bg-red-50 text-red-800 border-red-200',
};
export const RiskBadge = ({ value }: { value: RiskLevel }) => <span className={`${pill} ${RISK_STYLE[value]}`}>{value}</span>;

const STATUS_STYLE: Record<CaseStatus, string> = {
  OPEN: 'bg-slate-100 text-slate-700 border-slate-300',
  ANALYZING: 'bg-sky-50 text-sky-800 border-sky-200',
  REVIEW: 'bg-violet-50 text-violet-800 border-violet-200',
  CLOSED: 'bg-zinc-100 text-zinc-600 border-zinc-300',
};
export const StatusBadge = ({ value }: { value: CaseStatus }) => <span className={`${pill} ${STATUS_STYLE[value]}`}>{value}</span>;

export const DemoBadge = () => <span className={`${pill} bg-amber-100 text-amber-900 border-amber-300`} title="Synthetic demonstration data, not real-world attribution">DEMO</span>;

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-surface shadow-sm">
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          {title && <h2 className="text-xs font-bold uppercase tracking-wider text-brand">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export const btn = 'rounded bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brandhover disabled:cursor-not-allowed disabled:opacity-50';
export const btnGhost = 'rounded border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-panel disabled:cursor-not-allowed disabled:opacity-50';
export const input = 'rounded border border-line bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand';

export const ErrorText = ({ children }: { children: ReactNode }) => (children ? <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700">{children}</p> : null);

export const fmtDate = (s: string) => new Date(s).toLocaleString();
export const shortAddr = (a: string) => (a.length > 18 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);

export function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2" title={`${value}/100`}>
      <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full bg-brand" style={{ width: `${value}%` }} />
      </div>
      <span className="text-sm font-semibold tabular-nums text-ink">{value}</span>
    </div>
  );
}
