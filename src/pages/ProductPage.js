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
        <button className="back-btn" onClick={() => navigate("/")}>
          <i className="fas fa-arrow-left" /> Back
        </button>

        <div className="product-page__titles">
          <h1 className="product-page__title">Products</h1>
        </div>
      </header>

      <main className="product-page__grid">
        <section className="card card--stretch">
          <div className="card__head">
            <h2 className="card__title">Product List</h2>
          </div>
          <div className="card__body">
            <ProductList key={refreshKey} showTitle={false} scroll />
          </div>
        </section>

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
