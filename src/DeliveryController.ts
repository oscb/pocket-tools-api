import { Router } from "express";
import passport from 'passport';
import { Article, DeliveryDocument, DeliveryModel, Frequency, Mailing, MailingDocument } from "./Delivery";
import { ExecuteQuery, SendDelivery } from "./DeliveryManager";
import { User, UserDocument } from "./User";
import { isSuperUser } from "./UserController";
import { Types } from "mongoose";
export const router = Router();
const Pocket = require('pocket-promise');

const enum ArticleOperations {
  Favorite = 'favorite',
  Archive = 'archive',
  FavAndArchive = 'fav-and-archive'
}

const ArticleMarkers = new Map<ArticleOperations, string>([
  [ArticleOperations.Favorite, '★'],
  [ArticleOperations.Archive, '✔'],
]);

const timeslots = [
  'Dawn', // 4:00
  'Morning', // 8:00
  'Noon', // 12:00
  'Afternoon', // 16:00
  'Evening', // 20:00
  'Midnight', // 24:00
]

// JS Date Sunday = 0
enum WeekDays {
  Sunday,
  Monday,
  Tuesday,
  Wednesday,
  Thursday,
  Friday,
  Saturday,
}

router.get(
  '/', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    let userDeliveries = await DeliveryModel.find(
      { user: req.user._id }).exec();
    res.status(200).send(userDeliveries);
  }
);

/* 
 * Note: CosmosDB adapter for Mongo queries seems to be pretty limited on projections/queries in arrays
 * Queries do not seem to handle well 2 level nested arrays
 * Also, projections ($) to return only the first element that matched do not seem to work at all 
 * 
 * For now the url will include the mailing id and pocketId 
 * That way I can use the mailingId to impersonate the user and the pocketId for the op
 * 
 * TODO: Evaluate changing queries to another of the interfaces CosmosDB exposes: SQL or GraphQL
 */
router.get(
  '/mailings/:sentid/articles/:articleid/:operation',
  async (req, res) => {
    let delivery: DeliveryDocument | null;
    try {
      delivery = await DeliveryModel.findOne(
        { '_id' : Types.ObjectId(req.params.sentid) },
        {
          'user': 1
        }
      ).populate('user').exec();
    } catch {
      return res.status(500).send("Error retrieving delivery").end();
    }
    
    if (!!!delivery) {
      return res.status(500).send('There was a problem finding the delivery.').end();
    }

    try {
      const results = await HandleArticleOperation(req.params.operation, (delivery!.user as User).token, req.params.articleid);
      return res.status(200).send(`${results.join('\n')}`);
    } catch(e) {
      return res.status(500).send(e).end();
    }
  }
);

// TODO: This requires my account due to auth... uhmmm...
router.get(
  '/sendAll',
  passport.authenticate('bearer', { session: false }), 
  async(req, res) => {
    // TODO: This can only be called from Azure directly, use admin only account maybe? or check domain from request?
    if (!isSuperUser(req.user)) {
      return res.status(403).send().end();
    }
    // 1. Transform current date into a time slot
    const today = new Date();
    const currentTimeslot = getTimeSlot(today);
    const currentDate = today.getUTCDate(); // TODO: Handle February, where day 28 is going to be 30 for montlies
    const currentDay = WeekDays[today.getUTCDay()]; // Days in JS start with sunday
    // 2. Search for timeslot deliveries in DB
    let userDeliveries = await DeliveryModel.find(
      {
        'active' : true, 
        'time': timeslots[currentTimeslot],
        $or: [
          { 'frequency' : Frequency[Frequency.Daily] },
          { 'days' : { $in : [ currentDay, currentDate ] }},
        ]
        // TODO: [Optimization] Get list of users with credits available and filter them here
      })
      .populate('user') // TODO: [Optimization] Retrieve only what I need
      .exec();

    // 3. Check if last delivery was sent > 12 hours ago
    let sentDeliveries: DeliveryDocument[] = [];
    let users: { [id: string]: UserDocument; } = { };
    for(let delivery of userDeliveries) {
      let user = delivery.user as UserDocument;
      if (user.id in users) {
        user = users[user.id];
      }

      // TODO: Not sure if ordered already...
      if (user.credits > 0) {
        if (delivery.mailings !== undefined && delivery.mailings.length > 0) {
          const lastMail = delivery.mailings[0];
          const timeSinceLast = today.getTime() - lastMail.datetime.getTime();
          // Not sending emails more than once every 12 
          if ((timeSinceLast/(1000*60*60)) < 12) {
            continue;
          }
        }
        try {
          const sent = await MakeDelivery(delivery, delivery.user as User);
          if (sent) {
            sentDeliveries.push(delivery);
            await DecreaseCredit(delivery.user as UserDocument);
          } else {
            throw "Couldn't make a delivery. Try again later.";
          }
        } catch(e) {
          // Just log the error and continue
          console.error(e);
        }
      }
    }
    return res.status(200).send(sentDeliveries);
  }
);

router.get(
  '/:id', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    let delivery: DeliveryDocument | null;
    try {
      delivery = await DeliveryModel.findById(req.params.id).exec();
    } catch(e) {
      if (e.name === 'CastError') {
        return res.status(400).send("Invalid Id");
      }
      return res.status(500).send("Error retrieving delivery");
    }
    if (delivery === null) {
      return res.status(404).send(null);
    }
    if(!isOwnDelivery(delivery, req.user)) {
      return res.status(401).send('Unauthorized');
    } 
    return res.status(200).send(delivery);
  }
);

router.post(
  '/', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    try {
      let delivery = {
        ...req.body,
        active: true,
        mailings: [],
        user: req.user._id,
      }
      delivery = await DeliveryModel.create(delivery);
      return res.status(201).send(delivery);
    } catch(e) {
      console.error(e);
      if (e.name === 'ValidationError') {
        return res.status(400).send(
        {
          message: e.message,
          errors: Object
            .keys(e.errors)
            .reduce((map, obj) => map[obj] = e.errors[obj].message, {})
        });
      } else {
        return res.status(500).send({ message: e.message });
      }
    }
  }
);

router.put(
  '/:id', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    let delivery: DeliveryDocument | null;
    try {
      delivery = await DeliveryModel.findById(req.params.id).exec();
    } catch {
      return res.status(500).send("Error retrieving delivery");
    }
    if (delivery === null) {
      return res.status(404).send();
    } 
    if(!isOwnDelivery(delivery, req.user)) {
      return res.status(401).send('Unauthorized');
    } 
    // TODO: remove all things from body that shouldn't be updted
    delivery = {...delivery, ...req.body};

    try {
      delivery = await DeliveryModel.findByIdAndUpdate(
        req.params.id, 
        req.body, 
        { 
          new: true, 
          runValidators: true 
        })
        .exec();
      return res.status(200).send(delivery);
    } catch (e) {
      console.error(e);
      if (e.name === 'ValidationError') {
        return res.status(400).send({
          message: e.message,
          errors: Object
            .keys(e.errors)
            .reduce((map, obj) => { 
              map[obj] = e.errors[obj].message; 
              return map }, 
            {})
        });
      } else {
        return res.status(500).send({
          message: e.message
        });
      }
    }
  }
);

router.delete(
  '/:id', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    let delivery: DeliveryDocument | null;
    try {
      delivery = await DeliveryModel.findById({_id: req.params.id}).exec();
    } catch {
      return res.status(500).send("Error retrieving delivery");
    }
    if (delivery === null) {
      return res.status(404).send();
    }  
    if(!isOwnDelivery(delivery, req.user)) {
      return res.status(401).send('Unauthorized');
    } 

    await DeliveryModel.findByIdAndRemove({_id: req.params.id}).exec();
    return res.status(200).send('Deleted');
  }
);

router.get(
  '/:id/execute', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    let delivery: DeliveryDocument | null;
    try {
      delivery = await DeliveryModel.findById({_id: req.params.id}).exec();
    } catch {
      return res.status(500).send("Error retrieving delivery");
    }

    if (delivery === null) {
      return res.status(404).send();
    }  
    if(!isOwnDelivery(delivery, req.user)) {
      return res.status(401).send('Unauthorized');
    } 
    let articles = await ExecuteQuery(req.user, delivery.query);
    // TODO: Strip down all the things I don't need from the article before sending
    return res.status(200).send(articles);
  }
);

router.get(
  '/:id/deliver', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    let delivery: DeliveryDocument | null;
    try {
      delivery = await DeliveryModel.findById({_id: req.params.id}).populate('user').exec();
    } catch {
      return res.status(500).send("Error retrieving delivery");
    }

    if (delivery === null) {
      return res.status(404).send();
    }  
    if(!isOwnDelivery(delivery, req.user)) {
      return res.status(401).send('Unauthorized');
    }
    if(req.user.credits <= 0) {
      return res.status(400).send('No more credits available!');
    }
    
    try {
      const sent = await MakeDelivery(delivery, req.user);
      if (sent) {
        await DecreaseCredit(delivery.user as UserDocument);
        return res.status(200).send("Delivery Sent!");
      } else {
        throw 'Couldn\'t send a delivery. Please try again later';
      }
    } catch(err) {
      console.error(err);
      return res.status(500).send(`Delivery couldn't be sent! Error: ${err}`);
    }
  }
);

async function MakeDelivery(delivery: DeliveryDocument, user: User) {
  let articles = await ExecuteQuery(user, delivery.query);
  let savedArticles: Article[] = []
  for (let article of articles) {
    savedArticles.push({
      pocketId: article.item_id,
      url: article.resolved_url,
      title: article.resolved_title
    });
  }
  delivery.mailings = (delivery.mailings !== undefined) ? delivery.mailings : [];
  delivery.mailings.push({
    datetime: new Date(),
    articles: savedArticles
  });
  let saved = await delivery.save();
  if (!saved) {
    throw 'Cannot save delivery to database!';
  }
  let sent = await SendDelivery(delivery.kindle_email, delivery._id.toString(), articles);
  if (sent && delivery.autoArchive) {
    try {
      const pocket = new Pocket({
        consumer_key: process.env.POCKET_KEY, 
        access_token: (delivery.user as User).token
      });
      await Promise.all(savedArticles.map(article => pocket.archive({ item_id: article.pocketId })));
    } catch(e) {
      console.error(e);
    }
  }
  return sent;
}

async function DecreaseCredit(user: UserDocument) {
  user.credits -= 1;
  let userSaved = await user.save();
  return userSaved;
}

async function HandleArticleOperation(operation: string, pocketUserToken: string, articleId: string): Promise<string[]> {
  let operationsDone: string[] = [];
  if (!!!operation) {
    throw "No operation to do!";
  }
  const operations = operation === ArticleOperations.FavAndArchive ? [ArticleOperations.Archive, ArticleOperations.Favorite] : [operation];
  const pocket = new Pocket({
    consumer_key: process.env.POCKET_KEY, 
    access_token: pocketUserToken,
  });
  for (let op of operations) {
    let resp;
    switch(op)
    {
      case ArticleOperations.Archive:
        resp = await pocket.archive({ item_id: articleId });
        break;
      case ArticleOperations.Favorite:
        resp = await pocket.favorite({ item_id: articleId });
        break;
      default:
        throw `Operation ${operation} not supported`;
    }
    if (resp.status != 1) {
      operationsDone.push(`╳ ${articleId}: Operation ${op} failed! Try again later`);
    } else {
      // TODO: This could be so much nicer, but I cannot safely get the right article from cosmosdb :(
      operationsDone.push(`${ArticleMarkers.get(op)} ${op}d`);
    }
  }
  return operationsDone;
}

function isOwnDelivery(delivery: DeliveryDocument, user: UserDocument): boolean {
  return (
    delivery !== undefined && 
    delivery !== null && 
    (delivery.user.toString() === user._id.toString() || 
    ((delivery.user as UserDocument)._id !== undefined && (delivery.user as UserDocument)._id.toString() === user._id.toString()))
    );
}

function getTimeSlot(currentTime: Date) {
  const nSlots = timeslots.length;
  const timeSlotInterval = 24 / nSlots;
  const hours = currentTime.getUTCHours();
  return Math.floor(hours / timeSlotInterval) % nSlots;
}

export default router;
