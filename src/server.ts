import dotenv from 'dotenv';
dotenv.config();
import App from "./app";

const port = process.env.PORT || 3000;

const server = App.listen(port, function(err) {
  if (err) {
    return console.log(err)
  }
  console.log('Express server listening on port ' + port);
});

export default server;