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
      deliveries: [],
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
    let delivery = await Delivery.findIndex(req.params.id).exec();
    if (delivery == null) {
      return res.status(500).send("There was a problem finding the delivery.");
    } 
    if (!delivery.user.equals(req.user._id)) {
      return res.status(401).send('Unauthorized');
    } 
    // TODO: remove all things from body that shouldn't be updted
    delivery = {...delivery, ...req.body};
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
    let sent = await DeliveryUtils.SendDelivery(req.user, delivery.query);
    res.status(200).send(sent);
  }
);

module.exports = router;
