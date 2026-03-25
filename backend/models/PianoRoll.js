const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema({
  id:       String,
  pitch:    Number,
  start:    Number,
  duration: Number,
  velocity: { type: Number, default: 0.8 },
}, { _id: false });

const PianoRollSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  nombre: { type: String, default: 'Sin nombre' },
  bpm:    { type: Number, default: 120 },
  notes:  [NoteSchema],
}, { timestamps: true });

module.exports = mongoose.model('PianoRoll', PianoRollSchema);
