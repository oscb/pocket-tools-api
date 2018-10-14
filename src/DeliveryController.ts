import { Router, Request } from "express";
import passport from 'passport';
import { DeliveryModel } from "./Delivery";
import { ExecuteQuery, SendDelivery } from "./DeliveryManager";
import * as Pocket from 'pocket-promise';
import { User } from "./User";

export const router = Router();

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
  '/:id', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    let delivery = await DeliveryModel.findById(req.params.id).exec();
    if (delivery === undefined) {
      return res.status(404).send(null);
    }
    if (delivery !== undefined && !(delivery!.user === req.user._id)) {
      return res.status(401).send('Unauthorized');
    } 
    return res.status(200).send(delivery);
  }
);

router.post(
  '/', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    let delivery = {
      ...req.body,
      active: true,
      mailings: [],
      user: req.user._id,
      
      // name: req.body.name,
      // email: req.body.email,
      // query: req.body.query, // TODO: Validate
      // frequency: req.body.frequency, 
      // time: req.body.time,
      // day: req.body.day,
      // timezone: req.body.timezone,
    }
    delivery = await DeliveryModel.create(delivery);
    delivery = SanitizeDelivery(delivery);
    res.status(201).send(delivery);
  }
);

router.put(
  '/:id', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    let delivery = await DeliveryModel.findById(req.params.id).exec();
    if (delivery == null) {
      return res.status(500).send("There was a problem finding the delivery.");
    } 
    if (!delivery.user === req.user._id) {
      return res.status(401).send('Unauthorized');
    } 
    // TODO: remove all things from body that shouldn't be updted
    delivery = {...delivery, ...req.body};
    delivery = SanitizeDelivery(delivery);

    delivery = await DeliveryModel.findByIdAndUpdate(req.params.id, req.body, { new: true }).exec();
    return res.status(200).send(delivery);
  }
);

// TODO: Move elsewhere 

const SanitizeDelivery = (delivery) => {
  // TODO: Verify emails
  // TODO: Verify all other
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
    let delivery = await DeliveryModel.findById({_id: req.params.id}).exec();
    if (delivery == null) {
      return res.status(500).send('There was a problem finding the delivery.');
    }  
    if (!delivery.user === req.user._id) {
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
    let delivery = await DeliveryModel.findById({_id: req.params.id}).exec();
    if (delivery == null) {
      return res.status(500).send('There was a problem finding the delivery.');
    }  
    if (!delivery.user === req.user._id) {
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
    let delivery = await DeliveryModel.findById({_id: req.params.id}).exec();
    if (delivery == null) {
      return res.status(500).send('There was a problem finding the delivery.');
    }  
    if (!delivery.user === req.user._id) {
      return res.status(401).send('Unauthorized');
    } 
    let articles = await ExecuteQuery(req.user, delivery.query);
    let savedArticles: any[] = []
    for (let article of articles) {
      savedArticles.push({
        pocketId: article.item_id,
        url: article.resolved_url
      });
    }
    let n = delivery.mailings.push({
      datetime: new Date(),
      articles: savedArticles
    });

    savedArticles = delivery.mailings[n-1].articles;
    for (let i = 0; i < savedArticles.length; i++) {
      articles[i].id = savedArticles[i].id;
    }

    let sent = await SendDelivery(delivery.kindle_email, articles);
    if (sent) {
      let status = await delivery.save();
      if (status) {
        res.status(200).send("Delivery Sent!");
        return;
      }
    }
    return res.status(500).send("Delivery Couldn't be sent!");
  }
);

router.get(
  '/mailings/:sentid/:operation',
  async (req, res) => {
    let delivery = await DeliveryModel.findOne(
      { 'mailings._id' : req.params.sentid }, 
      { 
        'user': 1,
        'mailings.$': 1 
      }
    ).populate('user').exec();
    if (delivery == null) {
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
    let delivery = await DeliveryModel.findOne(
      { 'mailings.articles._id' : req.params.articleid }, 
      { 
        'user': 1,
        'mailings.articles.$': 1 
      }
    ).populate('user').exec();

    // TODO: Validate operation
    
    if (delivery == null) {
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

router.get(
  '/sendAll',
  async(req, res) => {
    // 1. Transform current date into a time slot

    
  }
);

const timeslots = [
  '2:00',
  '6:00',
  '10:00',
  '14:00',
  '18:00',
  '22:00'
]

function getTimeSlot(currentTime) {
  const nSlots = 6;
  const startTimeSlot = 2;
  const timeSlotInterval = 4;

  const hours = (currentTime.getHours() - startTimeSlot) % 24;
  const minutes = currentTime.getHours();

  for (let i = 0; i < nSlots; i++) {
    let limit = i * timeSlotInterval;
    if (hours < limit) {
      if (hours === limit && minutes > 0) {
        return i++;
      } else {
        return i;
      }
    }
  }
  return 0;
}

export default router;
