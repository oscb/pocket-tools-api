var express = require('express');
var app = express();
var db = require('./db');

var UserController = require('./UserController');
var DeliveryController = require('./DeliveryController');

app.use('/users', UserController);
app.use('/deliveries', DeliveryController);

module.exports = app;