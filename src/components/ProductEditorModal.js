import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import './ProductEditorModal.css';

export default function ProductEditorModal({
  open,
  product,                // the product object to edit
  onClose,                // called when user closes the modal
  onSaved,                // called with updated product after successful save
}) {
  const [form, setForm] = useState({
    name: '',
    price: '',
    category: '',
    description: '',
    image: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Prefill form when product changes
  useEffect(() => {
    if (!product) return;
    setForm({
      name: product.name ?? '',
      price: product.price ?? '',
      category: product.category ?? '',
      description: product.description ?? '',
      image: product.image ?? '',
    });
    setErr('');
  }, [product]);

  const isCreate = useMemo(() => !product?._id && !product?.id && !product?.sku, [product]);

  function setField(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSave() {
    try {
      setErr('');
      // Validate
      const name = String(form.name || '').trim();
      const priceNum = Number(form.price);
      if (!name) return setErr('Product name is required.');
      if (!Number.isFinite(priceNum) || priceNum < 0) return setErr('Price must be a valid non-negative number.');

      setSaving(true);

      const payload = {
        name,
        price: priceNum,
        category: String(form.category || '').trim(),
        description: String(form.description || '').trim(),
        image: String(form.image || '').trim(),
      };

      let updated;
      if (isCreate) {
        const res = await api.post('/products', payload);
        updated = res.data;
      } else {
        const id = product._id || product.id || product.sku;
        const res = await api.put(`/products/${id}`, payload);
        updated = res.data;
      }

      if (typeof onSaved === 'function') onSaved(updated);
      if (typeof onClose === 'function') onClose();
    } catch (e) {
      console.error('Save failed:', e);
      setErr(e?.response?.data?.message || e?.message || 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="pemodal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="pemodal__dialog" onClick={(e) => e.stopPropagation()}>
        <header className="pemodal__head">
          <strong>{isCreate ? 'Add Product' : `Edit: ${product?.name ?? ''}`}</strong>
          <button className="pemodal__close" aria-label="Close" onClick={onClose}>✕</button>
        </header>

        <div className="pemodal__body">
          {err && <div className="pemodal__error">{err}</div>}

          <label>Product Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="e.g. Iced Latte"
          />

          <div className="pemodal__grid2">
            <div>
              <label>Price (Rp.)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => setField('price', e.target.value)}
                placeholder="e.g. 25000"
              />
            </div>
            <div>
              <label>Category</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setField('category', e.target.value)}
                placeholder="e.g. Coffee"
                list="pemodal-categories"
              />
              {/* optionally prefill suggestions */}
              <datalist id="pemodal-categories">
                <option value="Coffee" />
                <option value="Drink" />
                <option value="Burger" />
                <option value="Beer" />
                <option value="Patisserie" />
                <option value="Matcha" />
              </datalist>
            </div>
          </div>

          <label>Description</label>
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            placeholder="Optional description…"
          />

          <label>Image (relative path or URL)</label>
          <input
            type="text"
            value={form.image}
            onChange={(e) => setField('image', e.target.value)}
            placeholder="e.g. coffee/latte.jpg"
          />
          <div className="pemodal__hint">
            If you use a relative path (e.g. <code>coffee/latte.jpg</code>), it should exist under
            <code> /src/images </code>.
          </div>
        </div>

        <footer className="pemodal__actions">
          <button className="btn outline" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  );
}
