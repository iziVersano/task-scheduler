const express = require('express');
const cors = require('cors');
const { initScheduler } = require('./scheduler');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

app.use('/api', routes);

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()) + 's' })
);

initScheduler();

app.listen(PORT, () => {
  console.log(`\n  Task Scheduler API  →  http://localhost:${PORT}\n`);
});

process.on('SIGTERM', () => {
  console.log('Server shutting down...');
  process.exit(0);
});
