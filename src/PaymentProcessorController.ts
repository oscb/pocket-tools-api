import { Router } from "express";
import { Subscriptions, UserModel } from "./User";
import { updateSubscription } from "./UserController";
import Stripe = require('stripe');
import bodyParser = require("body-parser");
import { Constants } from "./Constants";

export const router = Router().use(bodyParser.raw({type: '*/*'}));
const stripe = new Stripe(process.env.STRIPE_TOKEN!);

const stripe_webhook = (endpointSecret: string, handler: (event) => Boolean | Promise<Boolean>) => {
  return async(req, res) => {
    let sig = req.headers["stripe-signature"];
    if (sig === undefined) {
      return res.status(400).end();
    }
    try {
      let event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
      if (await handler(event)) {
        res.status(200).send({received: true});
      } else {
        res.status(300).end();
      }
    } catch (err) {
      console.log(err);
      res.status(300).end();
    }
  }
}

router.post(
  '/payment/succeeded', 
  stripe_webhook(
    process.env.PAYMENT_SUCCESS_SECRET!, 
    async (event) => {
      let user = await UserModel.findOne({ 'stripe_id': event.data.object.customer  }).exec();
      if (user === null) {
        return false;
      }
      let plan: Stripe.plans.IPlan = event.data.object.lines.data[0].plan;
      let creditsPerMonth = parseInt(plan.metadata.CreditsPerMonth);
      if (creditsPerMonth > 0) {
        user.credits += creditsPerMonth;
      }
      await user.save();
      return true;
    })
);

router.post(
  '/payment/failed', 
  stripe_webhook(
    process.env.PAYMENT_FAILURE_SECRET!,
    async (event) => {
    let user = await UserModel.findOne({ 'stripe_id': event.data.object.customer  }).exec();
    if (user === null) {
      return false;
    }
    await updateSubscription(user, Subscriptions.Free);
    if (user.credits > Constants.DefaultUserCredits) {
      user.credits = Constants.DefaultUserCredits;
      await user.save();
    }
    return true;
  })
);

export default router;