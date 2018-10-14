import { Document, Schema, model } from 'mongoose';
import { User } from './User';


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
  Count = "Count",
  Time = "Time"
}

enum OrderBy {
  Newest = "Newest",
  Oldest = "Oldest"
}

enum Frequency {
  Daily = "Daily",
  Weekly = "Weekly"
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
  user: User | string;
  kindle_email: string;
  active: boolean;
  query: Query;
  frequency: Frequency;
  time: string;
  timezone: string;
  day: string[];
  autoArchive: boolean;
  mailings: Mailing[];
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
      enum: Object.keys(Frequency).map(x => Frequency[x]),
    },
    domain: String,
    includedTags: [String],
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
    type: String,
    required: true,
  },
  day: {
    type: [String],
    required: true,
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