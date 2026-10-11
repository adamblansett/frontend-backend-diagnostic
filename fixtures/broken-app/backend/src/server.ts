import express from 'express';
import cors from 'cors';

const app = express();

// Defect 1: Insecure/invalid CORS wildcard with credentials
app.use(cors({
  origin: '*',
  credentials: true
}));

app.use(express.json());

// Defect 2: Trailing slash in route
app.get('/api/v1/users/', (req, res) => {
  try {
    // Defect 3: Response schema drift (returns full_name instead of name, omits email)
    res.json({ id: 101, full_name: 'Alice Smith' });
  } catch (err) {
    // Defect 4: Returns 200 on error
    res.status(200).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/v1/users/', (req, res) => {
  res.json({ success: true });
});

// Defect 5: Listens on port 3001, but frontend env has port 4000
// Defect 6: Missing /health endpoint
app.listen(3001, () => {
  console.log('Server running on port 3001');
});
