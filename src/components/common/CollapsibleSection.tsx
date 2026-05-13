import { useState, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Reusable collapsible section card.
 *
 * Mirrors the existing settings-card shell (`bg-white rounded-2xl
 * shadow-sm`) but with the body hidden behind a click-to-expand header.
 * Keeps the rounded-corner + icon-circle pattern intact so an existing
 * page can swap a `<div className="bg-white …">` for `<CollapsibleSection>`
 * without restyling.
 *
 * Used by the Settings page (May 2026) to compact ~10 always-open
 * sections into a scannable list of headers — user feedback was that
 * the page was too long to navigate on mobile. Each section now opens
 * only when tapped.
 */
interface Props {
  /** Lucide icon to render in the colored circle on the left of the header. */
  icon: ReactNode;
  /** Tailwind classes for the icon circle background (e.g. "bg-blue-50 text-blue-500"). */
  iconClass?: string;
  /** Bold section title shown in the header. */
  title: string;
  /** Optional subtitle/description shown below the title. */
  subtitle?: string;
  /** Render-prop for the body. Only mounted when expanded so children's data fetching is deferred. */
  children: ReactNode;
  /** Whether the section is expanded on first render. Default: false. */
  defaultOpen?: boolean;
}

export function CollapsibleSection({
  icon,
  iconClass = 'bg-gray-100 text-gray-500',
  title,
  subtitle,
  children,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 p-4 text-left hover:bg-gray-50 transition-colors"
        aria-expanded={open}
      >
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${iconClass}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-900 truncate">{title}</h3>
          {subtitle && (
            <p className="text-xs text-gray-500 truncate">{subtitle}</p>
          )}
        </div>
        <ChevronDown
          className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 -mt-1">
          {children}
        </div>
      )}
    </div>
  );
}

export default CollapsibleSection;
