// Load dot env first!
import bodyParser from 'body-parser';
import cors from 'cors';
import express from "express";
import mongoose from 'mongoose';
import passport from "passport";
import bearer from "passport-http-bearer";
import AuthController from './AuthController';
import DeliveryController from './DeliveryController';
import PaymentProcessorController from './PaymentProcessorController';
import SubscriptionController from './SubscriptionController';
import { UserModel } from './User';
import UserController from './UserController';


mongoose.connect(process.env.MONGODB_HOST || 'mongodb://Luna.local/PocketTools');


passport.use(new bearer.Strategy(
  async (token, done) => {
    try {
      let user = await UserModel.findOne({ token: token });
      if (!user) 
      { 
        return done(null, false); 
      }

      // Test Pocket Token with a simple query
      // Not sure if I wanna do this, might deplete all the queries
      // const pocket = new Pocket({
      //   consumer_key: process.env.POCKET_KEY, 
      //   access_token: token
      // });
      // let resp = await pocket.get({ count: 1 });
      // if (resp.error) {
      //   console.log(resp.error);
      //   return done(resp.error, false);
      // }

      return done(
        null, 
        user, 
        { 
          scope: 'read', 
          message: 'Hi' 
        });
    } catch (error) {
      console.log(error);
      return done(error);
    }
  }
));

const App = express();
App.use(cors());
App.use(bodyParser.urlencoded({ extended: true }));
// Webhooks need to be before we initialize the passport to prevent having that auth
App.use('/webhooks/stripe', PaymentProcessorController);
App.use(bodyParser.json());
App.use(passport.initialize());
App.use('/users', UserController);
App.use('/deliveries', DeliveryController);
App.use('/auth', AuthController);
App.use('/subscriptions', SubscriptionController);

export default App;