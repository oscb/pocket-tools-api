const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: String,
  active: Boolean,
  email: String,
  kindle_email: String,
  token: String,
  type: String
}, { 
  strict: true 
});
mongoose.model('User', UserSchema);

module.exports = mongoose.model('User');