import * as agent from "superagent";
import { Router } from "express";
import passport from 'passport';
import { User, UserModel, Subscriptions } from "./User";

export const router = Router();

// Get login url and req token
router.get('/', async (req, res) => {
  const redirect_url = req.query.redirect_uri;
  let payload = {
      consumer_key: process.env.POCKET_KEY,
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
      consumer_key: process.env.POCKET_KEY,
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

  let user = await UserModel.findOne({'username': respBody.username}).exec();
  let hasProfile = true;
  // Create user in DB if any
  if (!user) {
    user = await UserModel.create({
      username: respBody.username,
      active: true,
      token: respBody.access_token,
      credits: 10, // TODO: Default
      subscription: Subscriptions.Free
    } as User);
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

export default router;