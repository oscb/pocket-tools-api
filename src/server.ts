import App from "./app";

const port = process.env.PORT || 3000;

const server = App.listen(port, function(err) {
  if (err) {
    return console.log(err)
  }

  console.log('Express server listening on port ' + port);
});

export default server;

// import mongoose from 'mongoose';
// import { UserModel } from './User';
// // import { DeliveryModel } from './Delivery';

// mongoose.connect('mongodb://localhost/PocketTools');

// (async () => {
//   const user = await UserModel.findOne();
//   console.log(user);
// })();