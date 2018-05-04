const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const config = require('./config.json');
const User = require('./User');
const passport = require('passport');

// Get login url and req token
router.get('/login', async (req, res) => {
  const redirect_url = 'https://getpocket.com/'
  let payload = {
      consumer_key: config.pocket_key,
      redirect_uri: redirect_url
  };
  var resp = await fetch('https://getpocket.com/v3/oauth/request', 
  { 
      method: 'POST',
      body:    JSON.stringify(payload),
      headers: { 'X-Accept': 'application/json' },
  });

  res.status(200).send({
    login_url: `https://getpocket.com/auth/authorize?request_token=${resp.code}&redirect_uri=${redirect_url}`,
    token: resp.code
  });
});

// Receives a req token and converts to access token
router.post('/login', async (req, res) => {
  let payload = {
      consumer_key: config.pocket_key,
      code: req.code
  };
  var resp = await fetch('https://getpocket.com/v3/oauth/authorize', 
  { 
      method: 'POST',
      body:    JSON.stringify(payload),
      headers: { 'X-Accept': 'application/json' },
  });
  res.status(200).send(resp);
});

// Gets all users
// TODO: Remove this eventually
router.get(
  '/', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    if (req.user.type != 'admin') return res.status(401).send();
    let allUsers = await User.find({}).exec();
    res.status(200).send(allUsers);
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
    // TODO: Add validations
    let user = {
      username: req.body.username,
      active: true,
      email: req.body.email,
      kindle_email: req.body.kindle_email,
      token: req.body.token,
      type: req.body.type
    };
    user = await User.create(user);
    res.status(201).send(user);
  }
);

router.put(
  '/:id', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    if (req.user._id != req.params.id) return res.status(401).send();
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
    res.status(200).send(`User ${user.username} deleted`);
  }
);

module.exports = router;