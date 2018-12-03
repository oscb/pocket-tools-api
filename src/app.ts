import express from "express";
import cors from 'cors';
import bodyParser from 'body-parser';
import passport from "passport";
import bearer from "passport-http-bearer"; 
import dotenv from 'dotenv';
import UserController from './UserController';
import DeliveryController from './DeliveryController';
import AuthController from './AuthController';
import { UserModel, Subscriptions } from './User';
import mongoose from 'mongoose';

// TODO: Config
mongoose.connect('mongodb://localhost/PocketTools');

dotenv.config();

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

export default App;