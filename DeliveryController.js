const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const config = require('./config.json');
const mongoose = require('mongoose');
const User = require('./User');
const Delivery = require('./Delivery');
const DeliveryUtils = require('./DeliveryManager');
const passport = require('passport');
const Pocket = require('pocket-promise');

router.get(
  '/', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    let userDeliveries = await Delivery.find(
      { user: req.user._id }).exec();
    res.status(200).send(userDeliveries);
  }
);

router.get(
  '/:id', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    let delivery = await Delivery.findById(req.params.id).exec();
    if (!delivery.user.equals(req.user._id)) {
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
    delivery = await Delivery.create(delivery);
    res.status(201).send(delivery);
  }
);

router.put(
  '/:id', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    let delivery = await Delivery.findById(req.params.id).exec();
    if (delivery == null) {
      return res.status(500).send("There was a problem finding the delivery.");
    } 
    if (!delivery.user.equals(req.user._id)) {
      return res.status(401).send('Unauthorized');
    } 
    // TODO: remove all things from body that shouldn't be updted
    delivery = {...delivery, ...req.body};
    delivery = await Delivery.findByIdAndUpdate(req.params.id, req.body, { new: false }).exec();
    res.status(200).send(delivery);
  }
);

// Delete an user
router.delete(
  '/:id', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    // TODO: Check first if user can delete, soft delete
    let delivery = await Delivery.findById({_id: req.params.id}).exec();
    if (delivery == null) {
      return res.status(500).send('There was a problem finding the delivery.');
    }  
    if (!delivery.user.equals(req.user._id)) {
      return res.status(401).send('Unauthorized');
    } 
    await Delivery.findByIdAndRemove({_id: req.params.id}).exec();
    res.status(200).send('Deleted');
  }
);

router.get(
  '/:id/execute', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    let delivery = await Delivery.findById({_id: req.params.id}).exec();
    if (delivery == null) {
      return res.status(500).send('There was a problem finding the delivery.');
    }  
    if (!delivery.user.equals(req.user._id)) {
      return res.status(401).send('Unauthorized');
    } 
    let articles = await DeliveryUtils.ExecuteQuery(req.user, delivery.query);
    res.status(200).send(articles);
  }
);

router.get(
  '/:id/deliver', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    let delivery = await Delivery.findById({_id: req.params.id}).exec();
    if (delivery == null) {
      return res.status(500).send('There was a problem finding the delivery.');
    }  
    if (!delivery.user.equals(req.user._id)) {
      return res.status(401).send('Unauthorized');
    } 
    let articles = await DeliveryUtils.ExecuteQuery(req.user, delivery.query);
    let savedArticles = []
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

    let sent = await DeliveryUtils.SendDelivery(delivery.kindle_email, articles);
    if (sent) {
      let status = await delivery.save();
      if (status) {
        res.status(200).send("Delivery Sent!");
        return;
      }
    }
    res.status(500).send("Delivery Couldn't be sent!");
  }
);

router.get(
  '/mailings/:sentid/:operation',
  async (req, res) => {
    let delivery = await Delivery.findOne(
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
        consumer_key: config.pocket_key, 
        access_token: delivery.user.token
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
    res.status(200).send(`Articles archived!`);
  }
);


router.get(
  '/articles/:articleid/:operation',
  async (req, res) => {
    let delivery = await Delivery.findOne(
      { 'mailings.articles._id' : req.params.articleid }, 
      { 
        'user': 1,
        'mailings.articles.$': 1 
      }
    ).populate('user').exec();
    
    if (delivery == null) {
      return res.status(500).send('There was a problem finding the delivery.');
    }
    
    const pocket = new Pocket({
      consumer_key: config.pocket_key, 
      access_token: delivery.user.token
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
    res.status(200).send(`Article archived!`);
  }
);

module.exports = router;
