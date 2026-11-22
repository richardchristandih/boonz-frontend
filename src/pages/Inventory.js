import React, { useEffect, useState, useCallback, useRef } from "react";
import WorkspacePage, { WorkspaceMetrics } from "../components/WorkspacePage";
import { FiEdit2, FiFileText, FiPlus, FiSearch, FiTrash2 } from "react-icons/fi";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmDialog";
import {
  listInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  updateInventoryQuantity,
} from "../services/inventory";
import "./Inventory.css";

// Default inventory items based on user's list
const DEFAULT_ITEMS = [
  // Bahan Barista (1-27)
  { name: "Le Minerale", unit: "botol", category: "Barista" },
  { name: "Sprite", unit: "botol", category: "Barista" },
  { name: "Fanta", unit: "botol", category: "Barista" },
  { name: "Coca-Cola", unit: "botol", category: "Barista" },
  { name: "Gula merah", unit: "kg", category: "Barista" },
  { name: "12 oz gelas + tutup", unit: "pack", category: "Barista" },
  { name: "16 oz gelas + tutup", unit: "pack", category: "Barista" },
  { name: "Biji selasih", unit: "pack", category: "Barista" },
  { name: "Nescafe Classic 2g", unit: "pack", category: "Barista" },
  { name: "Bamboo", unit: "bungkus", category: "Barista" },
  { name: "Lychee Puree", unit: "kg", category: "Barista" },
  { name: "Pistachio sauce", unit: "kg", category: "Barista" },
  { name: "Peach Puree", unit: "kg", category: "Barista" },
  { name: "Caramel syrup", unit: "liter", category: "Barista" },
  { name: "Sprite", unit: "liter", category: "Barista" },
  { name: "Diamond milk", unit: "liter", category: "Barista" },
  { name: "Fresh milk", unit: "liter", category: "Barista" },
  { name: "Oatmilk", unit: "liter", category: "Barista" },
  { name: "SKM", unit: "kaleng", category: "Barista" },
  { name: "Creamer cair", unit: "botol", category: "Barista" },
  { name: "Gula cair", unit: "liter", category: "Barista" },
  { name: "Lychee nata", unit: "kg", category: "Barista" },
  { name: "Whipped cream Dairy Whip", unit: "gr", category: "Barista" },
  { name: "Biscoff biscuit", unit: "pack", category: "Barista" },
  { name: "Biscoff selai smooth", unit: "jar", category: "Barista" },
  { name: "Buah lemon", unit: "pcs", category: "Barista" },
  { name: "Strawberry beku", unit: "pack", category: "Barista" },
  // Bahan Barista (28-47)
  { name: "Lychee kaleng", unit: "kaleng", category: "Barista" },
  { name: "Peach kaleng", unit: "kaleng", category: "Barista" },
  { name: "Sirup chocolate 623 gr", unit: "botol", category: "Barista" },
  { name: "Butterfly Pea Syrup Delifru", unit: "liter", category: "Barista" },
  { name: "Peach Garden Da Vinci", unit: "botol", category: "Barista" },
  { name: "Vanilla Torani", unit: "ml", category: "Barista" },
  { name: "Lemonade Syrup Delifru", unit: "liter", category: "Barista" },
  { name: "Lychee Syrup Delifru", unit: "liter", category: "Barista" },
  { name: "Blue Curacao", unit: "ml", category: "Barista" },
  { name: "Brown Sugar Drip", unit: "ml", category: "Barista" },
  { name: "Pistachio", unit: "pack", category: "Barista" },
  { name: "Avocado", unit: "pcs", category: "Barista" },
  { name: "Biji Kopi", unit: "pack", category: "Barista" },
  { name: "Matcha Latte", unit: "pack", category: "Barista" },
  { name: "Matcha Hojicha", unit: "pack", category: "Barista" },
  { name: "V-soy", unit: "pack", category: "Barista" },
  { name: "Gula matcha", unit: "botol", category: "Barista" },
  { name: "Lemon Puree", unit: "botol", category: "Barista" },
  { name: "Bubuk coklat", unit: "pack", category: "Barista" },
  { name: "Sakura Delifru", unit: "botol", category: "Barista" },
  // Additional Kitchen items
  { name: "Onion powder McCormick", unit: "botol", category: "Kitchen" },
  { name: "Garlic powder McCormick", unit: "botol", category: "Kitchen" },
  { name: "Paprika ground McCormick", unit: "botol", category: "Kitchen" },
  { name: "BBQ sauce", unit: "botol", category: "Kitchen" },
  { name: "Trivelli black truffle oil", unit: "botol", category: "Kitchen" },
  { name: "Saos keju asin", unit: "botol", category: "Kitchen" },
  { name: "Selada", unit: "pack", category: "Kitchen" },
  { name: "Pickle", unit: "jar", category: "Kitchen" },
  { name: "Chicken Wings", unit: "pack", category: "Kitchen" },
  { name: "Chicken Strips", unit: "pack", category: "Kitchen" },
  { name: "Minced Beef", unit: "pack", category: "Kitchen" },
  { name: "Chicken Breast", unit: "pack", category: "Kitchen" },
  { name: "Mushroom", unit: "pack", category: "Kitchen" },
  { name: "Truffle Mayo", unit: "pack", category: "Kitchen" },
  { name: "Mayonaise", unit: "pack", category: "Kitchen" },
  { name: "French Fries", unit: "pack", category: "Kitchen" },
  { name: "Burger Buns", unit: "pack", category: "Kitchen" },
  { name: "Boonz Sauce", unit: "pack", category: "Kitchen" },
  { name: "Onion", unit: "pack", category: "Kitchen" },
  { name: "Saus Tomat", unit: "pcs", category: "Kitchen" },
  { name: "Saus Sambal", unit: "pack", category: "Kitchen" },
  { name: "Saus mayonnaise pedas", unit: "pack", category: "Kitchen" },
  { name: "Saus Tomat Sachet", unit: "pack", category: "Kitchen" },
  { name: "Kucai", unit: "ikat", category: "Kitchen" },
  { name: "Tomat Fresh", unit: "pcs", category: "Kitchen" },
  { name: "Garlic Mayo", unit: "container", category: "Kitchen" },
  { name: "Keju Slice", unit: "pack", category: "Kitchen" },
  { name: "Bubuk Marinasi Ayam", unit: "pack", category: "Kitchen" },
  { name: "Terigu Segitiga", unit: "pack", category: "Kitchen" },
  { name: "Tepung Terigu Marinasi", unit: "pack", category: "Kitchen" },
  { name: "Minyak", unit: "dirigen", category: "Kitchen" },
  { name: "Mentega", unit: "kaleng", category: "Kitchen" },
  { name: "Semprotan Pembersih Grill", unit: "pcs", category: "Kitchen" },
  { name: "Smoke Beef", unit: "pack", category: "Kitchen" },
  { name: "Sabun Cuci Piring", unit: "dirigen", category: "Kitchen" },
];

const CATEGORIES = ["Barista", "Kitchen"];
const dateKey = (date) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};
const itemId = (item) => item._id || item.id;
const stockKey = ({ category, name, unit = "pcs" }) =>
  JSON.stringify([category, name.trim().toLowerCase(), unit.trim().toLowerCase()]);
const updatedAt = (item) => new Date(item.updatedAt || item.createdAt || NaN);
const dateFormat = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
});
const sortItems = (items) => [...items].sort((a, b) => a.name.localeCompare(b.name));

function InventoryQuantity({ item, saving, onSave }) {
  const [draft, setDraft] = useState(null);
  const quantity = Number(item.quantity ?? 0);
  const changed = draft !== null && draft !== String(quantity);

  async function save(event) {
    event.preventDefault();
    if (changed && await onSave(Number(draft))) setDraft(null);
  }

  return (
    <form className="quantity-controls" onSubmit={save}>
      <button
        type="button"
        className="qty-btn"
        aria-label={`Decrease ${item.name} quantity`}
        disabled={saving || changed || quantity === 0}
        onClick={() => onSave(Math.max(0, quantity - 1))}
      >−</button>
      <input
        type="number"
        className="qty-input"
        value={draft ?? quantity}
        min="0"
        step="any"
        required
        inputMode="decimal"
        readOnly={saving}
        aria-label={`${item.name} quantity`}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !saving) setDraft(null);
        }}
      />
      <button
        type="button"
        className="qty-btn plus"
        aria-label={`Increase ${item.name} quantity`}
        disabled={saving || changed}
        onClick={() => onSave(quantity + 1)}
      >+</button>
      {changed && <button className="inventory-button" type="submit" disabled={saving}>Save</button>}
      {saving && <span role="status" className="inventory-saving">Saving…</span>}
    </form>
  );
}

function InventoryEditor({ editor, onChange, onClose, onSave, saving, error }) {
  const dialog = useRef(null);
  const isNote = editor.mode === "note";
  const isNew = editor.mode === "add";
  const title = isNote ? `Notes · ${editor.name}` : isNew ? "Add item" : "Edit item";

  useEffect(() => {
    dialog.current.showModal();
  }, []);

  function field(event) {
    onChange({ ...editor, [event.target.name]: event.target.value });
  }

  return (
    <dialog
      className="inventory-dialog"
      ref={dialog}
      aria-labelledby="inventory-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <form onSubmit={(event) => { event.preventDefault(); onSave(); }}>
        <h2 id="inventory-dialog-title">{title}</h2>
        <fieldset disabled={saving}>
          {!isNote && (
            <>
              <label>Item name<input name="name" value={editor.name} onChange={field} required autoFocus /></label>
              <label>Unit<input name="unit" value={editor.unit} onChange={field} placeholder="pcs" /></label>
              <label>
                Category
                <select name="category" value={editor.category} onChange={field}>
                  {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
              {isNew && (
                <label>
                  Initial quantity
                  <input type="number" name="quantity" min="0" step="any" required value={editor.quantity} onChange={field} />
                </label>
              )}
            </>
          )}
          <label>
            Notes
            <textarea name="notes" value={editor.notes} onChange={field} rows={isNote ? 5 : 3} autoFocus={isNote} />
          </label>
        </fieldset>
        {error && <p className="inventory-editor-error" role="alert">{error}</p>}
        <div className="inventory-dialog-actions">
          <button className="inventory-button" type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="inventory-button primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : isNew ? "Add item" : "Save changes"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function Inventory() {
  const { show } = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [selectedCategory, setSelectedCategory] = useState("Barista");
  const [selectedDate, setSelectedDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [editor, setEditor] = useState(null);
  const [editorError, setEditorError] = useState("");
  const [savingItems, setSavingItems] = useState([]);
  const pendingItems = useRef(new Set());
  const [seedIncomplete, setSeedIncomplete] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoadState("loading");
    try {
      const data = await listInventoryItems();
      const unique = new Map();
      for (const item of data) {
        const key = itemId(item);
        const previous = unique.get(key);
        if (!previous || updatedAt(item) > updatedAt(previous)) unique.set(key, item);
      }
      setItems(sortItems([...unique.values()]));
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function withPendingItem(key, action) {
    if (pendingItems.current.has(key)) return false;
    pendingItems.current.add(key);
    setSavingItems((previous) => [...previous, key]);
    try {
      return await action();
    } finally {
      pendingItems.current.delete(key);
      setSavingItems((previous) => previous.filter((pending) => pending !== key));
    }
  }

  function replaceItem(updated) {
    setItems((previous) => sortItems(
      previous.map((item) => itemId(item) === itemId(updated) ? { ...item, ...updated } : item)
    ));
  }

  function saveQuantity(item, quantity) {
    return withPendingItem(itemId(item), async () => {
      try {
        replaceItem(await updateInventoryQuantity(itemId(item), quantity));
        return true;
      } catch (error) {
        show(error.response?.data?.error || "Couldn’t save the quantity. Try again.", { type: "error" });
        return false;
      }
    });
  }

  function saveEditor() {
    const name = editor.name.trim();
    if (!name) {
      setEditorError("Enter an item name.");
      return;
    }
    return withPendingItem(editor.id || "add", async () => {
      setEditorError("");
      const notes = editor.notes.trim();
      const details = { name, notes, unit: editor.unit.trim() || "pcs", category: editor.category };
      try {
        if (editor.mode === "add") {
          const added = await createInventoryItem({ ...details, quantity: Number(editor.quantity) });
          setItems((previous) => sortItems([...previous, added]));
          setSelectedCategory(added.category);
          setSearchTerm("");
          setSelectedDate("");
        } else {
          const updated = await updateInventoryItem(editor.id, editor.mode === "note" ? { notes } : details);
          replaceItem(updated);
        }
        setEditor(null);
        show("Inventory item saved.", { type: "success" });
      } catch (error) {
        setEditorError(error.response?.data?.error || "Couldn’t save the item. Try again.");
      }
    });
  }

  function removeItem(item) {
    const key = itemId(item);
    return withPendingItem(key, async () => {
      if (!await confirm({
        title: "Delete item?",
        message: `Remove ${item.name} from inventory?`,
        confirmText: "Delete",
      })) return;
      try {
        await deleteInventoryItem(key);
        setItems((previous) => previous.filter((entry) => itemId(entry) !== key));
        show("Inventory item deleted.", { type: "success" });
      } catch (error) {
        show(error.response?.data?.error || "Couldn’t delete the item. Try again.", { type: "error" });
      }
    });
  }

  function initializeDefaults() {
    return withPendingItem("initialize", async () => {
      if (!await confirm({
        title: "Add default inventory?",
        message: "Add the default Barista and Kitchen items with a starting quantity of zero?",
        confirmText: "Add defaults",
      })) return;
      let added = 0;
      try {
        const current = await listInventoryItems();
        const present = new Set(current.map(stockKey));
        for (const item of DEFAULT_ITEMS) {
          if (present.has(stockKey(item))) continue;
          const saved = await createInventoryItem({ ...item, quantity: 0 });
          setItems((previous) => sortItems([...previous, saved]));
          present.add(stockKey(saved));
          added += 1;
        }
        setSeedIncomplete(false);
        show(`Added ${added} default items.`, { type: "success" });
      } catch {
        setSeedIncomplete(true);
        show(`Added ${added} default items before the import stopped. Try again to add the remaining items.`, { type: "error" });
      }
      await fetchItems();
    });
  }

  function openEditor(item, mode) {
    setEditorError("");
    setEditor({
      mode,
      id: itemId(item),
      name: item.name ?? "",
      unit: item.unit ?? "",
      category: item.category ?? selectedCategory,
      quantity: item.quantity ?? 0,
      notes: item.notes ?? "",
    });
  }

  const query = searchTerm.trim().toLowerCase();
  const categoryItems = items.filter((item) => item.category === selectedCategory);
  const outOfStock = categoryItems.filter((item) => Number(item.quantity ?? 0) === 0).length;
  const filteredItems = categoryItems.filter((item) =>
    (stockFilter === "all" || (Number(item.quantity ?? 0) === 0) === (stockFilter === "out")) &&
    (!query || `${item.name} ${item.unit ?? ""}`.toLowerCase().includes(query)) &&
    (!selectedDate || dateKey(updatedAt(item)) === selectedDate)
  );
  const initializing = savingItems.includes("initialize");
  const showSeedAction = loadState === "ready" && (items.length === 0 || seedIncomplete);
  const filtersActive = Boolean(query || selectedDate || stockFilter !== "all");
  const clearFilters = () => { setSearchTerm(""); setSelectedDate(""); setStockFilter("all"); };

  return (
    <WorkspacePage title="Inventory" description="Count ingredients and keep Barista and Kitchen stock up to date."
      className="inventory-page" actions={<button type="button" className="workspace-button primary"
        onClick={() => openEditor({}, "add")} disabled={loadState !== "ready" || initializing}>
        <FiPlus aria-hidden="true" /> Add item
      </button>}>
      {loadState === "ready" && <WorkspaceMetrics label={`${selectedCategory} stock summary`} items={[
        [`${selectedCategory} items`, categoryItems.length],
        ["In stock", categoryItems.length - outOfStock],
        ["Out of stock", outOfStock],
      ]} />}

      <section className="inventory-panel" aria-label="Inventory items" aria-busy={loadState === "loading" || initializing}>
        <div className="inventory-toolbar">
          <div className="inventory-tabs" role="group" aria-label="Inventory category">
            {CATEGORIES.map((category) => (
              <button type="button" key={category} aria-pressed={selectedCategory === category} onClick={() => setSelectedCategory(category)}>
                {category}
              </button>
            ))}
          </div>
          <div className="inventory-filters">
            <label>
              Search items
              <span className="inventory-search">
                <FiSearch aria-hidden="true" />
                <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Name or unit" />
              </span>
            </label>
            <label>
              Last updated on
              <input type="date" value={selectedDate} max={dateKey(new Date())} onChange={(event) => setSelectedDate(event.target.value)} />
            </label>
            <label>
              Stock status
              <select aria-label="Stock status" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
                <option value="all">Any stock status</option>
                <option value="in">In stock</option>
                <option value="out">Out of stock</option>
              </select>
            </label>
            {filtersActive && <button className="inventory-button" type="button" onClick={clearFilters}>Clear filters</button>}
          </div>
          {showSeedAction && (
            <button className="inventory-button" type="button" disabled={initializing} onClick={initializeDefaults}>
              {initializing ? "Adding default items…" : seedIncomplete ? "Retry adding default items" : "Add default items"}
            </button>
          )}
        </div>

        {loadState === "loading" && <p className="inventory-state" role="status">Loading inventory…</p>}
        {loadState === "error" && (
          <div className="inventory-state" role="alert">
            <p>Couldn’t load inventory.</p>
            <button className="inventory-button" type="button" onClick={fetchItems}>Try again</button>
          </div>
        )}
        {loadState === "ready" && (filteredItems.length ? (
          <>
            <p className="inventory-result-count" role="status">{filteredItems.length} {filteredItems.length === 1 ? "item" : "items"}</p>
            <div className="inventory-table-wrapper">
              <table className="inventory-table" aria-label={`${selectedCategory} inventory`}>
                <thead><tr><th scope="col">Item</th><th scope="col">Quantity</th><th scope="col">Last updated</th><th scope="col">Actions</th></tr></thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const id = itemId(item);
                    const saving = savingItems.includes(id) || initializing;
                    const timestamp = updatedAt(item);
                    return (
                      <tr key={id}>
                        <th scope="row"><strong>{item.name}</strong><span className="inventory-unit">{item.unit || "pcs"}</span>
                          {Number(item.quantity ?? 0) === 0 && <span className="inventory-stock-badge">Out of stock</span>}</th>
                        <td><InventoryQuantity item={item} saving={saving} onSave={(quantity) => saveQuantity(item, quantity)} /></td>
                        <td>{Number.isNaN(timestamp.getTime()) ? "—" : <time dateTime={timestamp.toISOString()}>{dateFormat.format(timestamp)}</time>}</td>
                        <td>
                          <div className="inventory-row-actions">
                            <button type="button" className="inventory-icon-button" disabled={saving} aria-label={`Notes for ${item.name}`} title={item.notes || "Add notes"} onClick={() => openEditor(item, "note")}>
                              <FiFileText aria-hidden="true" />{item.notes && <span className="inventory-note-dot" />}
                            </button>
                            <button type="button" className="inventory-icon-button" disabled={saving} aria-label={`Edit ${item.name}`} title="Edit item" onClick={() => openEditor(item, "edit")}><FiEdit2 aria-hidden="true" /></button>
                            <button type="button" className="inventory-icon-button danger" disabled={saving} aria-label={`Delete ${item.name}`} title="Delete item" onClick={() => removeItem(item)}><FiTrash2 aria-hidden="true" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="inventory-state" role="status">{filtersActive ? "No items match your filters." : `No ${selectedCategory.toLowerCase()} items yet.`}</p>
        ))}
      </section>
      {editor && (
        <InventoryEditor
          editor={editor}
          onChange={setEditor}
          onClose={() => setEditor(null)}
          onSave={saveEditor}
          saving={savingItems.includes(editor.id || "add")}
          error={editorError}
        />
      )}
    </WorkspacePage>
  );
}
