const express = require('express');
const db = require('./db');
const	passport = require('passport');
const PocketStrategy = require('passport-pocket');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const methodOverride = require('method-override');

const UserController = require('./UserController');
const DeliveryController = require('./DeliveryController');
const config = require('./config.json');
const BearerStrategy = require('passport-http-bearer');
const User = require('./User');

POCKET_CONSUMER_KEY = config.pocket_key;

passport.use(new BearerStrategy(
  async (token, done) => {
    try {
      let user = await User.findOne({ token: token }); 
      if (!user) { return done(null, false); }
      return done(null, user, { scope: 'read' });
    } catch (error) {
      return done(error);
    }
  }
));

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(passport.initialize());
app.use('/users', UserController);
app.use('/deliveries', DeliveryController);

module.exports = app;