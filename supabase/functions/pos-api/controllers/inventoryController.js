// controllers/inventoryController.js
import { Inventory } from "../repositories.js";

// Get all inventory items
export const getInventoryItems = async (req, res) => {
  try {
    const { category } = req.query;
    const items = await Inventory.list(typeof category === "string" ? category : null);
    res.json(items);
  } catch (error) {
    console.error("Error fetching inventory:", error);
    res.status(500).json({ error: "Failed to fetch inventory items" });
  }
};

// Get single inventory item
export const getInventoryItem = async (req, res) => {
  try {
    const item = await Inventory.get(req.params.id);
    if (!item) {
      return res.status(404).json({ error: "Inventory item not found" });
    }
    res.json(item);
  } catch (error) {
    console.error("Error fetching inventory item:", error);
    res.status(500).json({ error: "Failed to fetch inventory item" });
  }
};

// Create inventory item
export const createInventoryItem = async (req, res) => {
  try {
    const { name, unit, category, quantity, notes } = req.body;

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Item name is required" });
    }

    if (category && !["Barista", "Kitchen"].includes(category)) {
      return res.status(400).json({ error: "Invalid inventory category" });
    }
    const amount = Number(quantity ?? 0);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ error: "Invalid quantity value" });
    }
    const savedItem = await Inventory.create({
      name: name.trim(),
      unit: unit || "pcs",
      category: category || "Barista",
      quantity: amount,
      notes: notes || "",
    });

    res.status(201).json(savedItem);
  } catch (error) {
    console.error("Error creating inventory item:", error);
    res.status(500).json({ error: "Failed to create inventory item" });
  }
};

// Update inventory item
export const updateInventoryItem = async (req, res) => {
  try {
    const { name, unit, category, notes } = req.body;
    const updates = {};
    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      return res.status(400).json({ error: "Item name is required" });
    }
    if (category !== undefined && !["Barista", "Kitchen"].includes(category)) {
      return res.status(400).json({ error: "Invalid inventory category" });
    }

    if (name !== undefined) updates.name = name.trim();
    if (unit !== undefined) updates.unit = unit;
    if (category !== undefined) updates.category = category;
    if (notes !== undefined) updates.notes = notes;

    const item = await Inventory.update(req.params.id, updates);

    if (!item) {
      return res.status(404).json({ error: "Inventory item not found" });
    }

    res.json(item);
  } catch (error) {
    console.error("Error updating inventory item:", error);
    res.status(500).json({ error: "Failed to update inventory item" });
  }
};

// Update inventory quantity
export const updateInventoryQuantity = async (req, res) => {
  try {
    const { quantity, note } = req.body;
    const qty = Number(quantity);

    if (!Number.isFinite(qty) || qty < 0) {
      return res.status(400).json({ error: "Invalid quantity value" });
    }

    const newNote = typeof note === "string" && note.trim()
      ? `[${new Date().toLocaleString("id-ID", { timeZone: "UTC" })}] ${note.trim()}`
      : null;
    const item = await Inventory.setQuantity(req.params.id, qty, newNote);

    if (!item) {
      return res.status(404).json({ error: "Inventory item not found" });
    }

    res.json(item);
  } catch (error) {
    console.error("Error updating inventory quantity:", error);
    res.status(500).json({ error: "Failed to update inventory quantity" });
  }
};

// Delete inventory item
export const deleteInventoryItem = async (req, res) => {
  try {
    const item = await Inventory.remove(req.params.id);
    if (!item) {
      return res.status(404).json({ error: "Inventory item not found" });
    }
    res.json({ message: "Inventory item deleted successfully", item });
  } catch (error) {
    console.error("Error deleting inventory item:", error);
    res.status(500).json({ error: "Failed to delete inventory item" });
  }
};
