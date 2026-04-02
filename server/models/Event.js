const mongoose = require("mongoose");

const EventSchema = new mongoose.Schema({

  title: {
    type: String,
    required: true
  },

  description: {
    type: String
  },

  date: {
    type: String
  },

  time: {
    type: String
  },

  venue: {
    type: String
  },

  department: {
    type: String
  },

  category: {
    type: String
  },

  capacity: {
    type: Number
  },

  registered: {
    type: Number,
    default: 0
  },

  status: {
    type: String,
    default: "upcoming"
  },

  createdAt: {
    type: Date,
    default: Date.now
  }

});

module.exports = mongoose.model("Event", EventSchema);
