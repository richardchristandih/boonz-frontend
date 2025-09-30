import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import ProductList from "../components/ProductList";
import ProductForm from "../components/ProductForm";
import "./ProductPage.css";

export default function ProductPage() {
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="product-page">
      <header className="product-page__header">
        <button
          className="back-btn"
          onClick={() => navigate("/")}
          type="button"
          aria-label="Back to home"
        >
          <span className="back-btn__icon" aria-hidden="true">
            ←
          </span>
          <span>Back</span>
        </button>

        <div className="product-page__titles">
          <h1 className="product-page__title">Products</h1>
          <p className="product-page__subtitle">
            Manage your catalog: review items on the left, add new ones on the
            right.
          </p>
        </div>
      </header>

      <main className="product-page__grid">
        {/* Left: List */}
        <section className="card card--stretch">
          <div className="card__head">
            <h2 className="card__title">Product List</h2>
          </div>
          <div className="card__body">
            <ProductList showTitle={false} scroll />
          </div>
        </section>

        {/* Right: Form (sticky on desktop) */}
        <aside className="card card--sticky">
          <div className="card__head">
            <h2 className="card__title">Add Product</h2>
          </div>
          <div className="card__body">
            <ProductForm
              showTitle={false}
              onSuccess={() => setRefreshKey((k) => k + 1)}
            />
          </div>
        </aside>
      </main>
    </div>
  );
}
