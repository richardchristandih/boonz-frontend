// src/components/Receipt.js
import React from 'react';
import './Receipt.css'; // Your custom receipt styling

export default function Receipt({ order }) {
  return (
    <div className="receipt-container">
      <h2>Boonz Receipt</h2>
      <p>Order #: {order.id}</p>
      <hr />
      <ul>
        {order.items.map(item => (
          <li key={item.id}>
            {item.name} x {item.quantity} = ${ (item.price * item.quantity).toFixed(2) }
          </li>
        ))}
      </ul>
      <hr />
      <p>Subtotal: ${order.subtotal.toFixed(2)}</p>
      <p>Discount: -${order.discount.toFixed(2)}</p>
      <h3>Total: ${order.total.toFixed(2)}</h3>
    </div>
  );
}
