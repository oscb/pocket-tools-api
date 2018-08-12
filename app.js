const express = require('express');
const db = require('./db');
const cors = require('cors');
const	passport = require('passport');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const methodOverride = require('method-override');

const UserController = require('./UserController');
const DeliveryController = require('./DeliveryController');
const AuthController = require('./AuthController');
const config = require('./config.json');
const BearerStrategy = require('passport-http-bearer');
const User = require('./User');
const Pocket = require('pocket-promise');

POCKET_CONSUMER_KEY = config.pocket_key;

passport.use(new BearerStrategy(
  async (token, done) => {
    try {
      // TODO: Validate that user can auth to pocket?
      let user = await User.findOne({ token: token });
      if (!user) 
      { 
        return done(null, false); 
      }

      // Test Pocket Token with a simple query
      const pocket = new Pocket({
        consumer_key: config.pocket_key, 
        access_token: token
      });
      let resp = await pocket.get({ count: 1 });
      if (resp.error) {
        return done(resp.error, false);
      }

      return done(null, user, { scope: 'read' });
      
    } catch (error) {
      return done(error);
    }
  }
));

const app = express();
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(passport.initialize());
app.use('/users', UserController);
app.use('/deliveries', DeliveryController);
app.use('/auth', AuthController);

module.exports = app;