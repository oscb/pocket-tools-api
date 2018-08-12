const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const config = require('./config.json');
const User = require('./User');
const passport = require('passport');

const emailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

function validateEmail(email) {
  return emailRegex.test(String(email).toLowerCase());
}

function validateKindleEmail(email) {
  return this.validateEmail(email) && String(email).toLowerCase().endsWith('@kindle.com');
}

function validateUser(user, res) {
  if (!validateEmail(user.email)) {
    res.status(400).send({ 'error': 'Invalid email.'});
    return false;
  }
  if (!validateKindleEmail(user.kindle_email)) {
    res.status(400).send({ 'error': 'Invalid Kindle email.'});
    return false;
  }
  return true;
}

// Gets all users
// TODO: Remove this eventually
router.get(
  '/me', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    let user = await User.findById(req.user._id).exec();
    res.status(200).send(user);
  }
);

router.get(
  '/:id', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    if (req.user._id != req.params.id) return res.status(401).send();
    let user = await User.findById(req.params.id).exec(); 
    res.status(200).send(user);
  }
);

// Creates a new user
router.post(
  '/', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    if (req.user.type != 'admin') return res.status(401).send();
    let user = {
      username: req.body.username,
      active: true,
      email: req.body.email,
      kindle_email: req.body.kindle_email,
      token: req.body.token,
      type: req.body.type
    };
    if (!validateUser(user)) {
      return;
    }

    user = await User.create(user);
    res.status(201).send(user);
  }
);

router.put(
  '/:id', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    if (req.user._id != req.params.id) return res.status(401).send();
    if (req.body.kindle_email !== undefined) {
      if (!validateKindleEmail(user.kindle_email)) {
        res.status(400).send({ 'error': 'Invalid Kindle email.'});
        return false;
      }
    }

    if (req.body.email !== undefined) {
      if (!validateEmail(user.email)) {
        res.status(400).send({ 'error': 'Invalid email.'});
        return false;
      }
    }

    let user = await User.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true })
      .exec();
    res.status(200).send(user);
  }
);

// Delete an user
router.delete(
  '/:id', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    if (req.user._id != req.params.id) return res.status(401).send();
    let user = await User.findByIdAndRemove(req.params.id).exec();
    // TODO: Remove Deliveries too
    // let deliveries = 
    res.status(200).send(`User ${user.username} deleted`);
  }
);

module.exports = router;