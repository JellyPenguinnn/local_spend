import { Sparkles, Wand2 } from "lucide-react";

interface NaturalQuickAddProps {
  value: string;
  message?: string;
  isParsing?: boolean;
  aiEnabled?: boolean;
  onChange: (value: string) => void;
  onDraft: () => void;
}

export const NATURAL_ENTRY_EXAMPLE = "kopi 2.20 yakun paynow";

export function NaturalQuickAdd({ value, message, isParsing = false, aiEnabled = false, onChange, onDraft }: NaturalQuickAddProps) {
  return (
    <div className="quick-add quiet">
      <label>
        <span>Quick draft</span>
        <div className="inline-input">
          <input
            value={value}
            placeholder={NATURAL_ENTRY_EXAMPLE}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onDraft();
            }}
          />
          <button type="button" className="secondary-button" onClick={onDraft} disabled={isParsing}>
            <Wand2 size={16} />
            Draft
          </button>
        </div>
      </label>
      {aiEnabled && (
        <span className="ai-label">
          <Sparkles size={14} />
          AI optional
        </span>
      )}
      {message && <p className="form-note">{message}</p>}
    </div>
  );
}
