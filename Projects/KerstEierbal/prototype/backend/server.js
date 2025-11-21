const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const DATA_FILE = path.join(__dirname, 'orders.json');
const PORT = process.env.PORT || 3000;

app.use(express.json());

// serve the frontend (project root) so you can open /checkout.html and /adminpanel.html
app.use(express.static(path.join(__dirname, '..')));

function readOrders() {
  try {
    const txt = fs.readFileSync(DATA_FILE, 'utf8') || '[]';
    return JSON.parse(txt);
  } catch (e) {
    return [];
  }
}

function writeOrders(list) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf8');
}

app.get('/api/orders', (req, res) => {
  res.json(readOrders());
});

app.post('/api/orders', (req, res) => {
  const order = req.body || {};
  if (!order.id) order.id = 'ord_' + Date.now();
  if (!order.created_at) order.created_at = new Date().toISOString();
  const orders = readOrders();
  orders.unshift(order);
  writeOrders(orders);
  res.status(201).json(order);
});

app.patch('/api/orders/:id', (req, res) => {
  const id = req.params.id;
  const updates = req.body || {};
  const orders = readOrders();
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  orders[idx] = Object.assign({}, orders[idx], updates, { updated_at: new Date().toISOString() });
  writeOrders(orders);
  res.json(orders[idx]);
});

app.delete('/api/orders/:id', (req, res) => {
  const id = req.params.id;
  const orders = readOrders();
  const filtered = orders.filter(o => o.id !== id);
  if (filtered.length === orders.length) return res.status(404).json({ error: 'not found' });
  writeOrders(filtered);
  res.json({ deleted: id });
});

app.post('/api/orders/clear', (req, res) => {
  writeOrders([]);
  res.json({ cleared: true });
});

app.listen(PORT, () => console.log(`Backend running — open http://localhost:${PORT}/checkout.html`));
