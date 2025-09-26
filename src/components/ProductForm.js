import React, { useState } from 'react';
import api from '../services/api';
import './ProductForm.css';

const CATEGORY_OPTIONS = ['Coffee', 'Drink', 'Burger', 'Beer', 'Patisserie', 'Matcha'];

/**
 * ProductForm
 * @param {Function} onSuccess  - callback after successful create
 * @param {boolean}  showTitle  - render internal <h2>; default false
 */
export default function ProductForm({ onSuccess, showTitle = false }) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Coffee');
  const [image, setImage] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    // Guard numeric parsing (avoid NaN)
    const priceNum = Number.parseFloat(price || '0');
    const qtyNum = Number.parseInt(quantity || '0', 10);

    const productData = {
      name: name.trim(),
      sku: sku.trim(),
      price: Number.isFinite(priceNum) ? priceNum : 0,
      quantity: Number.isFinite(qtyNum) ? qtyNum : 0,
      description: description.trim(),
      category,
      ...(image.trim() ? { image: image.trim() } : {}),
    };

    try {
      setSaving(true);
      await api.post('/products', productData);
      onSuccess?.();

      // Reset form
      setName('');
      setSku('');
      setPrice('');
      setQuantity('');
      setDescription('');
      setCategory('Coffee');
      setImage('');
    } catch (error) {
      console.error('Error creating product:', error);
      alert('Failed to create product. Please check the inputs and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`product-form-container${showTitle ? '' : ' no-title'}`}>
      {showTitle && <h2>Product Form</h2>}

      <form onSubmit={handleSubmit} className="product-form" autoComplete="off">
        <label htmlFor="pf-name">Name:</label>
        <input
          id="pf-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Americano"
        />

        <label htmlFor="pf-sku">SKU:</label>
        <input
          id="pf-sku"
          type="text"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          required
          placeholder="AMR-001"
          autoCapitalize="characters"
        />

        <label htmlFor="pf-price">Price:</label>
        <input
          id="pf-price"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
          placeholder="20000"
        />

        <label htmlFor="pf-qty">Quantity:</label>
        <input
          id="pf-qty"
          type="number"
          inputMode="numeric"
          step="1"
          min="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
          placeholder="100"
        />

        <label htmlFor="pf-desc">Description:</label>
        <textarea
          id="pf-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="(Optional) Short description…"
        />

        <label htmlFor="pf-img">Image URL:</label>
        <input
          id="pf-img"
          type="url"
          value={image}
          onChange={(e) => setImage(e.target.value)}
          placeholder="https://example.com/image.jpg (optional)"
        />

        <label htmlFor="pf-cat">Category:</label>
        <select
          id="pf-cat"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>

        <button type="submit" className="create-button" disabled={saving}>
          {saving ? 'Creating…' : 'Create'}
        </button>
      </form>
    </div>
  );
}
