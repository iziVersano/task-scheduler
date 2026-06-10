require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const cors = require('cors');
const { initScheduler } = require('./scheduler');
const routes = require('./routes');
const labRoutes = require('./lab-routes');
const iamRoutes = require('./iam-routes');
const browserRoutes = require('./browser-routes');
const awsStatus = require('./aws-status');
const captionsRoutes = require('./captions-routes');
const diagramsRoutes = require('./diagrams-routes');
const recapSummaryRoutes = require('./recap-summary-routes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: /^http:\/\/localhost(:\d+)?$/ }));
app.use(express.json());

app.use('/api', iamRoutes);
app.use('/api', routes);
app.use('/api', labRoutes);
app.use('/api', browserRoutes);
app.use('/api', awsStatus);
app.use('/api', captionsRoutes);
app.use('/api', diagramsRoutes);
app.use('/api', recapSummaryRoutes);

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
