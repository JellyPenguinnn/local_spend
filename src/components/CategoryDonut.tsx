import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { MouseEvent } from "react";
import type { CategoryTotal } from "../lib/analytics";

interface CategoryDonutProps {
  totals: CategoryTotal[];
  selectedCategoryId?: string | null;
  onSelect?: (categoryId: string | null) => void;
}

export default function CategoryDonut({ totals, selectedCategoryId, onSelect }: CategoryDonutProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart onClick={() => onSelect?.(null)}>
        <Pie
          data={totals}
          dataKey="total"
          nameKey="name"
          innerRadius="54%"
          outerRadius="78%"
          paddingAngle={2}
          onClick={(entry: unknown, _index: number, event: MouseEvent<SVGElement>) => {
            event.stopPropagation();
            const categoryId = (entry as Partial<CategoryTotal>).categoryId;
            if (categoryId) onSelect?.(categoryId);
          }}
        >
          {totals.map((entry) => {
            const isSelected = selectedCategoryId === entry.categoryId;
            const isDimmed = Boolean(selectedCategoryId && !isSelected);
            return (
              <Cell
                key={entry.categoryId}
                fill={isSelected ? `color-mix(in srgb, ${entry.color} 72%, var(--text))` : isDimmed ? `color-mix(in srgb, ${entry.color} 30%, var(--surface))` : entry.color}
                opacity={1}
                stroke={isSelected ? "var(--surface)" : "color-mix(in srgb, var(--surface) 88%, transparent)"}
                strokeWidth={isSelected ? 5 : 1}
                style={{
                  cursor: "pointer",
                  filter: isSelected ? "drop-shadow(0 7px 12px color-mix(in srgb, var(--text) 14%, transparent))" : "none",
                  transition: "filter 180ms ease, opacity 180ms ease"
                }}
              />
            );
          })}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
