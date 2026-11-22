import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiPlus } from "react-icons/fi";
import ProductList from "../components/ProductList";
import ProductForm from "../components/ProductForm";
import WorkspacePage from "../components/WorkspacePage";
import { useToast } from "../components/ToastProvider";
import "./ProductPage.css";

export default function ProductPage() {
  const [params, setParams] = useSearchParams();
  const [refreshKey, setRefreshKey] = useState(0);
  const { show } = useToast();
  const adding = params.get("view") === "add";

  return (
    <WorkspacePage title={adding ? "Add product" : "Products"}
      description={adding ? "Enter product details, price, category, and an optional image." : "Search, sort, and edit items in the Boonz menu."}
      className="workspace-products"
      actions={adding ? <Link className="workspace-button" to="/product-page">View products</Link> : <>
        <Link className="workspace-button" to="/admin/categories">Categories</Link>
        <Link className="workspace-button primary" to="/product-page?view=add"><FiPlus aria-hidden="true" /> Add product</Link>
      </>}>
      <section className="workspace-section" aria-label="Product catalog" hidden={adding}>
        <ProductList key={refreshKey} />
      </section>
      {adding && <section className="workspace-section" aria-label="New product">
        <ProductForm onSuccess={() => {
          setRefreshKey((key) => key + 1);
          setParams({}, { replace: true });
          show("Product added.", { type: "success" });
        }} />
      </section>}
    </WorkspacePage>
  );
}
