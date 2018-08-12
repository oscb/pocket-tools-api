const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const config = require('./config.json');
const User = require('./User');
const passport = require('passport');

// Get login url and req token
router.get('/', async (req, res) => {
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
router.post('/', async (req, res) => {
  let payload = {
      consumer_key: config.pocket_key,
      code: req.body.code
  };
  let resp = await fetch('https://getpocket.com/v3/oauth/authorize', 
  { 
      method: 'POST',
      body:    JSON.stringify(payload),
      headers: { 
        'charset': 'UTF-8',
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
  } 

  if (respBody.access_token != user.token) {
    user.token = respBody.access_token;
    await user.save();
  }

  res.status(200).send({
    user: user
  });
});

// Endpoint just to verify Token is still valid

router.get(
  '/verify', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    res.status(200).send();
  }
);

module.exports = router