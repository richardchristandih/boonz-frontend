// src/pages/ProductPage.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import ProductList from '../components/ProductList';
import ProductForm from '../components/ProductForm';
import './ProductPage.css';

function ProductPage() {
  const navigate = useNavigate();

  return (
    <>
      <div className="page-container">
        <button className="back-btn" onClick={() => navigate("/")}>
          <i className="fas fa-arrow-left" /> Back
        </button>
        <h1 className="page-title">Add Products</h1>
        <div className="product-page-grid">
          <div className="card">
            <h2 className="page-title">Product List</h2>
            <ProductList />
          </div>

          <div className="card">
            <h2 className="page-title">Add Product</h2>
            <ProductForm onSuccess={() => {/* optionally refetch list */}} />
          </div>
        </div>
      </div>
    </>
  );
}

export default ProductPage;
