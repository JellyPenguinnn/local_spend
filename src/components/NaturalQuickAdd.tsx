import { useEffect, useRef } from "react";
import { Sparkles, Wand2 } from "lucide-react";

interface NaturalQuickAddProps {
  value: string;
  message?: string;
  isParsing?: boolean;
  aiEnabled?: boolean;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onDraft: () => void;
}

export const NATURAL_ENTRY_EXAMPLE = "kopi 2.20 yakun paynow";

export function NaturalQuickAdd({ value, message, isParsing = false, aiEnabled = false, autoFocus = false, onChange, onDraft }: NaturalQuickAddProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [autoFocus]);

  return (
    <div className="quick-add quiet">
      <label>
        <span>Or enter naturally</span>
        <div className="inline-input">
          <input
            ref={inputRef}
            autoFocus={autoFocus}
            value={value}
            placeholder={NATURAL_ENTRY_EXAMPLE}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onDraft();
              }
            }}
          />
          <button type="button" className="secondary-button" onClick={onDraft} disabled={isParsing}>
            <Wand2 size={16} />
            Fill
          </button>
        </div>
      </label>
      {aiEnabled && (
        <span className="ai-label">
          <Sparkles size={14} />
          AI optional
        </span>
      )}
      {message && <p className="form-note" aria-live="polite">{message}</p>}
    </div>
  );
}
