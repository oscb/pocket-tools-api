const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const config = require('./config.json');
const User = require('./User');
const passport = require('passport');

// Get login url and req token
router.get('/login', async (req, res) => {
  const redirect_url = req.query.redirect_uri;
  let payload = {
      consumer_key: config.pocket_key,
      redirect_uri: redirect_url
  };
  var resp = await fetch('https://getpocket.com/v3/oauth/request', 
  { 
      method: 'POST',
      body:    JSON.stringify(payload),
      // body: payload,
      headers: { 
        'Content-Type': 'application/json',
        'X-Accept': 'application/json' 
      },
  });
  if (resp.status === 200) {
    let respBody = await resp.json();
    res.status(200).send({
      login_url: `https://getpocket.com/auth/authorize?request_token=${respBody.code}&redirect_uri=${redirect_url}`,
      code: respBody.code
    });
  } else {
    res.status(500).send({
      error: 'Couldn\'t connect to pocket.'
    })
  }
});

// Receives a req token and converts to access token
router.post('/login', async (req, res) => {
  let payload = {
      consumer_key: config.pocket_key,
      code: req.body.code
  };
  let resp = await fetch('https://getpocket.com/v3/oauth/authorize', 
  { 
      method: 'POST',
      body:    JSON.stringify(payload),
      headers: { 
        'Content-Type': 'application/json',
        'X-Accept': 'application/json' 
      },
  });
  let respBody = await resp.json();

  let user = await User.findOne({'username': respBody.username}).exec();
  let hasProfile = true;
  // Create user in DB if any
  if (!user) {
    user = {
      username: respBody.username,
      active: true,
      token: respBody.access_token,
      type: 'Free'
    };
    user = await User.create(user);
    hasProfile = false;
  } 

  // Check if user has a kindle email setup
  if (user && !user.kindle_email) {
    hasProfile = false;
  }

  if (respBody.access_token != user.token) {
    user.token = respBody.access_token;
    await user.save();
  }

  res.status(200).send({
    user: user,
    hasProfile: hasProfile
  });
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