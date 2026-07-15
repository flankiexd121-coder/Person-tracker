const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA = path.join(__dirname, 'data.json');
let db = { links: {}, locations: [] };
if (fs.existsSync(DATA)) {
  try { db = JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch (_) {}
}

function save() {
  fs.writeFileSync(DATA, JSON.stringify(db, null, 2));
}

function uid() {
  return Math.random().toString(36).substring(2, 10);
}

// Dashboard — create a new tracking link
app.post('/api/create-link', (req, res) => {
  const { label } = req.body;
  const id = uid();
  db.links[id] = { label: label || 'Untitled', created: new Date().toISOString() };
  save();
  res.json({ id, url: `${req.protocol}://${req.get('host')}/track/${id}` });
});

// Dashboard — list all links with latest location
app.get('/api/links', (req, res) => {
  const latestPerLink = {};
  for (const loc of db.locations) {
    if (!latestPerLink[loc.linkId] || loc.timestamp > latestPerLink[loc.linkId].timestamp) {
      latestPerLink[loc.linkId] = loc;
    }
  }
  const result = Object.entries(db.links).map(([id, link]) => ({
    id,
    label: link.label,
    created: link.created,
    latest: latestPerLink[id] || null
  }));
  res.json(result);
});

// Delete a link
app.delete('/api/links/:id', (req, res) => {
  delete db.links[req.params.id];
  db.locations = db.locations.filter(l => l.linkId !== req.params.id);
  save();
  res.json({ ok: true });
});

// Person opens tracking link — serves the sender page
app.get('/track/:id', (req, res) => {
  if (!db.links[req.params.id]) {
    return res.status(404).send('Link not found');
  }
  res.sendFile(path.join(__dirname, 'public', 'track.html'));
});

// Person sends location
app.post('/api/location/:linkId', (req, res) => {
  if (!db.links[req.params.linkId]) {
    return res.status(404).json({ error: 'Link not found' });
  }
  const { lat, lng, accuracy, speed, name } = req.body;
  if (lat == null || lng == null) {
    return res.status(400).json({ error: 'lat and lng required' });
  }
  const entry = {
    linkId: req.params.linkId,
    name: name || 'Anonymous',
    lat,
    lng,
    accuracy: accuracy || null,
    speed: speed || null,
    timestamp: new Date().toISOString()
  };
  db.locations.push(entry);
  if (db.locations.length > 10000) db.locations = db.locations.slice(-5000);
  save();
  res.json({ ok: true });
});

// Get locations for a specific link (for dashboard)
app.get('/api/locations/:linkId', (req, res) => {
  const maxAge = parseInt(req.query.maxAge) || 300;
  const cutoff = new Date(Date.now() - maxAge * 1000).toISOString();
  const result = db.locations.filter(l => l.linkId === req.params.linkId && l.timestamp >= cutoff);
  res.json(result);
});

// Serve the dashboard page
app.get('/dashboard*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Link Tracker running on port ${PORT}`);
});
