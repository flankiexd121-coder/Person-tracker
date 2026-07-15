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
let db = { links: {}, locations: [], zones: [], events: [] };
if (fs.existsSync(DATA)) {
  try { db = JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch (_) {}
}

function save() {
  fs.writeFileSync(DATA, JSON.stringify(db, null, 2));
}

function uid() {
  return Math.random().toString(36).substring(2, 10);
}

function distance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function checkZones(linkId, lat, lng, name) {
  const link = db.links[linkId];
  if (!link) return;
  const inside = [];
  for (const z of db.zones) {
    const dist = distance(lat, lng, z.lat, z.lng);
    inside.push({ zoneId: z.id, inside: dist <= z.radius });
  }
  const prevInside = link.insideZones || [];
  for (const z of db.zones) {
    const wasInside = prevInside.includes(z.id);
    const nowInside = inside.some(i => i.zoneId === z.id && i.inside);
    if (nowInside && !wasInside) {
      const ev = {
        id: uid(), type: 'enter', zoneId: z.id, zoneName: z.name,
        linkId, personName: name, lat, lng, timestamp: new Date().toISOString()
      };
      db.events.push(ev);
      db.events = db.events.slice(-200);
      console.log(`[ZONE] ${name} ENTERED "${z.name}"`);
    }
    if (!nowInside && wasInside) {
      const ev = {
        id: uid(), type: 'exit', zoneId: z.id, zoneName: z.name,
        linkId, personName: name, lat, lng, timestamp: new Date().toISOString()
      };
      db.events.push(ev);
      db.events = db.events.slice(-200);
      console.log(`[ZONE] ${name} EXITED "${z.name}"`);
    }
  }
  link.insideZones = inside.filter(i => i.inside).map(i => i.zoneId);
}

// Zones API
app.get('/api/zones', (req, res) => {
  res.json(db.zones);
});

app.post('/api/zones', (req, res) => {
  const { name, lat, lng, radius } = req.body;
  if (lat == null || lng == null || !name) return res.status(400).json({ error: 'name, lat, lng required' });
  const zone = { id: uid(), name, lat, lng, radius: radius || 100, created: new Date().toISOString() };
  db.zones.push(zone);
  save();
  res.json(zone);
});

app.delete('/api/zones/:id', (req, res) => {
  db.zones = db.zones.filter(z => z.id !== req.params.id);
  for (const link of Object.values(db.links)) {
    if (link.insideZones) link.insideZones = link.insideZones.filter(z => z !== req.params.id);
  }
  save();
  res.json({ ok: true });
});

app.get('/api/events', (req, res) => {
  res.json(db.events.slice().reverse());
});

// Links API
app.post('/api/create-link', (req, res) => {
  const { label } = req.body;
  const id = uid();
  db.links[id] = { label: label || 'Untitled', created: new Date().toISOString(), insideZones: [] };
  save();
  res.json({ id, url: `${req.protocol}://${req.get('host')}/track/${id}` });
});

app.get('/api/links', (req, res) => {
  const latestPerLink = {};
  for (const loc of db.locations) {
    if (!latestPerLink[loc.linkId] || loc.timestamp > latestPerLink[loc.linkId].timestamp) {
      latestPerLink[loc.linkId] = loc;
    }
  }
  const result = Object.entries(db.links).map(([id, link]) => ({
    id, label: link.label, created: link.created,
    insideZones: link.insideZones || [],
    latest: latestPerLink[id] || null
  }));
  res.json(result);
});

app.delete('/api/links/:id', (req, res) => {
  delete db.links[req.params.id];
  db.locations = db.locations.filter(l => l.linkId !== req.params.id);
  save();
  res.json({ ok: true });
});

app.get('/track/:id', (req, res) => {
  if (!db.links[req.params.id]) return res.status(404).send('Link not found');
  res.sendFile(path.join(__dirname, 'public', 'track.html'));
});

app.post('/api/location/:linkId', (req, res) => {
  if (!db.links[req.params.linkId]) return res.status(404).json({ error: 'Link not found' });
  const { lat, lng, accuracy, speed, name } = req.body;
  if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required' });
  const entry = {
    linkId: req.params.linkId, name: name || 'Anonymous', lat, lng,
    accuracy: accuracy || null, speed: speed || null, timestamp: new Date().toISOString()
  };
  db.locations.push(entry);
  if (db.locations.length > 10000) db.locations = db.locations.slice(-5000);
  checkZones(req.params.linkId, lat, lng, entry.name);
  save();
  res.json({ ok: true });
});

app.get('/api/locations/:linkId', (req, res) => {
  const maxAge = parseInt(req.query.maxAge) || 300;
  const cutoff = new Date(Date.now() - maxAge * 1000).toISOString();
  const result = db.locations.filter(l => l.linkId === req.params.linkId && l.timestamp >= cutoff);
  res.json(result);
});

app.get('/dashboard*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Link Tracker running on port ${PORT}`);
});
