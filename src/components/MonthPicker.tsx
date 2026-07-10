import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { formatMonthKey, getMonthParts, monthLabel, toIsoDate } from "../lib/date";

interface MonthPickerProps {
  month: string;
  onChange: (month: string) => void;
}

export function MonthPicker({ month, onChange }: MonthPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftYear, setDraftYear] = useState(getMonthParts(month).year);
  const rootRef = useRef<HTMLDivElement>(null);
  const yearOptions = useMemo(() => buildYearOptions(month), [month]);
  const monthIndex = getMonthParts(month).monthIndex;

  function shift(delta: number) {
    const { year, monthIndex } = getMonthParts(month);
    onChange(toIsoDate(year, monthIndex + delta, 1).slice(0, 7));
  }

  useEffect(() => {
    function closeOnOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setDraftYear(getMonthParts(month).year);
    }
  }, [isOpen, month]);

  function choose(year: number, nextMonthIndex: number) {
    onChange(toIsoDate(year, nextMonthIndex, 1).slice(0, 7));
    setIsOpen(false);
  }

  return (
    <div className={isOpen ? "month-picker open" : "month-picker"} ref={rootRef}>
      <button className="icon-button" type="button" onClick={() => shift(-1)} aria-label="Previous month" title="Previous month">
        <ChevronLeft size={18} />
      </button>
      <button
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
        <div className="month-popover" role="dialog" aria-label="Choose month and year">
          <div className="month-popover-head">
            <strong>Choose month</strong>
            <span>{draftYear}</span>
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
