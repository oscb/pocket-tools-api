import { Document, Schema, model } from 'mongoose';
import { User, UserDocument, isKindleEmail } from './User';
import { ObjectId } from 'bson';


// Interfaces

export interface Article {
  pocketId: string;
  url: string;
}

export interface Mailing {
  datetime: Date;
  articles: Article[];
}

export enum CountType {
  Count,
  Time
}

enum OrderBy {
  Newest,
  Oldest
}

enum Frequency {
  Daily,
  Weekly
}

export interface Query {
  countType: CountType;
  count: number;
  orderBy: OrderBy;
  domain?: string;
  includedTags?: string[];
  excludedTags?: string[];
  longformOnly?: boolean;
}

export interface Delivery {
  user: User | UserDocument | ObjectId | string;
  kindle_email: string;
  active: boolean;
  query: Query;
  frequency: Frequency;
  time: string;
  timezone: number;
  days?: string[];
  autoArchive: boolean;
  mailings?: Mailing[];
}

// Documents
export interface ArticleDocument extends Article, Document { }
export interface MailingDocument extends Mailing, Document { }
export interface QueryDocument extends Query, Document { }
export interface DeliveryDocument extends Delivery, Document { }

// Schemas

const ArticleSchema = new Schema({
  pocketId: String,
  url: String,
  // TODO: What else? Content?
});

const MailingSchema = new Schema({
  datetime: Date,
  articles: [ArticleSchema]
});

const DeliverySchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  kindle_email: {
    type: String,
    required: true,
    validate: {
      validator: val => isKindleEmail(val),
      msg: `{VALUE} not a valid kindle email`
    }
  },
  active: {
    type: Boolean,
    required: true,
  },
  query: {
    countType: {
      type: String,
      required: true,
      enum: Object.keys(CountType).map(x => CountType[x]),
    },
    count: {
      type: Number,
      required: true
    },
    orderBy: {
      type: String,
      required: true,
      enum: Object.keys(OrderBy).map(x => OrderBy[x]),
    },
    domain: String,
    includedTags: {
      type: [String],
      trim: true,
    },
    excludedTags: [String],
    longformOnly: Boolean
  },
  frequency: {
    type: String,
    required: true,
    enum: Object.keys(Frequency).map(x => Frequency[x]),
  },
  time: {
    type: String,
    required: true,
  },
  timezone: {
    type: Number,
    required: true,
  },
  days: {
    type: [String],
    required: false,
  },
  autoArchive: {
    type: Boolean,
    required: true,
  },
  mailings: [MailingSchema]
}, { 
  strict: true 
});

export const DeliveryModel = model<DeliveryDocument>('Delivery', DeliverySchema);