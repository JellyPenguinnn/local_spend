import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { formatMonthKey, getMonthParts, monthLabel, toIsoDate } from "../lib/date";

interface MonthPickerProps {
  month: string;
  onChange: (month: string) => void;
}

export function MonthPicker({ month, onChange }: MonthPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftYear, setDraftYear] = useState(getMonthParts(month).year);
  const [popoverPosition, setPopoverPosition] = useState({ left: 16, top: 16 });
  const displayRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const yearOptions = useMemo(() => buildYearOptions(month), [month]);
  const monthIndex = getMonthParts(month).monthIndex;

  function shift(delta: number) {
    const { year, monthIndex } = getMonthParts(month);
    onChange(toIsoDate(year, monthIndex + delta, 1).slice(0, 7));
  }

  useEffect(() => {
    if (isOpen) {
      setDraftYear(getMonthParts(month).year);
    }
  }, [isOpen, month]);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        displayRef.current?.focus();
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    function placePopover() {
      const anchor = displayRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = Math.min(340, window.innerWidth - 32);
      const left = Math.min(Math.max(16, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - width - 16);
      const estimatedHeight = Math.min(310, window.innerHeight - 32);
      const below = anchor.bottom + 8;
      const top = below + estimatedHeight <= window.innerHeight - 16 ? below : Math.max(16, anchor.top - estimatedHeight - 8);
      setPopoverPosition({ left, top });
    }

    placePopover();
    window.addEventListener("resize", placePopover);
    window.addEventListener("scroll", placePopover, true);
    return () => {
      window.removeEventListener("resize", placePopover);
      window.removeEventListener("scroll", placePopover, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    window.requestAnimationFrame(() => {
      popoverRef.current?.querySelector<HTMLElement>(".year-column .active")?.scrollIntoView?.({ block: "center" });
      popoverRef.current?.querySelector<HTMLElement>(".month-grid-compact .active")?.scrollIntoView?.({ block: "center" });
    });
  }, [isOpen]);

  function choose(year: number, nextMonthIndex: number) {
    onChange(toIsoDate(year, nextMonthIndex, 1).slice(0, 7));
    setIsOpen(false);
  }

  return (
    <div className={isOpen ? "month-picker open" : "month-picker"}>
      <button className="icon-button" type="button" onClick={() => shift(-1)} aria-label="Previous month" title="Previous month">
        <ChevronLeft size={18} />
      </button>
      <button
        ref={displayRef}
        className="month-display"
        type="button"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setIsOpen((value) => !value);
          }
        }}
        aria-expanded={isOpen}
        aria-label="Choose month"
        title="Choose month"
      >
        {monthLabel(month)}
        <ChevronDown size={16} />
      </button>
      <button className="icon-button" type="button" onClick={() => shift(1)} aria-label="Next month" title="Next month">
        <ChevronRight size={18} />
      </button>
      {isOpen && (
        createPortal(
          <div
            className="month-popover-layer"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) {
                setIsOpen(false);
                displayRef.current?.focus();
              }
            }}
          >
            <div
              className="month-popover"
              ref={popoverRef}
              role="dialog"
              aria-modal="true"
              aria-label="Choose month and year"
              style={
                {
                  "--month-popover-left": `${popoverPosition.left}px`,
                  "--month-popover-top": `${popoverPosition.top}px`
                } as CSSProperties
              }
            >
              <div className="month-popover-head">
                <strong>Choose month</strong>
                <span>{draftYear}</span>
              </div>
              <div className="month-column-labels" aria-hidden="true">
                <span>Year</span>
                <span>Month</span>
              </div>
              <div className="month-select-layout">
                <div className="year-column" aria-label="Choose year">
                  {yearOptions.map((year) => (
                    <button key={year} className={draftYear === year ? "active" : ""} type="button" onClick={() => setDraftYear(year)}>
                      {year}
                    </button>
                  ))}
                </div>
                <div className="month-grid-compact" aria-label="Choose month">
                  {Array.from({ length: 12 }, (_, optionMonthIndex) => {
                    const isActive = draftYear === getMonthParts(month).year && optionMonthIndex === monthIndex;
                    return (
                      <button key={optionMonthIndex} className={isActive ? "active" : ""} type="button" onClick={() => choose(draftYear, optionMonthIndex)}>
                        {new Intl.DateTimeFormat("en-SG", { month: "short" }).format(new Date(draftYear, optionMonthIndex, 1))}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      )}
    </div>
  );
}

function buildYearOptions(selectedMonth: string): number[] {
  const selectedYear = getMonthParts(selectedMonth).year;
  const currentYear = getMonthParts(formatMonthKey()).year;
  const endYear = Math.max(currentYear + 4, selectedYear + 1);
  const years: number[] = [];
  for (let year = 2025; year <= endYear; year += 1) {
    years.push(year);
  }
  return years;
}
