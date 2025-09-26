import React, { useEffect, useState } from 'react';
import api from '../services/api';
import ProductEditorModal from './ProductEditorModal';
import './ProductList.css';

function fmtRp(v) {
  const n = Number(v);
  const safe = Number.isFinite(n) ? n : 0;
  return `Rp.${safe.toLocaleString('id-ID', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * ProductList
 * @param {boolean} showTitle - if true, renders its own <h2>; default false
 * @param {boolean} scroll    - if true, caps height & makes it scrollable
 */
export default function ProductList({ showTitle = false, scroll = false }) {
  const [products, setProducts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [removingId, setRemoving] = useState(null);

  // edit modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorProduct, setEditorProduct] = useState(null);

  // is admin?
  const user = (() => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();
  const isAdmin =
    (user?.role && String(user.role).toLowerCase() === 'admin') || user?.isAdmin === true;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.get('/products');
        if (!mounted) return;
        setProducts(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Error fetching products:', err);
        if (mounted) setError('Failed to load products.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  function openEditor(product) {
    if (!isAdmin) return;
    if (!product) return;
    setEditorProduct(product);
    setEditorOpen(true);
  }
  function closeEditor() {
    setEditorOpen(false);
    setEditorProduct(null);
  }
  function applySaved(updated) {
    // merge the updated product into the list
    const id = updated?._id || updated?.id || updated?.sku;
    if (!id) return closeEditor();
    setProducts((prev) =>
      prev.map((p) => ((p?._id || p?.id || p?.sku) === id ? { ...p, ...updated } : p))
    );
    closeEditor();
  }

  async function handleRemove(productId) {
    if (!isAdmin) return;
    if (!productId) return;
    const ok = window.confirm('Remove this product? This cannot be undone.');
    if (!ok) return;

    try {
      setRemoving(productId);
      await api.delete(`/products/${productId}`); // token auto-added by api.js interceptor
      setProducts((prev) => prev.filter((p) => (p?._id || p?.id || p?.sku) !== productId));
    } catch (err) {
      console.error('Delete failed:', err);
      window.alert('Failed to remove product.');
    } finally {
      setRemoving(null);
    }
  }

  const containerClass =
    `product-list-container${showTitle ? '' : ' no-title'}${scroll ? ' list-scroll' : ''}`;

  return (
    <div className={containerClass} role="region" aria-label="Product list">
      {showTitle && <h2 className="product-list-title">Product List</h2>}

      {loading && <p className="product-list-status">Loading…</p>}
      {!loading && error && <p className="product-list-status error">{error}</p>}

      {!loading && !error && products.length === 0 && (
        <p className="product-list-empty">No products found.</p>
      )}

      {!loading && !error && products.length > 0 && (
        <ul className="product-list">
          {products.map((p, idx) => {
            const realId = p?._id || p?.id || p?.sku;
            const key    = realId || `row-${idx}`;
            const name   = p?.name ?? '(Untitled)';
            const price  = fmtRp(p?.price);

            return (
              <li key={key} className="product-list-item">
                <div className="product-info">
                  <div className="product-main">
                    <span className="product-name">{name}</span>
                    <span className="product-price">{price}</span>
                  </div>

                  {isAdmin && (
                    <div className="product-actions">
                      <button
                        className="product-edit-btn"
                        onClick={() => openEditor(p)}
                        disabled={!realId}
                        title={!realId ? 'Cannot edit (no id)' : 'Edit product'}
                      >
                        Edit
                      </button>

                      <button
                        className="product-remove-btn"
                        onClick={() => handleRemove(realId)}
                        disabled={!realId || removingId === realId}
                        title={!realId ? 'Cannot remove (no id)' : 'Remove product'}
                      >
                        {removingId === realId ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Editor Modal */}
      <ProductEditorModal
        open={editorOpen}
        product={editorProduct}
        onClose={closeEditor}
        onSaved={applySaved}
      />
    </div>
  );
}
