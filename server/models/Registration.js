const mongoose = require("mongoose");

const RegistrationSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },

  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
  },

  attended: {
    type: Boolean,
    default: false,
  },

  certificateGenerated: {
    type: Boolean,
    default: false,
  },

  registeredAt: {
    type: Date,
    default: Date.now,
  },
  qrCode: String,
});

module.exports = mongoose.model("Registration", RegistrationSchema);
