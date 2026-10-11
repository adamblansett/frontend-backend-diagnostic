import express from 'express';
import cors from 'cors';

const app = express();

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());

// Operational healthcheck
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Canonical REST route without trailing slash
app.get('/api/v1/users', (_req, res) => {
  try {
    res.json({ id: 'u_101', name: 'Alice Smith', email: 'alice@example.com' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/v1/users', (req, res) => {
  res.status(201).json({ id: 'u_102', ...req.body });
});

app.listen(3000, () => {
  console.log('Healthy backend running on port 3000');
});
