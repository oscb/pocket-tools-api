const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const config = require('./config.json');
const mongoose = require('mongoose');
const User = require('./User');
const Delivery = require('./Delivery');

router.use(bodyParser.urlencoded({ extended: true }));
router.use(bodyParser.json());

function getUser(req) {
  return User.findOne({token: req.headers.authorization}).exec();
}

router.get('/', async (req, res) => {
  let user = await getUser(req);
  if (user === null) {
    return res.status(400).send("No user found");
  } 
  let userDeliveries = await Delivery.find(
    {user: new mongoose.Schema.ObjectId(user._id)}).exec();
  res.status(200).send(userDeliveries);
});

// router.get('/:id', async (req, res) => {
//   // TODO: Handle nicer this validation of only seeing things for this user
  
//   let delivery = deliveries.find((x) => x.id == id);
//   return res.status(200).send(delivery);
// });

router.post('/', async (req, res) => {
  // TODO: validate
  let user = await getUser(req);
  if (user === null) {
    return res.status(400).send("No user found");
  } 

  let delivery = {
    ...req.body,
    active: true,
    deliveries: [],
    user: new mongoose.Schema.ObjectId(user._id),
    
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
});

router.put('/:id', function (req, res) {
  let delivery = deliveries.findIndex(req.params.id);
  if (delivery == null) {
    res.status(500).send("There was a problem finding the delivery.");
  } else {
    // TODO: Validation
    delivery = {...delivery, ...req.body};
    res.status(200).send(delivery);
  }
});

// Delete an user
router.delete('/:id', function(req, res) {
  let delivery = deliveries.findIndex(req.params.id);
  if (delivery == null) {
    res.status(500).send("There was a problem finding the delivery.");
  } else {
    // TODO: Validation
    users.splice(req.params.id, 1);
    res.status(200).send("Deleted");
  }
});

router.post('/:id/execute', function(req, res) {
  let delivery = deliveries.findIndex(req.params.id);
  if (delivery == null) {
    res.status(500).send("There was a problem finding the delivery.");
  } else {
    
  }
});

// router.post('/:id/deliver', function(req, res) {
//   // TODO: validate, this can only run from the server itself
//   let delivery = deliveries.findIndex(req.params.id);
//   if (delivery == null) {
//     res.status(500).send("There was a problem finding the delivery.");
//   } else {
    
//   }
// });

// router.post('/:id/deliver', function(req, res) {
//   // TODO: validate, this can only run from the server itself
//   let delivery = deliveries.findIndex(req.params.id);
//   if (delivery == null) {
//     res.status(500).send("There was a problem finding the delivery.");
//   } else {
    
//   }
// });

module.exports = router;
