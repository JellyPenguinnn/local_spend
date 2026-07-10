import type { CSSProperties } from "react";
import { categoryIcon } from "../lib/categories";
import type { Category } from "../lib/types";

interface CategoryChipProps {
  category?: Category | null;
  label?: string;
  compact?: boolean;
}

export function CategoryChip({ category, label, compact = false }: CategoryChipProps) {
  return (
    <span className={compact ? "category-chip compact" : "category-chip"} style={{ "--chip-color": category?.color ?? "#8a98a8" } as CSSProperties}>
      <span className="category-chip-icon">{categoryIcon(category)}</span>
      {label !== "" && <span className="category-chip-label">{label ?? category?.name ?? "Other"}</span>}
    </span>
  );
}
