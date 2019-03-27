import { Router } from "express";
import passport from 'passport';
import { DeliveryDocument, DeliveryModel, Article } from "./Delivery";
import { ExecuteQuery, SendDelivery } from "./DeliveryManager";
import { User, UserDocument } from "./User";

export const router = Router();

const Pocket  = require('pocket-promise');

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
    
    if (delivery === null || delivery === undefined) {
      return res.status(500).send('There was a problem finding the delivery.');
    }

    if(delivery.mailings === undefined) {
      return res.status(500).send('There was a problem finding the delivery.');
    }

    for(let article of delivery.mailings[0].articles) {
      const pocket = new Pocket({
        consumer_key: process.env.POCKET_KEY, 
        access_token: (delivery.user as User).token
      });
      let operations = req.params.operation.toLowerCase() === 'fav-and-archive' ? ['favorite', 'archive'] : [req.params.operation.toLowerCase()];
      for (let op of operations) {
        let resp;
        switch(op)
        {
          case "archive":
            resp = await pocket.archive({ item_id: article.pocketId });
            break;
          case "favorite":
            resp = await pocket.favorite({ item_id: article.pocketId });
            break;
          default:
            res.status(500).send(`Operation ${op} not supported`);
        }
        if (resp.status != 1) {
          res.status(500).send('Archive failed! Try again later.');
          return;
        }
      }
    }
    // TODO: Better Response for Kindle viz
    return res.status(200).send(`Articles archived!`);
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
      return res.status(500).send("Error retrieving delivery");
    }

    // TODO: Validate operation
    if (delivery === null || delivery === undefined) {
      return res.status(500).send('There was a problem finding the delivery.');
    }

    if(delivery.mailings === undefined) {
      return res.status(500).send('There was a problem finding the delivery.');
    }
    
    const pocket = new Pocket({
      consumer_key: process.env.POCKET_KEY, 
      access_token: (delivery.user as User).token
    });
    let articleId = delivery.mailings[0].articles[0].pocketId;
    let operations = req.params.operation.toLowerCase() === 'fav-and-archive' ? ['favorite', 'archive'] : [req.params.operation.toLowerCase()];
    for (let op of operations) {
      let resp;
      switch(op)
      {
        case "archive":
          resp = await pocket.archive({ item_id: articleId });
          break;
        case "favorite":
          resp = await pocket.favorite({ item_id: articleId });
          break;
        default:
          res.status(500).send(`Operation ${op} not supported`);
      }
      if (resp.status != 1) {
        res.status(500).send('Archive failed! Try again later.');
        return;
      }
    }
    // TODO: Better Response for Kindle viz
    return res.status(200).send(`Article ${req.params.operation}!`);
  }
);

// TODO: This requires my account due to auth... uhmmm...
const SendAll = router.get(
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
          }
        } catch(e) {
          // Just log the error and continue
          console.error(e);
        }
      }
    }
    
    // 6. Return list of deliveries sent
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
      // delivery = SanitizeDelivery(delivery);
      return res.status(201).send(delivery);
    } catch(e) {
      console.error(e);
      if (e.name === 'ValidationError') {
        return res.status(400).send({
          message: e.message,
          errors: Object
            .keys(e.errors)
            .reduce(
              (map, obj) => { 
                map[obj] = e.errors[obj].message; 
                return map 
              }, 
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
    // delivery = SanitizeDelivery(delivery);

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

// TODO: Move elsewhere 

const SanitizeDelivery = (delivery) => {
  // Remove Empty tags
  if (delivery.query !== undefined) {
    if (delivery.query.includedTags !== undefined) {
      delivery.query.includedTags = cleanEmpty(delivery.query.includedTags);
    }
    if (delivery.query.excludedTags !== undefined) {
      delivery.query.excludedTags = cleanEmpty(delivery.query.excludedTags);
    }
  }
  return delivery;
}

function cleanEmpty(tags) {
  var cleanTags = new Array();
  for (var i = 0; i < tags.length; i++) {
    if (tags[i] !== undefined && tags[i] !== null && tags[i].trim().length > 0 ) {
      cleanTags.push(tags[i]);
    }
  }
  return cleanTags;
}

// Delete an user
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
      }
    } catch(err) {
      console.error(err);
      return res.status(500).send(`Delivery Couldn't be sent! Error: ${err}`);
    }
    return res.status(500).send("Delivery Couldn't be sent!");
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
    return false;
  }

  let sent = await SendDelivery(delivery.kindle_email, articles);

  if (sent && delivery.autoArchive) {
    try {
      const pocket = new Pocket({
        consumer_key: process.env.POCKET_KEY, 
        access_token: (delivery.user as User).token
      });
      for (let article of savedArticles) {
        let articleStatus = await pocket.archive({ item_id: article.pocketId });
        console.log(articleStatus);
      }
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

function isOwnDelivery(delivery: DeliveryDocument, user: UserDocument): boolean {
  return (
    delivery !== undefined && 
    delivery !== null && 
    (delivery.user.toString() === user._id.toString() || 
    ((delivery.user as UserDocument)._id !== undefined && (delivery.user as UserDocument)._id.toString() === user._id.toString()))
    );
}

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

function getTimeSlot(currentTime: Date) {
  const nSlots = timeslots.length;
  const timeSlotInterval = 24 / nSlots;
  const hours = currentTime.getUTCHours();
  return Math.floor(hours / timeSlotInterval) % nSlots;
}

export default router;
