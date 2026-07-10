import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { searchExpenses } from "../lib/analytics";
import { canDeleteCategory } from "../lib/categories";
import { createId } from "../lib/defaults";
import { parseMoney } from "../lib/money";
import type { Category, Expense, ProfileData } from "../lib/types";
import { EmptyState } from "../components/EmptyState";
import { ExpenseForm } from "../components/ExpenseForm";
import { ExpenseList } from "../components/ExpenseList";

interface CategoriesScreenProps {
  data: ProfileData;
  saveData: (data: ProfileData) => Promise<void>;
  upsertExpense: (expense: Expense) => Promise<void>;
  deleteExpense: (expenseId: string) => Promise<void>;
}

export function CategoriesScreen({ data, saveData, upsertExpense, deleteExpense }: CategoriesScreenProps) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#4f8fcf");
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [filters, setFilters] = useState({
    text: "",
    categoryId: "",
    startDate: "",
    endDate: "",
    minAmount: "",
    maxAmount: ""
  });
  const filteredExpenses = useMemo(
    () =>
      searchExpenses(data.expenses, data.categories, {
        text: filters.text,
        categoryId: filters.categoryId || undefined,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        minAmount: filters.minAmount ? parseMoney(filters.minAmount) : null,
        maxAmount: filters.maxAmount ? parseMoney(filters.maxAmount) : null
      }),
    [data.categories, data.expenses, filters]
  );

  async function addCategory() {
    const name = newName.trim();
    if (!name) return;
    if (data.categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
      alert("That category already exists.");
      return;
    }
    const category: Category = {
      id: createId("cat"),
      name,
      color: newColor,
      icon: null,
      sortOrder: data.categories.length,
      isDefault: false
    };
    await saveData({ ...data, categories: [...data.categories, category] });
    setNewName("");
  }

  async function updateCategory(category: Category, patch: Partial<Category>) {
    await saveData({
      ...data,
      categories: data.categories.map((item) => (item.id === category.id ? { ...item, ...patch } : item))
    });
  }

  async function deleteCategory(category: Category) {
    const expenseCount = data.expenses.filter((expense) => expense.categoryId === category.id).length;
    const allowed = canDeleteCategory(category, expenseCount);
    if (!allowed.ok) {
      alert(allowed.reason ?? "This category cannot be removed.");
      return;
    }
    if (!confirm(`Delete category "${category.name}"?`)) return;
    await saveData({
      ...data,
      categories: data.categories.filter((item) => item.id !== category.id)
    });
  }

  return (
    <div className="categories-screen">
      <div className="screen-grid categories-layout">
        <section className="panel records-panel">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Records</p>
              <h2>Find and fix entries</h2>
            </div>
            <span className="muted small">{filteredExpenses.length} match{filteredExpenses.length === 1 ? "" : "es"}</span>
          </div>
          <div className="filter-grid">
            <label className="span-2">
              <span>Search</span>
              <input value={filters.text} onChange={(event) => setFilters({ ...filters, text: event.target.value })} placeholder="merchant, note, payment" />
            </label>
            <label>
              <span>Category</span>
              <select value={filters.categoryId} onChange={(event) => setFilters({ ...filters, categoryId: event.target.value })}>
                <option value="">All categories</option>
                {data.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>From</span>
              <input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} />
            </label>
            <label>
              <span>To</span>
              <input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} />
            </label>
            <label>
              <span>Min</span>
              <input inputMode="decimal" value={filters.minAmount} onChange={(event) => setFilters({ ...filters, minAmount: event.target.value })} />
            </label>
            <label>
              <span>Max</span>
              <input inputMode="decimal" value={filters.maxAmount} onChange={(event) => setFilters({ ...filters, maxAmount: event.target.value })} />
            </label>
          </div>

          {editingExpense && (
            <ExpenseForm
              compact
              categories={data.categories}
              settings={data.appSettings}
              expenses={data.expenses}
              defaultDate={editingExpense.date}
              editingExpense={editingExpense}
              onCancelEdit={() => setEditingExpense(null)}
              onSave={(expense) => {
                void upsertExpense(expense);
                setEditingExpense(null);
              }}
            />
          )}

          {filteredExpenses.length === 0 ? (
            <EmptyState title="No matching records" body="No record found for this filter." />
          ) : (
            <ExpenseList expenses={filteredExpenses} categories={data.categories} currency={data.appSettings.currency} onEdit={setEditingExpense} onDelete={(id) => void deleteExpense(id)} />
          )}
        </section>

        <section className="panel labels-panel">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Labels</p>
              <h2>Categories</h2>
            </div>
          </div>
          <div className="category-editor-list">
            {data.categories.map((category) => {
              const count = data.expenses.filter((expense) => expense.categoryId === category.id).length;
              return (
                <article className="category-editor-row" key={category.id}>
                  <input type="color" value={category.color} onChange={(event) => void updateCategory(category, { color: event.target.value })} aria-label={`Color for ${category.name}`} />
                  <input value={category.name} onChange={(event) => void updateCategory(category, { name: event.target.value })} />
                  <span className="muted small">{count}</span>
                  <button className="icon-button danger-icon" type="button" onClick={() => void deleteCategory(category)} aria-label="Delete category" title="Delete category">
                    <Trash2 size={16} />
                  </button>
                </article>
              );
            })}
          </div>
          <div className="add-row category-add-row">
            <input value={newName} placeholder="New category" onChange={(event) => setNewName(event.target.value)} />
            <input type="color" value={newColor} onChange={(event) => setNewColor(event.target.value)} aria-label="New category color" />
            <button className="secondary-button" type="button" onClick={() => void addCategory()}>
              <Plus size={16} />
              Add
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
