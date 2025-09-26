// src/pages/Orders.js
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import './Orders.css';
import { useNavigate } from 'react-router-dom';

function Orders() {
  const navigate = useNavigate();  
  const [orders, setOrders] = useState([]);
  const [timeRangeLabel, setTimeRangeLabel] = useState('');

  const timeRangeMapping = {
    day1: 1,
    day2: 2,
    day3: 3,
    day4: 4,
    day5: 5,
    day6: 6,
    week: 7,
    month: 30,
    year: 365,
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await api.get('/orders');
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  };

  const handleTimeRangeChange = (e) => setTimeRangeLabel(e.target.value);

  const now = new Date();
  const filteredOrders = orders.filter((order) => {
    if (!timeRangeLabel) return true;
    const orderDate = new Date(order.createdAt);
    const diffInDays = (now - orderDate) / (1000 * 60 * 60 * 24);
    return diffInDays <= timeRangeMapping[timeRangeLabel];
  });

  const totalTransactions = filteredOrders.length;
  const totalRevenue = filteredOrders.reduce(
    (acc, order) => acc + (order.totalAmount || 0),
    0
  );

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm("Are you sure you want to cancel this order?")) return;
    try {
      await api.patch(`/orders/${orderId}`, { status: 'cancelled' });
      alert('Order cancelled successfully!');
      fetchOrders();
    } catch (error) {
      alert('There was an error cancelling your order.');
    }
  };

  const handleMarkDoneOrder = async (orderId) => {
    if (!window.confirm("Mark this order as done?")) return;
    try {
      await api.patch(`/orders/${orderId}`, { status: 'done' });
      alert('Order marked as done!');
      fetchOrders();
    } catch (error) {
      alert('There was an error marking your order as done.');
    }
  };

  const handleRefundOrder = async (orderId) => {
    if (!window.confirm("Are you sure you want to refund this order?")) return;
    try {
      await api.patch(`/orders/${orderId}`, { status: 'refunded' });
      alert('Refund processed successfully!');
      fetchOrders();
    } catch (error) {
      alert('There was an error processing the refund.');
    }
  };

  return (
    <div className="page-container">
      {/* Back button same as Settings/Dashboard */}
      <button className="back-btn" onClick={() => navigate("/")}>
        <i className="fas fa-arrow-left" /> Back
      </button>

      <h2 className="orders-heading">Orders</h2>

      {/* Filter */}
      <div className="orders-filter">
        <label htmlFor="time-range">Filter by Time Range:</label>
        <select
          id="time-range"
          value={timeRangeLabel}
          onChange={handleTimeRangeChange}
        >
          <option value="">All time</option>
          <option value="day1">Last 1 day</option>
          <option value="day2">Last 2 days</option>
          <option value="day3">Last 3 days</option>
          <option value="day4">Last 4 days</option>
          <option value="day5">Last 5 days</option>
          <option value="day6">Last 6 days</option>
          <option value="week">Last 7 days (1 week)</option>
          <option value="month">Last 30 days (1 month)</option>
          <option value="year">Last 365 days (1 year)</option>
        </select>
      </div>

      {/* Summary */}
      <div className="orders-summary">
        <div className="summary-item">
          <strong>Total Transactions:</strong> {totalTransactions}
        </div>
        <div className="summary-item">
          <strong>Total Revenue:</strong> Rp.{totalRevenue.toFixed(2)}
        </div>
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <p className="no-orders">No orders found for this time range.</p>
      ) : (
        filteredOrders.map((order) => {
          const hasDiscount = order.discount && order.discount > 0;

          return (
            <div key={order._id} className="order-card">
              <p className="order-number">Order #: {order.orderNumber}</p>
              <p className="order-id">ID: {order._id}</p>

              <div className="order-info">
                <span>Status: {order.status}</span>
                {order.status === 'cancelled' && (
                  <span className="order-status-label cancelled">Cancelled</span>
                )}
                {order.status === 'done' && (
                  <span className="order-status-label done">Done</span>
                )}
                {order.status === 'refunded' && (
                  <span className="order-status-label refunded">Refunded</span>
                )}

                <span>Total: Rp.{(order.totalAmount || 0).toFixed(2)}</span>
                <span>Created: {new Date(order.createdAt).toLocaleString()}</span>
                {order.orderType && <span>Order Type: {order.orderType}</span>}
                {order.paymentMethod && <span>Payment: {order.paymentMethod}</span>}

                {hasDiscount && (
                  <span>
                    {order.discountType === 'percentage' ? (
                      <>
                        Discount ({parseFloat(order.discountValue).toFixed(0)}%): -Rp.{order.discount.toFixed(2)}
                      </>
                    ) : (
                      <>Discount: -Rp.{order.discount.toFixed(2)}</>
                    )}
                    {order.discountNote && <em> ({order.discountNote})</em>}
                  </span>
                )}
              </div>

              <h3 className="products-heading">Products:</h3>
              {order.products && order.products.length > 0 ? (
                <div className="products-list">
                  {order.products.map((product, index) => (
                    <div key={index} className="product-item">
                      <p className="product-name">Name: {product.name}</p>
                      <p className="product-details">Quantity: {product.quantity}</p>
                      <p className="product-details">Price: Rp.{product.price.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p>No products found in this order.</p>
              )}

              <div className="order-actions">
                {order.status === 'pending' && (
                  <>
                    <button
                      className="cancel-order-btn"
                      onClick={() => handleCancelOrder(order._id)}
                    >
                      Cancel Order
                    </button>
                    <button
                      className="mark-done-btn"
                      onClick={() => handleMarkDoneOrder(order._id)}
                    >
                      Mark as Done
                    </button>
                  </>
                )}
                {order.status === 'done' && (
                  <button
                    className="refund-order-btn"
                    onClick={() => handleRefundOrder(order._id)}
                  >
                    Refund Order
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default Orders;
