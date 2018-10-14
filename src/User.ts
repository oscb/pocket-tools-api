import { Document, Schema, model } from 'mongoose';

const emailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

const isKindleEmail = (email: string): boolean => {
  return emailRegex.test(String(email).toLowerCase()) && String(email).toLowerCase().endsWith('@kindle.com');
}

export enum Subscriptions {
  Free = "Free",
  EarlyAccess = "Early Access",
  Premium  = "Premium",
  Admin = "Admin"
}

export interface User {
  username: string;
  token: string;
  active: boolean;
  subscription: Subscriptions;
  credits: number;
  email?: string;
  kindle_email?: string;
}

export interface UserDocument extends User, Document { }

const UserSchema = new Schema({
  username: { 
    type: String,
    required: true 
  },
  token: { 
    type: String,
    required: true 
  },
  active: { 
    type: Boolean,
    required: true 
  },
  subscription: { 
    type: String,
    required: true,
    enum: Object.keys(Subscriptions).map(x => Subscriptions[x])
  },
  credits: { 
    type: Number,
    required: true,
    min: 0
  },
  email: {
    type: String,
    validate: emailRegex
  },
  kindle_email: {
    type: String,
    validate: {
      validator: val => isKindleEmail(val),
      msg: `{VALUE} not a valid kindle email`
    }
  }
})

export const UserModel = model<UserDocument>('User', UserSchema);
