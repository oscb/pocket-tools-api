import express from "express";
import cors from 'cors';
import bodyParser from 'body-parser';
// Load dot env first!
import dotenv from 'dotenv';
let configs = dotenv.config();
console.log(configs);

import passport from "passport";
import bearer from "passport-http-bearer"; 
import UserController from './UserController';
import DeliveryController from './DeliveryController';
import AuthController from './AuthController';
import SubscriptionController from './SubscriptionController';
import { UserModel, Subscriptions } from './User';
import mongoose from 'mongoose';

mongoose.connect(process.env.MONGODB_HOST || 'mongodb://localhost/PocketTools');


passport.use(new bearer.Strategy(
  async (token, done) => {
    try {
      // TODO: Validate that user can auth to pocket?
      let user = await UserModel.findOne({ token: token });
      if (!user) 
      { 
        console.log("no user");
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
App.use(bodyParser.json());
App.use(passport.initialize());
App.use('/users', UserController);
App.use('/deliveries', DeliveryController);
App.use('/auth', AuthController);
App.use('/subscriptions', SubscriptionController);

export default App;