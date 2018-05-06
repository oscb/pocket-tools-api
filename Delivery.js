const mongoose = require('mongoose');

const ArticleSchema = new mongoose.Schema({
  pocketId: String,
  url: String,
  // TODO: What else? Content?
});

const MailingSchema = new mongoose.Schema({
  datetime: Date,
  articles: [ArticleSchema]
});

const DeliverySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  active: Boolean,
  query: {
    domain: String,
    countType: String,
    count: Number,
    orderBy: String,
    includedTags: [String],
    excludedTags: [String],
    longformOnly: Boolean
  },
  frequency: String,
  time: String,
  day: String,
  mailings: [MailingSchema]
}, { 
  strict: true 
});
module.exports = mongoose.model('Delivery', DeliverySchema);