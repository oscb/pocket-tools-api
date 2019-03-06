import { Router } from "express";
import Stripe = require('stripe');
import passport from 'passport';

export const router = Router();
const stripe = new Stripe(process.env.STRIPE_TOKEN!);

interface SubscriptionPlan {
  name: String;
  creditsPerMonth?: string;
  public: boolean;
  description: string;
  currency: string;
  amount: number;
  interval: string;
}

router.get(
  '/', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    let subscriptions = await getStripePlans();
    let plans: SubscriptionPlan[] = [];
    for (let plan of subscriptions) {
      let x: SubscriptionPlan = {
        name: plan.nickname !== null ? plan.nickname : '',
        creditsPerMonth: 'CreditsPerMonth' in plan.metadata ? plan.metadata['CreditsPerMonth'] : undefined,
        public: 'Public' in plan.metadata ? plan.metadata['Public'].toLowerCase() === 'true' : false,
        description: 'Description' in plan.metadata ? plan.metadata['Description'] : '',
        currency: plan.currency,
        amount: plan.amount / 100, // Ammount is in cents
        interval: plan.interval,
      }
      plans.push(x);
    }
    res.status(200).send(plans);
  }
);

export async function getStripePlans(): Promise<Stripe.plans.IPlan[]> {
  let plans = await stripe.plans.list(
    { 
      active: true, 
      product: process.env.STRIPE_PRODUCT
    });
  return plans.data;
}

export async function getStripePlan(nickname: string): Promise<Stripe.plans.IPlan | null> {
  let plans = await getStripePlans();
  for (let plan of plans) {
    if (plan.nickname === nickname) {
      return plan;
    }
  }
  return null;
}

export default router;