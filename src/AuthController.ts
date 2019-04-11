import { Router } from "express";
import passport from 'passport';
import { User, UserModel, Subscriptions } from "./User";
import * as agent from "superagent";
import { Constants } from "./Constants";

export const router = Router();

// Get login url and req token
router.get('/', async (req, res) => {
  const redirect_url = req.query.redirect_uri;
  let payload = {
      consumer_key: process.env.POCKET_KEY,
      redirect_uri: redirect_url
  };
  try {
    let resp = await agent
      .post('https://getpocket.com/v3/oauth/request')
      .timeout(1000)
      .set({ 
        'Content-Type': 'application/json',
        'X-Accept': 'application/json' 
      })
      .send(payload);
    if (resp.status === 200) {
      let respBody = resp.body;
      res.status(200).send({
        login_url: `https://getpocket.com/auth/authorize?request_token=${respBody.code}&redirect_uri=${redirect_url}`,
        code: respBody.code
      });
    } else {
      res.status(500).send({
        error: 'Couldn\'t connect to pocket.'
      })
    }
  } catch(e) {
    console.error(e);
    res.status(500).send({
      error: `Couldn't connect to pocket. ${e}`
    });
  }
});

// Receives a req token and converts to access token
router.post('/', async (req, res) => {
  let payload = {
      consumer_key: process.env.POCKET_KEY,
      code: req.body.code
  };
  
  let resp = await agent
    .post('https://getpocket.com/v3/oauth/authorize')
    .timeout(1000)
    .set({ 
      'charset': 'UTF-8',
      'Content-Type': 'application/json',
      'X-Accept': 'application/json' 
    })
    .send(payload);

  let respBody = resp.body;

  let user = await UserModel.findOne({'username': respBody.username}).exec();
  // Create user in DB if any
  if (!user) {
    user = await UserModel.create({
      username: respBody.username,
      active: true,
      token: respBody.access_token,
      credits: Constants.DefaultUserCredits,
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

export default router;