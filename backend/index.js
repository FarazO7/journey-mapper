const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// Routes
const crawlerRoutes = require('./routes/crawler');
app.use('/api/crawler', crawlerRoutes);

const eventRoutes = require('./routes/events');
app.use('/api/events', eventRoutes);

const dropoffRoutes = require('./routes/dropoffs');
app.use('/api/dropoffs', dropoffRoutes);

const campaignRoutes = require('./routes/campaigns');
app.use('/api/campaigns', campaignRoutes);

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('MongoDB error:', err));

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));