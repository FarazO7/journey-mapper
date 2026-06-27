// models/Event.js — stores the raw events coming in from the SDK,
// plus a lightweight profile per visitor (contact details + consent + furthest stage).
const mongoose = require('mongoose');

// One document per user action (product_view, add_to_cart, purchase, ...).
const eventSchema = new mongoose.Schema({
  // client-generated unique id. The unique index makes resends harmless:
  // if the same event arrives twice, MongoDB rejects the duplicate so we never double count.
  dedupeId: { type: String, index: true, unique: true, sparse: true },
  anonId:   { type: String, index: true },   // anonymous visitor id (before login)
  userId:   { type: String, index: true },   // known user id (after identify)
  name:     { type: String, required: true },// e.g. 'add_to_cart'
  stage:    String,                          // journey stage label
  properties: { type: Object, default: {} }, // { productName, price, ... }
  sessionId: String,
  brandUrl:  String,                         // which site it came from
  ts: { type: Date, default: Date.now }      // when the action happened
}, { timestamps: true });

// One document per visitor — this is who the agent is allowed to message, and how.
const profileSchema = new mongoose.Schema({
  anonId: { type: String, index: true },
  userId: { type: String, index: true, unique: true, sparse: true },
  email:  String,
  phone:  String,                            // store in +91... (E.164) form
  consent: {                                 // only true channels may be messaged
    email:    { type: Boolean, default: false },
    whatsapp: { type: Boolean, default: false },
    sms:      { type: Boolean, default: false }
  },
  traits:    { type: Object, default: {} },  // { firstName, ... } for personalization
  lastStage: String,                         // furthest stage this visitor reached
  lastSeen:  { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = {
  Event:   mongoose.model('Event', eventSchema),
  Profile: mongoose.model('Profile', profileSchema)
};