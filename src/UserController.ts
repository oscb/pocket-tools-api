import { Router, Request, Response } from "express";
import passport from 'passport';
import { User, UserModel, Subscriptions, StripeData, UserDocument } from './User';
import Stripe = require('stripe');
import { getStripePlan } from "./SubscriptionController";

export const router = Router();
const stripe = new Stripe(process.env.STRIPE_TOKEN!);

router.get(
  '/me', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    let user = await UserModel.findById(req.user._id).exec();
    res.status(200).send(user);
  }
);

router.get(
  '/:id', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    if (!isSelf(req)) return res.status(401).send();
    let user = await UserModel.findById(req.params.id).exec(); 
    return res.status(200).send(user);
  }
);

// Creates a new user
router.post(
  '/', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    const data = req.body as Partial<User> & Partial<StripeData>;
    let user = new UserModel({
      // Defaults
      username: '', //TODO: Verify that the API doesn't let this pass
      token: '',
      email: '',
      subscription: Subscriptions.Free,
      // Data
      ...data,
      // Overrides
      active: false,
      credits: 5,
    });
    if (!isPublicSubscriptionsOrSuperUser(user, req.user)) {
      return res.status(401).send({error: "Invalid subscription!"});
    }
    const customer = await stripe.customers.create({
      email: user.email,
      source: data.source,
      metadata: {
        'user_id': user.id,
        'pocket_user': user.username
      },
    });
    user.stripe_id = customer.id;

    try {
      let stripePlan = await getStripePlan(data.subscription!.toString());
      if (stripePlan === null) {
        return res.status(400).send({ error: `${data.subscription} is not a valid subscription.` });
      }
  
      await stripe.subscriptions.create({
        customer: customer.id,
        items: [
          {
            plan: stripePlan.id
          }
        ],
      });

      // After subscription and everything is created we save the user
      const userModel = await UserModel.create(user);
      return res.status(201).send(userModel);
    } catch(e) {
      console.error(e);
      // TODO: Remove user from stripe if it was created?
      // TODO: Cancel subscription if it was created?
      return res.status(500).send({error: e});
    }
  }
);

router.put(
  '/:id', 
  passport.authenticate('bearer', { session: false }),  
  async (req, res) => {
    const userData = req.body as Partial<User>;
    let loggedUser = req.user as User;
    if (!isSuperUser(loggedUser) && userData.credits !== undefined) {
      return res.status(401).send();
    }
    
    let user = await UserModel.findById(req.params.id);
    if (user === null) {
      return res.status(404).send();
    }

    // Update all fields in the User object
    // Cannot use destructuring to make this simpler since it removes the UserDocument methods and causes trouble with mongoose
    user.email = (userData.email)? userData.email :  user.email;
    user.kindle_email = (userData.kindle_email)? userData.kindle_email :  user.kindle_email;
    user.token = (userData.token)? userData.token :  user.token;
    user.active = (userData.active)? userData.active :  user.active;

    // Updating Subscription requires communicating to Stripe, so we do that here only if we actually got a subscription field
    if (userData.subscription !== null) {
      const stripe_id = user.stripe_id!;

      if (userData.subscription !== req.user.subscription && !isPublicSubscriptionsOrSuperUser(userData as User, req.user)) {
        return res.status(401).send({
          error: "Invalid subscription!"
        });
      }

      let stripePlan = await getStripePlan(userData.subscription!.toString());
      if (stripePlan === null) {
        return res.status(400).send({ error: `${userData.subscription} is not a valid subscription.` });
      }

      if (userData.subscription !== null) {
        try {
          // Update the User first to add the new card
          let stripeUser = await stripe.customers.retrieve(stripe_id);
          if (req.body.stripe_token !== undefined) {
            await stripe.customers.update(stripe_id, {
              source: req.body.stripe_token.id
            });
          } else {
            if (stripePlan.amount === 0 && stripeUser.sources !== undefined && stripeUser.default_source !== undefined && stripeUser.default_source !== null) {
                await stripe.customers.deleteSource(stripeUser.id, <string>stripeUser.default_source!);
            }
          }

          // Create or Update the subscription
          if (stripeUser.subscriptions.data.length > 0) {
            let subscription = stripeUser.subscriptions.data[0];
            if (subscription.plan !== undefined && subscription.plan !== null && subscription.plan.nickname !== userData.subscription!) {
              // TODO: Check if the subscription in Stripe requires updating
              await stripe.subscriptions.update(subscription.id, {
                cancel_at_period_end: false,
                items: [{
                  plan: stripePlan.id,
                }, 
                {
                  id: subscription.items.data[0].id,
                  deleted: true
                }]
              });
            }

          } else {
            await stripe.subscriptions.create({
              customer: stripe_id,
              items: [
                {
                  plan: stripePlan.id
                }
              ],
            });
          }
          user.subscription = userData.subscription!;
        } catch (e) {
          return res.status(400).send({error: e.message});
        }
      }
    }

    // Only Superusers can change this data after user is created
    if (isSuperUser(loggedUser)) {
      user.stripe_id = (userData.stripe_id)? userData.stripe_id :  user.stripe_id;
      user.credits = (userData.credits)? userData.credits :  user.credits;
      user.username = (userData.username)? userData.username :  user.username;
    }

    try {
      user = await user.save({ validateBeforeSave: true });
      return res.status(200).send(user);
    } catch(e) {
      return res.status(500).send({ error: e.message });
    }
  }
);

router.delete(
  '/:id', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    if (!isSelf(req)) return res.status(401).send();
    let user = await UserModel.findByIdAndRemove(req.params.id).exec();
    // TODO: Remove Deliveries too
    // TODO: Cancel plan
    return res.status(200).send();
  }
);

// TODO: Move this into the user class?
function isSuperUser(user: User) {
  return user.subscription === Subscriptions.Admin;
}

function isSelf(req: Request) {
  return req.user._id !== req.params.id;
}

function isPublicSubscriptionsOrSuperUser(userToChange: User, currentUser: User) {
  // Only admins can set a user to a Subscription that isn't free nor premium
  return (
    isSuperUser(currentUser) ||
    userToChange.subscription.toString() === Subscriptions.Free.toString() || 
    userToChange.subscription.toString() === Subscriptions.Premium.toString());
}

export default router;