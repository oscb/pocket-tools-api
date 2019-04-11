import { Router } from "express";
import passport from 'passport';
import { Article, DeliveryDocument, DeliveryModel } from "./Delivery";
import { ExecuteQuery, SendDelivery } from "./DeliveryManager";
import { User, UserDocument } from "./User";
export const router = Router();
const Pocket = require('pocket-promise');

enum ArticleOperations {
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

router.get(
  '/mailings/:sentid/:operation',
  async (req, res) => {
    let delivery: DeliveryDocument | null;
    try {
      delivery = await DeliveryModel.findOne(
        { 'mailings._id' : req.params.sentid }, 
        { 
          'user': 1,
          'mailings.$': 1 
        }
      ).populate('user').exec();
    } catch {
      return res.status(500).send("Error retrieving delivery");
    }
    
    if (!!!delivery || !!!delivery.mailings) {
      return res.status(500).send('There was a problem finding the delivery.');
    }

    const articleOperations = Promise.all(delivery.mailings[0].articles
      .map(article => HandleArticleOperation(req.params.operation, (delivery!.user as User).token, article)));
    try {
      const results = await articleOperations;
      const flattenedResults = results.reduce((ops:string[], cur:string[]) => ops.concat(cur), []);
      return res.status(200).send(`${flattenedResults.join('\n')}`);
    } catch(e) {
      return res.status(500).send(e).end()
    }
  }
);


router.get(
  '/articles/:articleid/:operation',
  async (req, res) => {
    let delivery: DeliveryDocument | null;
    try {
      delivery = await DeliveryModel.findOne(
        { 'mailings.articles._id' : req.params.articleid }, 
        { 
          'user': 1,
          'mailings.articles.$': 1 
        }
      ).populate('user').exec();
    } catch {
      return res.status(500).send("Error retrieving delivery").end();
    }

    if (!!!delivery || !!!delivery.mailings) {
      return res.status(500).send('There was a problem finding the delivery.').end();
    }

    try {
      const results = await HandleArticleOperation(req.params.operation, (delivery!.user as User).token, delivery.mailings[0].articles[0]);
      return res.status(200).send(`${results.join('\n')}`);
    } catch(e) {
      return res.status(500).send(e).end()
    }
  }
);

// TODO: This requires my account due to auth... uhmmm...
router.get(
  '/sendAll',
  async(req, res) => {
    // TODO: This can only be called from Azure directly, use admin only account maybe? or check domain from request?
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
          {'days': { exists: false }},
          {'days': null },
          { 'days' : {
              $in : [ currentDay, currentDate ]
          }},
        ]
        // TODO: [Optimization] Get list of users with credits available and filter them here
      })
      .populate('user') // TODO: [Optimization] Retrieve only what I need
      .exec();

    console.log(userDeliveries);

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
    res.status(200).send(sentDeliveries);
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
  let savedArticles: any[] = []
  for (let article of articles) {
    savedArticles.push({
      pocketId: article.item_id,
      url: article.resolved_url
    });
  }
  delivery.mailings = (delivery.mailings !== undefined) ? delivery.mailings : [];
  let n = delivery.mailings.push({
    datetime: new Date(),
    articles: savedArticles
  });
  // Adding the Saved ID to out articles object from pocket, 
  // so that we can use this to fill the links correctly in the template
  savedArticles = delivery.mailings[n-1].articles;
  for (let i = 0; i < savedArticles.length; i++) {
    articles[i].id = savedArticles[i].id;
  }
  let saved = await delivery.save();
  if (!saved) {
    throw 'Cannot save delivery to database!';
  }
  let sent = await SendDelivery(delivery.kindle_email, articles);
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

async function HandleArticleOperation(operation: string, pocketUserToken: string, article: Article): Promise<string[]> {
  let operationsDone: string[] = [];
  if (!!!operation || !(operation in ArticleOperations)) {
    throw `Operation ${operation} not supported`;
  }
  const enumOp = ArticleOperations[operation];
  const operations = enumOp === ArticleOperations.FavAndArchive ? [ArticleOperations.Archive, ArticleOperations.Favorite] : [enumOp];
  const pocket = new Pocket({
    consumer_key: process.env.POCKET_KEY, 
    access_token: pocketUserToken, // (delivery.user as User).token
  });
  for (let op of operations) {
    let resp;
    switch(op)
    {
      case ArticleOperations.Archive:
        resp = await pocket.archive({ item_id: article.pocketId });
        break;
      case ArticleOperations.Favorite:
        resp = await pocket.favorite({ item_id: article.pocketId });
        break;
    }
    if (resp.status != 1) {
      operationsDone.push(`╳ ${article.url}: Operation ${op} failed! Try again later`);
    } else {
      operationsDone.push(`${ArticleMarkers[op]} ${article.url}`);
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
