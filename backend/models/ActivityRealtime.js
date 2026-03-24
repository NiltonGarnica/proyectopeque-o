const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  userId:     { type: String, required: true, unique: true },
  email:      { type: String, required: true },
  ip:         { type: String, default: '' },
  city:       { type: String, default: '' },
  country:    { type: String, default: '' },
  page:       { type: String, default: '/' },
  firstVisit: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },
});

module.exports = mongoose.model('ActivityRealtime', activitySchema);
