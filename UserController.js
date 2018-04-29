const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const config = require('./config.json');
const User = require('./User');

router.use(bodyParser.urlencoded({ extended: true }));
router.use(bodyParser.json());

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
router.get('/', async (req, res) => {
  let allUsers = await User.find({})
  res.status(200).send(allUsers);
});

router.get('/:id', async (req, res) => {
  let user = await User.findById(req.params.id); 
  res.status(200).send(user);
});

// Creates a new user
router.post('/', async (req, res) => {
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
});

router.put('/:id', async (req, res) => {
  let user = await User.findByIdAndUpdate(req.params.id, req.body, {new: true});
  res.status(200).send(user);
});

// Delete an user
router.delete('/:id', async (req, res) => {
  let user = await User.findByIdAndRemove(req.params.id);
  res.status(200).send(`User ${user.username} deleted`);
});

module.exports = router;