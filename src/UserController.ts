import { Router, Request } from "express";
import passport from 'passport';
import { User, UserModel, Subscriptions } from './User';

export const router = Router();

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
    if (req.user._id != req.params.id) return res.status(401).send();
    let user = await UserModel.findById(req.params.id).exec(); 
    return res.status(200).send(user);
  }
);

// Creates a new user
router.post(
  '/', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    const data = req.body as Partial<User>;
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
      credits: 0,
    });
    const userModel = await UserModel.create(user);
    return res.status(201).send(userModel);
  }
);

router.put(
  '/:id', 
  passport.authenticate('bearer', { session: false }),  
  async (req, res) => {
    const data = req.body as Partial<User>;
    let userData = req.user as User;
    if (!isSuperUser(userData)) {
      if (data.credits !== undefined || !isSelf(req)) {
        return res.status(401).send();
      }
    }

    let user = await UserModel.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: false })
      .exec();
    return res.status(200).send(user);
  }
);

router.delete(
  '/:id', 
  passport.authenticate('bearer', { session: false }), 
  async (req, res) => {
    if (req.user._id != req.params.id) return res.status(401).send();
    let user = await UserModel.findByIdAndRemove(req.params.id).exec();
    // TODO: Remove Deliveries too
    
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

export default router;