// src/pages/Inventory.js
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
  // Bahan Kitchen (28-47)
  { name: "Lychee kaleng", unit: "kaleng", category: "Kitchen" },
  { name: "Peach kaleng", unit: "kaleng", category: "Kitchen" },
  { name: "Sirup chocolate 623 gr", unit: "botol", category: "Kitchen" },
  { name: "Butterfly Pea Syrup Delifru", unit: "liter", category: "Kitchen" },
  { name: "Peach Garden Da Vinci", unit: "botol", category: "Kitchen" },
  { name: "Vanilla Torani", unit: "ml", category: "Kitchen" },
  { name: "Lemonade Syrup Delifru", unit: "liter", category: "Kitchen" },
  { name: "Lychee Syrup Delifru", unit: "liter", category: "Kitchen" },
  { name: "Blue Curacao", unit: "ml", category: "Kitchen" },
  { name: "Brown Sugar Drip", unit: "ml", category: "Kitchen" },
  { name: "Pistachio", unit: "pack", category: "Kitchen" },
  { name: "Avocado", unit: "pcs", category: "Kitchen" },
  { name: "Biji Kopi", unit: "pack", category: "Kitchen" },
  { name: "Matcha Latte", unit: "pack", category: "Kitchen" },
  { name: "Matcha Hojicha", unit: "pack", category: "Kitchen" },
  { name: "V-soy", unit: "pack", category: "Kitchen" },
  { name: "Gula matcha", unit: "botol", category: "Kitchen" },
  { name: "Lemon Puree", unit: "botol", category: "Kitchen" },
  { name: "Bubuk coklat", unit: "pack", category: "Kitchen" },
  { name: "Sakura Delifru", unit: "botol", category: "Kitchen" },
];

export default function Inventory() {
  const navigate = useNavigate();
  const { show } = useToast();
  const confirm = useConfirm();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("Barista");
  const [editingItem, setEditingItem] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(null); // item id
  const [noteText, setNoteText] = useState("");
  const [quantityChange, setQuantityChange] = useState({ id: null, value: "" });

  // Form state for add/edit
  const [formData, setFormData] = useState({
    name: "",
    unit: "",
    category: "Barista",
    quantity: 0,
    notes: "",
  });

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    try {
      setLoading(true);
      const data = await listInventoryItems();
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching inventory:", error);
      show("Failed to load inventory items.", { type: "error" });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  // Initialize default items if inventory is empty
  useEffect(() => {
    if (!loading && items.length === 0) {
      initializeDefaultItems();
    }
  }, [loading, items.length]);

  async function initializeDefaultItems() {
    try {
      const ok = await confirm({
        title: "Initialize Inventory?",
        message:
          "No inventory items found. Would you like to initialize with default items?",
        confirmText: "Yes, Initialize",
        cancelText: "No",
      });
      if (!ok) return;

      setLoading(true);
      const created = [];
      for (const item of DEFAULT_ITEMS) {
        try {
          const result = await createInventoryItem({
            ...item,
            quantity: 0,
            notes: "",
          });
          created.push(result);
        } catch (err) {
          console.warn(`Failed to create ${item.name}:`, err);
        }
      }
      setItems(created);
      show(`Initialized ${created.length} inventory items.`, {
        type: "success",
      });
    } catch (error) {
      console.error("Error initializing inventory:", error);
    } finally {
      setLoading(false);
    }
  }

  const filteredItems = items.filter(
    (item) => item.category === selectedCategory
  );

  const handleAddItem = async () => {
    if (!formData.name.trim()) {
      show("Item name is required.", { type: "warning" });
      return;
    }
    try {
      const newItem = await createInventoryItem({
        name: formData.name.trim(),
        unit: formData.unit.trim() || "pcs",
        category: formData.category,
        quantity: Number(formData.quantity) || 0,
        notes: formData.notes.trim() || "",
      });
      setItems((prev) => [...prev, newItem]);
      setShowAddModal(false);
      setFormData({ name: "", unit: "", category: "Barista", quantity: 0, notes: "" });
      show("Item added successfully.", { type: "success" });
    } catch (error) {
      console.error("Error adding item:", error);
      show("Failed to add item.", { type: "error" });
    }
  };

  const handleEditItem = async () => {
    if (!editingItem || !formData.name.trim()) {
      show("Item name is required.", { type: "warning" });
      return;
    }
    try {
      const updated = await updateInventoryItem(editingItem._id || editingItem.id, {
        name: formData.name.trim(),
        unit: formData.unit.trim() || "pcs",
        category: formData.category,
        notes: formData.notes.trim() || "",
      });
      setItems((prev) =>
        prev.map((item) =>
          (item._id || item.id) === (editingItem._id || editingItem.id)
            ? { ...item, ...updated }
            : item
        )
      );
      setEditingItem(null);
      setFormData({ name: "", unit: "", category: "Barista", quantity: 0, notes: "" });
      show("Item updated successfully.", { type: "success" });
    } catch (error) {
      console.error("Error updating item:", error);
      show("Failed to update item.", { type: "error" });
    }
  };

  const handleDeleteItem = async (item) => {
    const ok = await confirm({
      title: "Delete Item?",
      message: `Are you sure you want to delete "${item.name}"?`,
      confirmText: "Delete",
      cancelText: "Cancel",
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteInventoryItem(item._id || item.id);
      setItems((prev) =>
        prev.filter(
          (i) => (i._id || i.id) !== (item._id || item.id)
        )
      );
      show("Item deleted successfully.", { type: "success" });
    } catch (error) {
      console.error("Error deleting item:", error);
      show("Failed to delete item.", { type: "error" });
    }
  };

  const handleQuantityChange = async (item, delta) => {
    const currentQty = Number(item.quantity || 0);
    const newQty = Math.max(0, currentQty + delta);
    
    try {
      const updated = await updateInventoryQuantity(
        item._id || item.id,
        newQty
      );
      setItems((prev) =>
        prev.map((i) =>
          (i._id || i.id) === (item._id || item.id)
            ? { ...i, ...updated }
            : i
        )
      );
    } catch (error) {
      console.error("Error updating quantity:", error);
      show("Failed to update quantity.", { type: "error" });
    }
  };

  const handleSetQuantity = async (item) => {
    const newQty = Number(quantityChange.value);
    if (isNaN(newQty) || newQty < 0) {
      show("Please enter a valid quantity.", { type: "warning" });
      return;
    }

    try {
      const updated = await updateInventoryQuantity(
        item._id || item.id,
        newQty,
        quantityChange.note || ""
      );
      setItems((prev) =>
        prev.map((i) =>
          (i._id || i.id) === (item._id || item.id)
            ? { ...i, ...updated }
            : i
        )
      );
      setQuantityChange({ id: null, value: "", note: "" });
      show("Quantity updated successfully.", { type: "success" });
    } catch (error) {
      console.error("Error setting quantity:", error);
      show("Failed to update quantity.", { type: "error" });
    }
  };

  const handleUpdateNote = async (itemId, note) => {
    try {
      const item = items.find((i) => (i._id || i.id) === itemId);
      if (!item) return;
      
      const updated = await updateInventoryItem(item._id || item.id, {
        notes: note.trim(),
      });
      setItems((prev) =>
        prev.map((i) =>
          (i._id || i.id) === (item._id || item.id)
            ? { ...i, ...updated }
            : i
        )
      );
      setShowNoteModal(null);
      setNoteText("");
      show("Note updated successfully.", { type: "success" });
    } catch (error) {
      console.error("Error updating note:", error);
      show("Failed to update note.", { type: "error" });
    }
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name || "",
      unit: item.unit || "",
      category: item.category || "Barista",
      quantity: item.quantity || 0,
      notes: item.notes || "",
    });
  };

  const closeModals = () => {
    setShowAddModal(false);
    setEditingItem(null);
    setFormData({ name: "", unit: "", category: "Barista", quantity: 0, notes: "" });
    setQuantityChange({ id: null, value: "", note: "" });
    setShowNoteModal(null);
  };

  return (
    <div className="inventory-page">
      <button className="back-btn" onClick={() => navigate("/")}>
        <i className="fas fa-arrow-left" /> Back
      </button>

      <h1 className="inventory-heading">Inventory Management</h1>

      {/* Category Tabs */}
      <div className="inventory-tabs">
        <button
          className={`tab ${selectedCategory === "Barista" ? "active" : ""}`}
          onClick={() => setSelectedCategory("Barista")}
        >
          Bahan Barista
        </button>
        <button
          className={`tab ${selectedCategory === "Kitchen" ? "active" : ""}`}
          onClick={() => setSelectedCategory("Kitchen")}
        >
          Bahan Kitchen
        </button>
      </div>

      {/* Add Item Button */}
      <div className="inventory-actions">
        <button
          className="btn btn-primary"
          onClick={() => {
            setFormData({
              name: "",
              unit: "",
              category: selectedCategory,
              quantity: 0,
              notes: "",
            });
            setShowAddModal(true);
          }}
        >
          <i className="fas fa-plus" /> Add Item
        </button>
      </div>

      {/* Items List */}
      {loading ? (
        <div className="inventory-loading">Loading inventory...</div>
      ) : filteredItems.length === 0 ? (
        <div className="inventory-empty">
          <p>No items in {selectedCategory} category.</p>
        </div>
      ) : (
        <div className="inventory-table-wrapper">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Bahan</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Notes</th>
                <th>Last Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item, index) => (
                <tr key={item._id || item.id}>
                  <td>{index + 1}</td>
                  <td>
                    <strong>{item.name}</strong>
                  </td>
                  <td>
                    <div className="quantity-controls">
                      <button
                        className="qty-btn minus"
                        onClick={() => handleQuantityChange(item, -1)}
                        title="Decrease by 1"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        className="qty-input"
                        value={item.quantity || 0}
                        min="0"
                        onChange={(e) => {
                          const val = e.target.value;
                          setQuantityChange({
                            id: item._id || item.id,
                            value: val,
                            note: "",
                          });
                        }}
                        onBlur={() => {
                          if (quantityChange.id === (item._id || item.id)) {
                            handleSetQuantity(item);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.target.blur();
                          }
                        }}
                      />
                      <button
                        className="qty-btn plus"
                        onClick={() => handleQuantityChange(item, 1)}
                        title="Increase by 1"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td>{item.unit || "pcs"}</td>
                  <td>
                    <button
                      className="note-btn"
                      onClick={() => {
                        setNoteText(item.notes || "");
                        setShowNoteModal(item._id || item.id);
                      }}
                      title={item.notes || "Add note"}
                    >
                      <i className="fas fa-sticky-note" />
                      {item.notes && (
                        <span className="note-indicator" title={item.notes}>
                          !
                        </span>
                      )}
                    </button>
                  </td>
                  <td>
                    {item.updatedAt
                      ? new Date(item.updatedAt).toLocaleString("id-ID", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : item.createdAt
                      ? new Date(item.createdAt).toLocaleString("id-ID", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "-"}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn-icon edit"
                        onClick={() => openEditModal(item)}
                        title="Edit"
                      >
                        <i className="fas fa-edit" />
                      </button>
                      <button
                        className="btn-icon delete"
                        onClick={() => handleDeleteItem(item)}
                        title="Delete"
                      >
                        <i className="fas fa-trash" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {(showAddModal || editingItem) && (
        <div
          className="paymodal"
          role="dialog"
          aria-modal="true"
          onClick={closeModals}
        >
          <div
            className="paymodal__dialog"
            onClick={(e) => e.stopPropagation()}
            role="document"
          >
            <header className="paymodal__head">
              <h3>{editingItem ? "Edit Item" : "Add Item"}</h3>
              <button
                className="paymodal__close"
                aria-label="Close"
                onClick={closeModals}
              >
                ✕
              </button>
            </header>

            <div className="paymodal__body">
              <label className="register-label">Item Name *</label>
              <input
                type="text"
                className="register-input"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., Le Minerale"
                autoFocus
              />

              <label className="register-label">Unit</label>
              <input
                type="text"
                className="register-input"
                value={formData.unit}
                onChange={(e) =>
                  setFormData({ ...formData, unit: e.target.value })
                }
                placeholder="e.g., botol, kg, liter"
              />

              <label className="register-label">Category</label>
              <select
                className="register-input"
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
              >
                <option value="Barista">Bahan Barista</option>
                <option value="Kitchen">Bahan Kitchen</option>
              </select>

              {!editingItem && (
                <>
                  <label className="register-label">Initial Quantity</label>
                  <input
                    type="number"
                    className="register-input"
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        quantity: Number(e.target.value) || 0,
                      })
                    }
                    min="0"
                  />
                </>
              )}

              <label className="register-label">Notes</label>
              <textarea
                className="register-input"
                rows="3"
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="Additional notes about this item..."
              />
            </div>

            <footer className="paymodal__actions">
              <button
                className="btn btn-primary"
                onClick={editingItem ? handleEditItem : handleAddItem}
              >
                {editingItem ? "Update" : "Add"}
              </button>
              <button className="btn btn-ghost" onClick={closeModals}>
                Cancel
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Note Modal */}
      {showNoteModal && (
        <div
          className="paymodal"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowNoteModal(null)}
        >
          <div
            className="paymodal__dialog"
            onClick={(e) => e.stopPropagation()}
            role="document"
          >
            <header className="paymodal__head">
              <h3>
                Notes -{" "}
                {items.find((i) => (i._id || i.id) === showNoteModal)?.name}
              </h3>
              <button
                className="paymodal__close"
                aria-label="Close"
                onClick={() => setShowNoteModal(null)}
              >
                ✕
              </button>
            </header>

            <div className="paymodal__body">
              <textarea
                className="register-input"
                rows="5"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add notes about this item..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setShowNoteModal(null);
                    setNoteText("");
                  }
                }}
              />
            </div>

            <footer className="paymodal__actions">
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (showNoteModal) {
                    handleUpdateNote(showNoteModal, noteText);
                  }
                }}
              >
                Save Note
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setShowNoteModal(null);
                  setNoteText("");
                }}
              >
                Cancel
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

