const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  channel: String,
  name: String,
  template: String,
  subjectLine: String,
  preheader: String,
  hasImage: Boolean,
  imageGuidance: String,
  conversionMetric: String,
  events: [String],
  personalizationVariables: [String]
});

const journeyStepSchema = new mongoose.Schema({
  step: String,
  phase: String,
  type: String,
  messageType: String,
  timing: String,
  description: String,
  campaigns: [campaignSchema]
});

const journeySchema = new mongoose.Schema({
  url: { type: String, required: true },
  brandName: String,
  brandTone: String,
  journeySteps: [journeyStepSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Journey', journeySchema);