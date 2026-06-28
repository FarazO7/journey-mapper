// models/CampaignVariant.js — persists GENERATED message variants for later review.
// Phase 5 references these to assign users / run A/B tests. Storing a variant here
// NEVER sends it; this collection is a review log, not a send queue.
const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  strategy:    String,
  name:        String,
  channel:     String,
  messageType: String,           // UTILITY | MARKETING
  subjectLine: String,           // email only
  preheader:   String,           // email only
  template:    String,
  conversionMetric: String,
  expectedOpenRate: String,
  expectedCTR:      String,
  expectedRPR:      String,
  bestSendTime:     String,
  personalizationVariables: [String],
}, { _id: false });

const campaignVariantSchema = new mongoose.Schema({
  stage:        String,
  phase:        String,
  channel:      String,
  messageType:  String,
  userId:       { type: String, index: true },
  anonId:       { type: String, index: true },
  personalized: { type: Boolean, default: false },
  variants:     [variantSchema],
}, { timestamps: true });

module.exports = mongoose.model('CampaignVariant', campaignVariantSchema);
